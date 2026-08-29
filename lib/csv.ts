/** Minimal CSV parsing for the small, single-sheet imports this app deals with — not meant for RFC-4180 edge cases like embedded newlines. */
export function parseCsv(text: string): string[][] {
  return text
    .split(/\r\n|\n|\r/)
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .map((line) => line.split(",").map((cell) => cell.trim().replace(/^"(.*)"$/, "$1")));
}
