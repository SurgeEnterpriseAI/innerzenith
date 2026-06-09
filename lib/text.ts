// Defensive plain-prose enforcement. The advisor must never show raw
// markdown; strip any that slips through before rendering.
//
// CONSERVATIVE on purpose: only strip markup that is unambiguous. The old
// single-asterisk rule (/\*(.+?)\*/) could swallow whole spans of real text
// when asterisks were unbalanced mid-stream — that was cutting words.
export function stripMarkdown(text: string): string {
  return text
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      return t !== "---" && t !== "***" && t !== "___";
    })
    .map((line) =>
      line
        .replace(/^#{1,6}\s+/, "")        // headings
        .replace(/^\s*[-*•]\s{1,3}(?=\S)/, "") // leading bullet ONLY (needs space + content)
    )
    .join("\n")
    .replace(/\*\*([^*]+?)\*\*/g, "$1")   // bold — balanced, no inner asterisks
    .replace(/__([^_]+?)__/g, "$1")       // bold underscore — balanced
    .replace(/`([^`]+?)`/g, "$1");        // inline code — balanced
  // NOTE: single-asterisk italics are intentionally NOT stripped here — the
  // prompt forbids markdown, so any stray single * is rare and harmless, and
  // stripping it risks eating real text across unbalanced spans.
}
