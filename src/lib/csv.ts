/**
 * CSV for exports and the item import. Written cells are quoted per RFC 4180, and any cell that a spreadsheet would
 * treat as a formula (starting with = + - @ tab or carriage return) gets a leading apostrophe, so text typed by
 * someone can never run as a formula when the file is opened in Excel or Google Sheets.
 */

export type Cell = string | number | boolean | null | undefined;

export function csvCell(value: Cell): string {
  if (value === null || value === undefined) return "";
  let s = typeof value === "boolean" ? (value ? "Yes" : "No") : String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

export const csvRow = (cells: Cell[]): string => `${cells.map(csvCell).join(",")}\r\n`;

/** Excel needs a byte order mark to read a UTF-8 CSV correctly; other tools ignore it. */
export const CSV_BOM = String.fromCharCode(0xfeff);

/** Parses CSV text into rows of cells. Handles quotes, escaped quotes, commas and line breaks inside quotes. */
export function parseCsv(text: string): string[][] {
  const src = text.startsWith(CSV_BOM) ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"' && cell === "") quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}
