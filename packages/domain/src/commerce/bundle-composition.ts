// Bundle/product-component composition (COM-001).
//
// dok 05 §5 "Komposisi product": "Product version berisi daftar
// component/grant, bukan salinan konten" - a bundle (Kelas Akselerasi,
// specialist packages, Tryout Pass named lists, a single flash-sale batch
// product) is just a set of (targetType, targetRef, includeDescendants)
// rows pointing at existing content/capability, never a copy of it. This
// module answers the two questions the Product Builder needs at preview
// time (dok 05 §14 "Preview effective access dari pembelian baru", dok 18
// §8 bundle inclusion): what distinct targets does ONE product version
// open, and - when two product versions are composed together (a bundle
// plus a specialist package the same student also owns, dok 18 acceptance
// #2/#3) - does the same target end up listed twice.
//
// This is a catalogue-level composition, not the effective-access resolver:
// it has no notion of a student, a grant, or a validity window. Turning a
// composed target into an actual access grant is COM-003's job
// (grants reference an access_policy per component - ENT-001's
// deriveGrantStatus/distinctTargets take over from there once real grants
// exist).

export type TargetType =
  | "program"
  | "program_track"
  | "module"
  | "resource"
  | "live_session"
  | "live_session_series"
  | "exam_batch"
  | "batch_collection"
  | "community"
  | "capability";

export interface ProductComponentSource {
  readonly productCode: string;
  readonly productVersion: number;
  readonly componentCode: string;
}

export interface ProductComponentClaim {
  readonly source: ProductComponentSource;
  readonly targetType: TargetType;
  readonly targetRef: string;
  readonly includeDescendants: boolean;
}

export interface ComposedProductTarget {
  readonly targetType: TargetType;
  readonly targetRef: string;
  /** True if ANY contributing component includes descendants - the more permissive option wins, matching dok 18 §8 "allowance digabung sesuai policy paling permisif". */
  readonly includeDescendants: boolean;
  readonly sources: readonly ProductComponentSource[];
}

function sourceKey(source: ProductComponentSource): string {
  return `${source.productCode}@${source.productVersion}#${source.componentCode}`;
}

/**
 * Collapses component claims - from one product version, or from several
 * composed together - into the distinct (targetType, targetRef) set a
 * student would actually see. Two components from DIFFERENT product
 * versions pointing at the same target produce ONE entry with two
 * `sources`, never two catalogue cards (dok 05 §10 E2, dok 18 acceptance
 * #2). Two components from the SAME product version pointing at the same
 * target (an authoring mistake) collapse the same way - `sources` reveals
 * the duplicate for the Product Builder's own validation UI.
 */
export function composeProductTargets(claims: readonly ProductComponentClaim[]): ComposedProductTarget[] {
  const byTarget = new Map<
    string,
    {
      targetType: TargetType;
      targetRef: string;
      includeDescendants: boolean;
      sources: ProductComponentSource[];
    }
  >();

  for (const claim of claims) {
    const key = `${claim.targetType} ${claim.targetRef}`;
    const existing = byTarget.get(key);
    if (existing) {
      existing.includeDescendants = existing.includeDescendants || claim.includeDescendants;
      const already = existing.sources.some((source) => sourceKey(source) === sourceKey(claim.source));
      if (!already) existing.sources.push(claim.source);
      continue;
    }
    byTarget.set(key, {
      targetType: claim.targetType,
      targetRef: claim.targetRef,
      includeDescendants: claim.includeDescendants,
      sources: [claim.source],
    });
  }

  return [...byTarget.values()];
}
