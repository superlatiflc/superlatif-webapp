// Commerce webhook contract (M2, ADR-074): the body the WordPress plugin
// sends (pinned by the shared vector) validates against contracts/openapi.yaml
// `CanonicalCommerceEvent`, the app's strict parser agrees with that schema on
// accept/reject, and the route/headers the plugin uses are the ones the
// contract declares.

import fs from "node:fs";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import {
  COMMERCE_WEBHOOK_HEADERS,
  WIRE_COMMERCE_EVENT_TYPES,
  parseWireCommerceEvent,
} from "../../packages/integrations/src/index.ts";

/** A nested object of a mutable test event. */
function sub(event: Record<string, unknown>, key: string): Record<string, unknown> {
  return event[key] as Record<string, unknown>;
}

const ROOT = path.join(import.meta.dirname, "..", "..");
const openapi = parse(fs.readFileSync(path.join(ROOT, "contracts", "openapi.yaml"), "utf8")) as {
  paths: Record<string, Record<string, { parameters?: Array<{ name: string; in: string }> }>>;
  components: { schemas: Record<string, Record<string, unknown>> };
};
const vectors = JSON.parse(
  fs.readFileSync(
    path.join(ROOT, "wordpress-plugins", "superlatif-app-bridge", "tests", "vectors.json"),
    "utf8",
  ),
) as { commerce: { body: string } };
const pluginSource = fs.readFileSync(
  path.join(ROOT, "wordpress-plugins", "superlatif-app-bridge", "includes", "commerce.php"),
  "utf8",
);

const schema = openapi.components.schemas["CanonicalCommerceEvent"] as Record<string, unknown>;
const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
const validate = ajv.compile(schema);

describe("CanonicalCommerceEvent", () => {
  it("accepts the body the plugin sends (shared vector)", () => {
    const body = JSON.parse(vectors.commerce.body);
    expect(validate(body), JSON.stringify(validate.errors)).toBe(true);
    expect(parseWireCommerceEvent(body)).not.toBeNull();
  });

  it("the app parser and the schema agree on every probe", () => {
    const base = JSON.parse(vectors.commerce.body) as Record<string, unknown>;
    const probes: Array<(e: Record<string, unknown>) => void> = [
      () => {},
      (e) => (e["extra"] = 1),
      (e) => (sub(e, "order")["externalUserId"] = null),
      (e) => (sub(e, "order")["externalSkuId"] = ""),
      (e) => (e["eventType"] = "completed"),
      (e) => (sub(e, "amounts")["currency"] = "idr"),
      (e) => (sub(e, "amounts")["grossMinor"] = -5),
      (e) => delete sub(e, "amounts")["refundedMinor"],
      (e) => (e["rawPayloadChecksum"] = "xyz"),
      (e) => (sub(e, "customer")["emailHash"] = "f".repeat(64)),
      (e) => (e["schemaVersion"] = 2),
      (e) => delete e["customer"],
    ];
    for (const probe of probes) {
      const event = structuredClone(base);
      probe(event);
      expect(parseWireCommerceEvent(event) !== null, JSON.stringify(event)).toBe(validate(event));
    }
  });

  it("the app knows exactly the contract's event types", () => {
    const eventType = (schema["properties"] as Record<string, { enum: string[] }>)["eventType"];
    expect([...WIRE_COMMERCE_EVENT_TYPES].sort()).toEqual([...(eventType?.enum ?? [])].sort());
  });
});

describe("route and headers", () => {
  const operation = openapi.paths["/integrations/commerce/{provider}/events"]?.["post"];

  it("declares the delivery headers the app reads and the plugin sends", () => {
    const headers = (operation?.parameters ?? [])
      .filter((p) => p.in === "header")
      .map((p) => p.name.toLowerCase());
    expect(headers.sort()).toEqual(
      [
        COMMERCE_WEBHOOK_HEADERS.eventId,
        COMMERCE_WEBHOOK_HEADERS.timestamp,
        COMMERCE_WEBHOOK_HEADERS.keyId,
      ].sort(),
    );
    for (const name of [
      "X-Provider-Event-ID",
      "X-Superlatif-Timestamp",
      "X-Superlatif-Key-ID",
      "X-Superlatif-Signature",
    ]) {
      expect(pluginSource).toContain(`'${name}'`);
    }
  });

  it("the plugin posts to the contract path under /api/v1", () => {
    expect(pluginSource).toContain("'/api/v1/integrations/commerce/sejoli_bridge/events'");
    expect(
      fs.existsSync(
        path.join(ROOT, "apps/web/src/app/api/v1/integrations/commerce/[provider]/events/route.ts"),
      ),
    ).toBe(true);
  });
});
