// The one timing invariant dok 17 §2 explicitly calls out as needing a
// domain validator (EXM-001):
//
// "Semantic validator publication wajib menegakkan: bila
// `timing.mode=per_section`, setiap section mempunyai `durationSeconds`
// dan jumlah seluruh durasi section sama dengan `timing.totalDurationSeconds`.
// Standard JSON Schema tidak dapat membandingkan jumlah array secara
// portabel, sehingga invariant ini dijalankan validator domain dan
// contract test, bukan dibiarkan sebagai asumsi."

import type { BlueprintStructure } from "./blueprint-structure.ts";

export class BlueprintTimingInconsistentError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(`Blueprint timing is inconsistent:\n${issues.map((issue) => `  - ${issue}`).join("\n")}`);
    this.name = "BlueprintTimingInconsistentError";
  }
}

export function assertBlueprintTimingConsistent(structure: BlueprintStructure): void {
  if (structure.timing.mode !== "per_section") return;

  const issues: string[] = [];
  let sum = 0;
  for (const section of structure.sections) {
    if (section.durationSeconds == null) {
      issues.push(`section "${section.code}" is missing durationSeconds under timing.mode="per_section"`);
      continue;
    }
    if (section.durationSeconds <= 0) {
      issues.push(`section "${section.code}" has a non-positive durationSeconds`);
      continue;
    }
    sum += section.durationSeconds;
  }

  if (issues.length === 0 && sum !== structure.timing.totalDurationSeconds) {
    issues.push(
      `sum of section durationSeconds (${sum}) does not equal timing.totalDurationSeconds (${structure.timing.totalDurationSeconds})`,
    );
  }

  if (issues.length > 0) throw new BlueprintTimingInconsistentError(issues);
}
