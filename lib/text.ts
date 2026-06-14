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
        .replace(/^#{1,6}\s+/, "")             // headings
        .replace(/^\s*\d{1,2}\.\s{1,3}(?=\S)/, "") // leading ordered-list marker ("1. ")
        .replace(/^\s*[-*•]\s{1,3}(?=\S)/, "") // leading bullet ONLY (needs space + content)
        .replace(/\*\*([^*]+?)\*\*/g, "$1")    // bold — MUST run before single-* below
        .replace(/__([^_]+?)__/g, "$1")        // bold underscore — balanced
        .replace(/`([^`]+?)`/g, "$1")          // inline code — balanced
        // single-asterisk italics — stripped PER LINE and only as a BALANCED
        // pair with no inner asterisk, so an unbalanced stray * can never eat
        // text across lines (the failure mode that motivated the old caution).
        .replace(/\*([^*\n]+?)\*/g, "$1")
    )
    .join("\n");
}
