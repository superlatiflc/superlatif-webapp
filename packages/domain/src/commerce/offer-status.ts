// Offer sale-state derivation (COM-001).
//
// dok 05 §6 "Status offer" and dok 18 §4 "Offer state" name seven values -
// draft, scheduled, on_sale, sold_out, ended, hidden, archived - and both
// are explicit that "State dihitung dari status, waktu server, dan enforced
// quota": this is the same "compute, don't store" discipline
// ENT-001/IDN-001 already applied to grant/session status. `offers.status`
// in the schema is the record's own EDITORIAL lifecycle (draft -> published
// -> archived, ADR-048), a different concept from this sale-facing state -
// deriveOfferSaleState is the one function that turns the editorial status
// plus visibility plus time plus quota into the vocabulary a shopper or the
// Offer Builder preview actually needs.
//
// "Sale state tidak menentukan student access state" (dok 05 §6): this
// module says nothing about whether a purchase or an access grant exists -
// that is COM-002/COM-003's job, layered on top, never decided here.

export type OfferSaleState = "draft" | "scheduled" | "on_sale" | "sold_out" | "ended" | "hidden" | "archived";

export type OfferEditorialStatus =
  "draft" | "in_review" | "changes_requested" | "approved" | "published" | "archived";

export type OfferVisibility = "public" | "private" | "invite_only" | "hidden";

export interface OfferSaleStateInput {
  readonly editorialStatus: OfferEditorialStatus;
  readonly visibility: OfferVisibility;
  /** Inclusive: sale is open once `now >= saleStartsAt`. Null means no lower bound. */
  readonly saleStartsAt: Date | null;
  /** Exclusive: sale ends the instant `now >= saleEndsAt` (same boundary convention as ENT-001's validity windows). Null means no fixed end. */
  readonly saleEndsAt: Date | null;
  /** Null means quota is not enforced - dok 09 "Quota hanya dipakai bila kapasitas benar-benar enforced". */
  readonly quota: number | null;
  /** Null (unknown/not tracked) is treated the same as "not yet at quota" - sold_out requires a real count, not an assumption. */
  readonly soldCount: number | null;
}

/**
 * Computes the doc 05 §6 / doc 18 §4 sale state. Never stored: called fresh
 * with the current server time on every read, exactly like
 * deriveGrantStatus (ENT-001) and evaluateSessionValidity (IDN-001).
 */
export function deriveOfferSaleState(input: OfferSaleStateInput, now: Date): OfferSaleState {
  if (input.editorialStatus === "archived") return "archived";
  if (input.editorialStatus !== "published") return "draft";
  if (input.visibility === "hidden") return "hidden";

  if (input.saleStartsAt !== null && now.getTime() < input.saleStartsAt.getTime()) return "scheduled";
  if (input.saleEndsAt !== null && now.getTime() >= input.saleEndsAt.getTime()) return "ended";
  if (input.quota !== null && input.soldCount !== null && input.soldCount >= input.quota) return "sold_out";
  return "on_sale";
}
