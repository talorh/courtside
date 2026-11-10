// A spreadsheet saved as CSV (Excel: File → Save As → CSV; Google Sheets: File → Download → CSV), as rows of cells: the
// Fixture's and Manage team's Add from a spreadsheet read it.

/** CSV cells, quotes and "" escapes handled; ; instead of , when the header row uses it. Blank rows are left out unless
 * `blanks` (so a sheet's row numbers still count them). */
export function csvRows(text: string, { blanks = false } = {}): string[][] {
	const body = text.replace(/^﻿/, "");
	const header = body.split(/\r?\n/, 1)[0] ?? "";
	const sep = (header.match(/;/g)?.length ?? 0) > (header.match(/,/g)?.length ?? 0) ? ";" : ",";
	const rows: string[][] = [];
	let row: string[] = [], cell = "", quoted = false;
	for (let i = 0; i < body.length; i++) {
		const c = body[i]!;
		if (quoted) {
			if (c !== '"') cell += c;
			else if (body[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
		} else if (c === '"') quoted = true;
		else if (c === sep) { row.push(cell); cell = ""; }
		else if (c === "\n" || c === "\r") {
			if (c === "\r" && body[i + 1] === "\n") i++;
			row.push(cell); rows.push(row); row = []; cell = "";
		} else cell += c;
	}
	if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
	return blanks ? rows : rows.filter((r) => r.some((x) => x.trim() !== ""));
}
