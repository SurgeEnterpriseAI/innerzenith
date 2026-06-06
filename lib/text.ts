// Defensive plain-prose enforcement. The advisor must never show raw
// markdown; strip any that slips through before rendering.
export function stripMarkdown(text: string): string {
  return text
    .split("\n")
    .filter((line) => line.trim() !== "---" && line.trim() !== "***")
    .map((line) =>
      line
        .replace(/^#{1,6}\s+/, "")
        .replace(/^\s*[-*•]\s+/, "")
        .replace(/^\s*\d+\.\s+/, "")
    )
    .join("\n")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/`(.+?)`/g, "$1");
}
