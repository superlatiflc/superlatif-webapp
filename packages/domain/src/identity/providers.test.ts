import { describe, expect, it } from "vitest";
import {
  WORDPRESS_LOGIN_PROVIDER,
  buyerIdentityProviderFor,
  commerceProvidersForIdentityProvider,
} from "./providers.ts";

describe("commerce buyer identity namespace (M2, ADR-074)", () => {
  it("resolves Sejoli buyers against the WordPress login identity (OD-02 outcome a)", () => {
    expect(buyerIdentityProviderFor("sejoli_bridge")).toBe(WORDPRESS_LOGIN_PROVIDER);
  });

  it("keeps a provider without evidence in its own namespace", () => {
    expect(buyerIdentityProviderFor("woocommerce")).toBe("woocommerce");
  });

  it("lists exactly the commerce providers that share the WordPress namespace", () => {
    expect(commerceProvidersForIdentityProvider(WORDPRESS_LOGIN_PROVIDER)).toEqual(["sejoli_bridge"]);
    expect(commerceProvidersForIdentityProvider("woocommerce")).toEqual([]);
  });
});
