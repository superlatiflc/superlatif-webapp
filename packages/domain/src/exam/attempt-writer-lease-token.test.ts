import { describe, expect, it } from "vitest";
import {
  generateWriterLeaseToken,
  hashWriterLeaseToken,
  writerLeaseTokenMatchesHash,
} from "./attempt-writer-lease-token.ts";

describe("writer lease token primitives", () => {
  it("generates a token meeting contracts/openapi.yaml's leaseToken minLength=32", () => {
    expect(generateWriterLeaseToken().length).toBeGreaterThanOrEqual(32);
  });

  it("generates a fresh, unique token on every call", () => {
    expect(generateWriterLeaseToken()).not.toBe(generateWriterLeaseToken());
  });

  it("matches its own hash and rejects a different token", () => {
    const token = generateWriterLeaseToken();
    const hash = hashWriterLeaseToken(token);
    expect(writerLeaseTokenMatchesHash(token, hash)).toBe(true);
    expect(writerLeaseTokenMatchesHash(generateWriterLeaseToken(), hash)).toBe(false);
  });
});
