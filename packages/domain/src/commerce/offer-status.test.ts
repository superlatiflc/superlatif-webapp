import { describe, expect, it } from "vitest";
import { deriveOfferSaleState, type OfferSaleStateInput } from "./offer-status.ts";

const NOW = new Date("2026-08-29T12:00:00.000Z");

function baseInput(overrides: Partial<OfferSaleStateInput> = {}): OfferSaleStateInput {
  return {
    editorialStatus: "published",
    visibility: "public",
    saleStartsAt: null,
    saleEndsAt: null,
    quota: null,
    soldCount: null,
    ...overrides,
  };
}

describe("deriveOfferSaleState", () => {
  it("is draft while the editorial record has not been published, regardless of dates", () => {
    for (const editorialStatus of ["draft", "in_review", "changes_requested", "approved"] as const) {
      expect(
        deriveOfferSaleState(
          baseInput({ editorialStatus, saleStartsAt: new Date("2020-01-01T00:00:00.000Z") }),
          NOW,
        ),
      ).toBe("draft");
    }
  });

  it("archived overrides everything else, including an open sale window", () => {
    expect(
      deriveOfferSaleState(
        baseInput({
          editorialStatus: "archived",
          saleStartsAt: new Date("2020-01-01T00:00:00.000Z"),
          saleEndsAt: null,
        }),
        NOW,
      ),
    ).toBe("archived");
  });

  it("is hidden when visibility is hidden, even mid-sale-window (published)", () => {
    expect(
      deriveOfferSaleState(
        baseInput({
          visibility: "hidden",
          saleStartsAt: new Date("2026-08-01T00:00:00.000Z"),
          saleEndsAt: new Date("2026-12-31T00:00:00.000Z"),
        }),
        NOW,
      ),
    ).toBe("hidden");
  });

  it("is scheduled before saleStartsAt - the flash sale window has not opened", () => {
    expect(deriveOfferSaleState(baseInput({ saleStartsAt: new Date("2026-09-01T00:00:00.000Z") }), NOW)).toBe(
      "scheduled",
    );
  });

  it("is on_sale once saleStartsAt is reached and no saleEndsAt/quota constrains it", () => {
    expect(deriveOfferSaleState(baseInput({ saleStartsAt: new Date("2026-08-01T00:00:00.000Z") }), NOW)).toBe(
      "on_sale",
    );
  });

  it("is ended at the exact saleEndsAt boundary (inclusive-end convention, matches ENT-001 grant expiry) - an expired offer", () => {
    expect(deriveOfferSaleState(baseInput({ saleEndsAt: NOW }), NOW)).toBe("ended");
  });

  it("is on_sale one millisecond before saleEndsAt", () => {
    expect(deriveOfferSaleState(baseInput({ saleEndsAt: new Date(NOW.getTime() + 1) }), NOW)).toBe("on_sale");
  });

  it("moves scheduled -> on_sale -> ended across a flash sale window", () => {
    const input = baseInput({
      saleStartsAt: new Date("2026-09-01T00:00:00.000Z"),
      saleEndsAt: new Date("2026-09-02T00:00:00.000Z"),
    });
    expect(deriveOfferSaleState(input, new Date("2026-08-31T00:00:00.000Z"))).toBe("scheduled");
    expect(deriveOfferSaleState(input, new Date("2026-09-01T12:00:00.000Z"))).toBe("on_sale");
    expect(deriveOfferSaleState(input, new Date("2026-09-02T00:00:00.000Z"))).toBe("ended");
  });

  it("is sold_out only when quota is enforced (non-null) and soldCount has reached it", () => {
    expect(deriveOfferSaleState(baseInput({ quota: 100, soldCount: 100 }), NOW)).toBe("sold_out");
    expect(deriveOfferSaleState(baseInput({ quota: 100, soldCount: 99 }), NOW)).toBe("on_sale");
  });

  it("never reports sold_out when quota is not enforced (null), even with a high soldCount - dok 09 'Tanpa quota nyata, UI tidak menampilkan stok'", () => {
    expect(deriveOfferSaleState(baseInput({ quota: null, soldCount: 999_999 }), NOW)).toBe("on_sale");
  });

  it("never reports sold_out when soldCount is unknown (null), even with a quota set", () => {
    expect(deriveOfferSaleState(baseInput({ quota: 10, soldCount: null }), NOW)).toBe("on_sale");
  });

  it("sale state never claims anything about student access state (dok 05 §6)", () => {
    // deriveOfferSaleState's signature has no purchase/grant input at all -
    // this test exists to make that contract explicit and regression-proof:
    // if a future edit adds an access-related parameter, this call breaks.
    const state = deriveOfferSaleState(baseInput(), NOW);
    expect(["draft", "scheduled", "on_sale", "sold_out", "ended", "hidden", "archived"]).toContain(state);
  });
});
