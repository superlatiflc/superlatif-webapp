// Minimal rich-content text extraction for student-facing question content.
//
// `question_versions.stem_document` / `question_options.content` /
// `stimulus_versions.body_document` are JSONB documents (QST-001). A real
// rendering layer for them does not exist anywhere in this codebase - the
// attempt-view.ts module doc says so explicitly ("`renderedHtml`/
// `plainText` - an HTML-rendering layer that does not exist anywhere in
// this codebase yet"), and building one is a genuinely separate task.
//
// This helper is deliberately the SMALLEST honest thing that lets the
// production slice render real question content: it reads a `text` field
// when one is present (the shape every fixture and the question editor
// currently writes) and otherwise returns null so a caller can show an
// explicit fallback rather than "[object Object]". It renders as TEXT
// only - never as HTML - so no document content can inject markup.

export function extractText(document: Record<string, unknown> | null | undefined): string | null {
  if (!document) return null;
  const text = document["text"];
  return typeof text === "string" && text.length > 0 ? text : null;
}
