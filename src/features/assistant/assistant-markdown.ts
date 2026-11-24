export type AssistantMarkdownTable = {
  headers: string[];
  rows: string[][];
  nextIndex: number;
};

function splitTableCells(line: string): string[] | null {
  const trimmed = line.trim();
  if (!trimmed.includes("|")) return null;
  const content = trimmed.replace(/^\|/, "").replace(/\|$/, "");
  return content.split("|").map((cell) => cell.trim());
}

export function parseAssistantMarkdownTable(
  lines: string[],
  startIndex: number,
): AssistantMarkdownTable | null {
  const headers = splitTableCells(lines[startIndex] ?? "");
  const separators = splitTableCells(lines[startIndex + 1] ?? "");
  if (
    !headers ||
    !separators ||
    headers.length < 2 ||
    headers.length !== separators.length ||
    !separators.every((cell) => /^:?-{3,}:?$/.test(cell))
  ) {
    return null;
  }

  const rows: string[][] = [];
  let nextIndex = startIndex + 2;
  while (nextIndex < lines.length) {
    const cells = splitTableCells(lines[nextIndex]);
    if (!cells) break;
    if (cells.length === headers.length) rows.push(cells);
    nextIndex += 1;
  }

  if (!rows.length) return null;
  return { headers, rows, nextIndex };
}
