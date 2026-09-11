// In-process stand-in for the superlatif-app-bridge WordPress plugin (tests only).
//
// A real HTTP server with the plugin's exchange semantics - single-use codes,
// state and client binding, HMAC request authentication, signed responses -
// so the client is exercised over a real socket with real fetch, not a mock.
// `respondWith` lets a test replace the response to simulate a broken or
// hostile bridge. Never exported from the package index.

import { createHash, randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import {
  BRIDGE_HEADERS,
  bridgeSignatureMatches,
  isBridgeTimestampFresh,
  requestSigningInput,
  responseSigningInput,
  signBridgeMessage,
  type BridgeIdentityClaims,
} from "./protocol.ts";

export interface FakeClient {
  readonly secret: string;
  readonly environment: string;
}

interface StoredCode {
  readonly clientId: string;
  readonly subject: string;
  readonly stateHash: string;
  readonly expiresAt: number;
  usedAt: number | null;
}

export interface FakeResponse {
  readonly status: number;
  readonly headers?: Record<string, string>;
  readonly body: string;
}

const hash = (value: string) => createHash("sha256").update(value).digest("hex");

export class FakeWordPressBridge {
  readonly codes = new Map<string, StoredCode>();
  /** Every exchange request body received, to prove what the app does (and does not) send. */
  readonly receivedBodies: string[] = [];
  respondWith: ((defaultResponse: () => FakeResponse) => FakeResponse | Promise<FakeResponse>) | null = null;
  private server: Server | null = null;

  constructor(
    private readonly clients: Readonly<Record<string, FakeClient>>,
    private readonly now: () => Date = () => new Date(),
  ) {}

  get baseUrl(): string {
    const address = this.server?.address() as AddressInfo | null;
    if (!address) throw new Error("fake bridge not started");
    return `http://127.0.0.1:${address.port}`;
  }

  /** What the plugin's authorize step does for a logged-in user. */
  issueCode(clientId: string, subject: string, state: string, ttlSeconds = 120): string {
    const code = randomBytes(32).toString("base64url");
    this.codes.set(hash(code), {
      clientId,
      subject,
      stateHash: hash(state),
      expiresAt: this.seconds() + ttlSeconds,
      usedAt: null,
    });
    return code;
  }

  async start(): Promise<void> {
    this.server = createServer((request, response) => void this.handle(request, response));
    await new Promise<void>((resolve) => this.server?.listen(0, "127.0.0.1", resolve));
  }

  async stop(): Promise<void> {
    const server = this.server;
    this.server = null;
    if (server) {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }

  private seconds(): number {
    return Math.floor(this.now().getTime() / 1000);
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(chunk as Buffer);
    const body = Buffer.concat(chunks).toString("utf8");
    this.receivedBodies.push(body);

    const build = () => this.exchange(request, body);
    const result = this.respondWith ? await this.respondWith(build) : build();
    response.writeHead(result.status, { "content-type": "application/json", ...result.headers });
    response.end(result.body);
  }

  private error(status: number, code: string): FakeResponse {
    return { status, body: JSON.stringify({ code, message: "generic", data: { status } }) };
  }

  private exchange(request: IncomingMessage, body: string): FakeResponse {
    const url = new URL(request.url ?? "/", "http://fake");
    if (
      request.method !== "POST" ||
      url.searchParams.get("rest_route") !== "/superlatif-bridge/v1/exchange"
    ) {
      return this.error(404, "rest_no_route");
    }
    const header = (name: string) => {
      const value = request.headers[name];
      return typeof value === "string" ? value : null;
    };
    const clientId = header(BRIDGE_HEADERS.client) ?? "";
    const client = this.clients[clientId];
    const timestamp = header(BRIDGE_HEADERS.timestamp);
    if (
      !client ||
      !isBridgeTimestampFresh(timestamp, this.now()) ||
      !bridgeSignatureMatches(
        client.secret,
        requestSigningInput(timestamp, body),
        header(BRIDGE_HEADERS.signature),
      )
    ) {
      return this.error(401, "invalid_client");
    }

    let params: Record<string, unknown>;
    try {
      params = JSON.parse(body) as Record<string, unknown>;
    } catch {
      return this.error(400, "invalid_request");
    }
    if (params["environment"] !== client.environment) return this.error(400, "invalid_request");

    const stored = this.codes.get(hash(String(params["code"])));
    // Consume first, then judge - exactly like the plugin.
    if (!stored || stored.usedAt !== null) return this.error(400, "invalid_grant");
    stored.usedAt = this.seconds();
    if (
      stored.expiresAt < this.seconds() ||
      stored.clientId !== clientId ||
      stored.stateHash !== hash(String(params["state"]))
    ) {
      return this.error(400, "invalid_grant");
    }

    const claims: BridgeIdentityClaims = {
      version: 1,
      subject: stored.subject,
      audience: clientId,
      environment: client.environment,
    };
    return signedClaims(client.secret, claims, String(this.seconds()));
  }
}

/** A 200 response exactly as the plugin would sign it - also used by tests to forge "validly signed but wrong" claims. */
export function signedClaims(secret: string, claims: BridgeIdentityClaims, timestamp: string): FakeResponse {
  return {
    status: 200,
    headers: {
      [BRIDGE_HEADERS.timestamp]: timestamp,
      [BRIDGE_HEADERS.signature]: signBridgeMessage(secret, responseSigningInput(timestamp, claims)),
    },
    body: JSON.stringify(claims),
  };
}
