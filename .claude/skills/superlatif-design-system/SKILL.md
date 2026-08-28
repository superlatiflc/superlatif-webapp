---
name: superlatif-design-system
description: Build or review Superlatif student/admin interfaces, responsive states, copy, components, accessibility, and design-token use. Use for UI/UX work in the web app; do not use to redefine entitlement, scoring, or provider contracts.
---

# Superlatif Design System

## Read first

Read the relevant sections from:

- `docs/gates/07_INFORMATION_ARCHITECTURE_AND_SITEMAP.md`;
- `docs/gates/09_UX_SPECIFICATION.md`;
- `docs/gates/10_UI_DESIGN_BRIEF.md`;
- `docs/gates/11_DESIGN_SYSTEM.md`;
- `docs/gates/12_SCREEN_SPECIFICATIONS.md`;
- `docs/gates/13_PRD.md`;
- `docs/gates/27_QA_TESTING_AND_UAT_PLAN.md`.

## Product experience

The interface is program-centric. Tryout, material, recording, live class, schedule, and progress belong to a program. Global shortcuts may exist, but must resolve the correct program context.

Keep one clear primary action. Prefer progressive disclosure and useful defaults over configuration-heavy screens. Gamification is subtle and never manipulative.

## Brand behavior

Superlatif is mindset-first: purpose, resilience, learning strategy, and tools belong to one journey. Tone is optimistic, empathetic, visionary, smart, and grounded.

Do not:

- reduce the brand to “bimbel online”;
- promise graduation or official score equivalence;
- use false countdown/quota/social proof;
- hide an operational failure behind inspirational language;
- focus copy only on rank and score.

Student-facing errors explain what happened, what remains safe, what to do next, and how to get a reference/help.

## UI contract

- Use canonical routes and existing components/tokens.
- Never use menu visibility as authorization.
- Implement relevant loading, empty, partial, stale, denied, expired, read-only, offline, error, retry, and success states.
- Preserve program/attempt context across navigation where allowed.
- During an active exam, prevent unrelated context switching and keep focus mode.
- Show server-authoritative time/status; do not create a second client truth.
- Keep secrets, keys, weights, private links, and unnecessary PII out of hydration, DOM, analytics, and error UI.

## Responsive and accessibility

Design and test P0 flows at 320 CSS px, zoom 200%, keyboard-only, reduced motion, and representative screen readers.

Required behaviors:

- minimum 44×44 critical touch targets;
- visible focus that is not obscured;
- semantic headings, labels, tables/cards, and status announcements;
- no drag-only interaction;
- no redundant re-entry when safe reuse is possible;
- color/chart/animation is never the only information source;
- informative images have meaningful alt text; decorative images have intentional empty alt;
- formulas/equations expose accessible representation;
- timer warnings are perceivable without creating screen-reader noise.

## Review checklist

- Which user goal and screen contract does this implement?
- Is the primary action unambiguous?
- Are access, purchase, and content states visually distinct?
- Does every failure state preserve trust and a recovery path?
- Does mobile retain all critical information/actions?
- Are focus/order/labels/contrast/target size verified?
- Does copy comply with evidence and current policy?
- Are analytics events allowlisted and free of answers/tokens/PII?

## Stop conditions

Stop when a screen requires a missing domain decision, new permission, new route hierarchy, official score claim, or unverified scarcity. Request the smallest decision and avoid inventing UI behavior that changes the product contract.

## Completion

Report screen/state coverage, responsive/accessibility evidence, domain/API dependencies, analytics impact, and remaining manual UAT.
