// Post-sign-in destination allowlist (ADR-072; dok 23 §5 "redirect allowlist").
//
// The destination is chosen BEFORE the learner leaves for WordPress, stored
// server-side in the httpOnly state cookie, and re-validated here - it is
// never read from the callback URL. Even so it is treated as hostile: only a
// same-origin path under a known student area survives, everything else
// becomes the default. There is no "error" outcome, because a bad `next`
// value should cost the learner nothing but a less specific landing page.

export const DEFAULT_RETURN_PATH = "/tryouts";

const ALLOWED_AREAS = ["/tryouts", "/home", "/programs", "/attempts"] as const;
const PROBE_ORIGIN = "https://return-path.invalid";
function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

export function sanitizeReturnPath(raw: unknown): string {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 512) return DEFAULT_RETURN_PATH;
  // Scheme-relative (//evil), backslash tricks (/\evil, which some browsers
  // normalize to //evil), and control characters are rejected before
  // parsing, so URL normalization can never be what decides.
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return DEFAULT_RETURN_PATH;
  if (hasControlCharacter(raw)) return DEFAULT_RETURN_PATH;

  let url: URL;
  try {
    url = new URL(raw, PROBE_ORIGIN);
  } catch {
    return DEFAULT_RETURN_PATH;
  }
  if (url.origin !== PROBE_ORIGIN) return DEFAULT_RETURN_PATH;

  // `url.pathname` has dot-segments resolved, so /tryouts/../admin is
  // checked as /admin and rejected.
  const path = url.pathname;
  const allowed = ALLOWED_AREAS.some((area) => path === area || path.startsWith(`${area}/`));
  if (!allowed) return DEFAULT_RETURN_PATH;
  return `${path}${url.search}`;
}
