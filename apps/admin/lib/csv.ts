/**
 * CSV for spreadsheets. Cells starting with = + - @ (and tab/CR) are prefixed
 * with ' so Excel/Sheets never run them as formulas (CSV injection).
 */
export function toCsv<T>(rows: T[], columns: { header: string; value: (row: T) => unknown }[]): string {
  const cell = (v: unknown) => {
    let s = v === null || v === undefined ? "" : Array.isArray(v) ? v.join(", ") : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columns.map((c) => cell(c.header)).join(","), ...rows.map((r) => columns.map((c) => cell(c.value(r))).join(","))];
  return "﻿" + lines.join("\r\n");
}

export function csvResponse(csv: string, filename: string) {
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename.replace(/[^a-z0-9._-]/gi, "-")}"`,
      "cache-control": "no-store",
    },
  });
}
