/**
 * The two values of a binary target column, as text and sorted, so the user
 * can pick the positive (favourable / selected) class. Null when the column
 * does not have exactly two non-empty values in the preview rows.
 */
export function binaryTargetValues(
  rows: Record<string, unknown>[],
  targetCol: string,
): string[] | null {
  const seen = new Set<string>();
  for (const row of rows) {
    const v = row?.[targetCol];
    if (v === null || v === undefined) continue;
    const s = String(v).trim();
    if (s === "") continue;
    seen.add(s);
    if (seen.size > 2) return null;
  }
  return seen.size === 2 ? [...seen].sort() : null;
}

/** Split one CSV line, honouring double-quoted fields ("a,b" and "" escapes). */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

/** Rows of a CSV preview (header + up to `limit` data lines) as objects. */
export function csvPreviewRows(text: string, limit = 5000): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  const header = splitCsvLine(lines[0] ?? "");
  return lines.slice(1, limit + 1).map((line) => {
    const cells = splitCsvLine(line);
    return Object.fromEntries(header.map((h, i) => [h, cells[i] ?? ""]));
  });
}
