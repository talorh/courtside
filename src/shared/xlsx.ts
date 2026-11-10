import { CLUB } from "../club.ts";
import { zip } from "./zip.ts";

// An Excel workbook (.xlsx) of one sheet or several, in the club's colours: a header row in the club's deep colour in white that stays
// put when scrolling, rows banded in its pale tint, set column widths, and cells that wrap (a cell can hold several
// lines); a title and lines under it above the table, if the sheet has them. A column can hold numbers, kept as numbers
// so Excel can add them up, shown as dollars, a count or a percentage. Written by hand, as a few XML files in a
// zip, so the Worker needs no spreadsheet library.

export interface Sheet {
	/** Up to 31 characters, none of [ ] : * ? / \ (Excel's rule). */
	name: string;
	columns: Array<{ title: string; width: number; format?: NumberFormat }>;
	/** A number that isn't one (NaN, Infinity) is left empty. */
	rows: Array<Array<string | number>>;
	/** A heading above the table (the game a coach's notes are for), and lines under it, each across the table. */
	title?: string;
	details?: string[];
}

/** Dollars and cents ($1,234.50), a whole count (1,234), a fraction shown as a percentage (0.42 as 42%), or a number to
 * two places (1,234.57). */
export type NumberFormat = "money" | "count" | "percent" | "decimal";

export const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// Characters XML can't hold at all (control characters bar tab and new line, a lone half of an emoji) go; the rest are
// escaped.
const text = (s: string) => s.toWellFormed().replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, "")
	.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PKG = "http://schemas.openxmlformats.org/package/2006/relationships";
const OOXML = "application/vnd.openxmlformats-officedocument.spreadsheetml";

const each = (n: number, f: (i: number) => string) => Array.from({ length: n }, (_, i) => f(i + 1)).join("");
const contentTypes = (n: number) => `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="${OOXML}.sheet.main+xml"/>${each(n, (i) => `<Override PartName="/xl/worksheets/sheet${i}.xml" ContentType="${OOXML}.worksheet+xml"/>`)}<Override PartName="/xl/styles.xml" ContentType="${OOXML}.styles+xml"/></Types>`;
const PACKAGE_RELS = `${XML}<Relationships xmlns="${PKG}"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
const workbookRels = (n: number) => `${XML}<Relationships xmlns="${PKG}">${each(n, (i) => `<Relationship Id="rId${i}" Type="${REL}/worksheet" Target="worksheets/sheet${i}.xml"/>`)}<Relationship Id="rId${n + 1}" Type="${REL}/styles" Target="styles.xml"/></Relationships>`;
// The site's colours: the club's deep colour for the header row, its bright one for the tab, ink, muted, and its pale tint
// for banding and edges (src/club.ts), read when a workbook is made.
const argb = (hex: string) => `FF${hex.replace("#", "").toUpperCase()}`;
const BOTTLE = () => argb(CLUB.colors.light.bar), GREEN = () => argb(CLUB.colors.light.button), BAND = () => argb(CLUB.colors.light.soft), EDGE = () => argb(CLUB.colors.light.soft);
const INK = "FF121513", MUTED = "FF5D6862";
const font = (o: { bold?: boolean; size?: number; color: string }) => `<font>${o.bold ? "<b/>" : ""}<sz val="${o.size ?? 11}"/><color rgb="${o.color}"/><name val="Calibri"/></font>`;
const solid = (rgb: string) => `<fill><patternFill patternType="solid"><fgColor rgb="${rgb}"/><bgColor indexed="64"/></patternFill></fill>`;
const edge = () => `<${["left", "right", "top", "bottom"].map((side) => `${side} style="thin"><color rgb="${EDGE()}"/></${side}`).join("><")}><diagonal/>`;
const xf = (fontId: number, fillId: number, borderId: number, align = "", numFmt = 0) =>
	`<xf numFmtId="${numFmt}" fontId="${fontId}" fillId="${fillId}" borderId="${borderId}" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"${numFmt ? ' applyNumberFormat="1"' : ""}>${align}</xf>`;
const TOP = '<alignment vertical="top" wrapText="1"/>';
// Number formats: 164 dollars (its own), 3 a count, 9 a percentage and 4 two places (Excel's built-in).
const FORMATS: Record<NumberFormat, number> = { money: 164, count: 3, percent: 9, decimal: 4 };
// Cell styles: 0 plain, 1 the header (white on the club's deep colour), 2 and 3 the rows (plain, then banded), 4 the title, 5 a
// line under it; then a pair (plain, banded) for each number format: 6 and 7 dollars, 8 and 9 a count, 10 and 11 a
// percentage, 12 and 13 two places.
const NUMBER_STYLE: Record<NumberFormat, number> = { money: 6, count: 8, percent: 10, decimal: 12 };
const styles = () => `${XML}<styleSheet xmlns="${MAIN}"><numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;$&quot;#,##0.00"/></numFmts><fonts count="4">${font({ color: INK })}${font({ bold: true, color: "FFFFFFFF" })}${font({ bold: true, size: 16, color: BOTTLE() })}${font({ color: MUTED })}</fonts>`
	+ `<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>${solid(BOTTLE())}${solid(BAND())}</fills>`
	+ `<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border>${edge()}</border></borders>`
	+ `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="14"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>`
	+ `${xf(1, 2, 1, '<alignment vertical="center" wrapText="1"/>')}${xf(0, 0, 1, TOP)}${xf(0, 3, 1, TOP)}${xf(2, 0, 0)}${xf(3, 0, 0)}`
	+ `${(["money", "count", "percent", "decimal"] as const).map((f) => xf(0, 0, 1, TOP, FORMATS[f]) + xf(0, 3, 1, TOP, FORMATS[f])).join("")}</cellXfs>`
	+ '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

// Printed: A4 landscape, every column across one page's width, as many pages down as it takes.
const PRINT = '<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>';

const column = (i: number) => String.fromCharCode(65 + i); // A to Z: a sheet here never has more columns

function worksheet(sheet: Sheet): string {
	// A number in a column with a format takes that format's style, banded as the row is; anything else is text.
	const cell = (value: string | number, r: number, c: number, style: number) => {
		const format = sheet.columns[c]?.format;
		if (typeof value === "number" && Number.isFinite(value) && format && style >= 2 && style <= 3) return `<c r="${column(c)}${r}" s="${NUMBER_STYLE[format] + style - 2}"><v>${value}</v></c>`;
		return `<c r="${column(c)}${r}" t="inlineStr" s="${style}"><is><t xml:space="preserve">${text(typeof value === "number" ? (Number.isFinite(value) ? String(value) : "") : value)}</t></is></c>`;
	};
	const row = (values: Array<string | number>, r: number, style: number) => `<row r="${r}">${values.map((v, c) => cell(v, r, c, style)).join("")}</row>`;
	const cols = sheet.columns.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width}" customWidth="1"/>`).join("");
	// Above the table: the title, its lines, then a blank row; each line across the table's width.
	const above = sheet.title ? [sheet.title, ...(sheet.details ?? [])] : [];
	const top = above.map((line, i) => row([line], i + 1, i ? 5 : 4)).join("") + (above.length ? `<row r="${above.length + 1}"></row>` : "");
	const head = above.length ? above.length + 2 : 1;
	const across = column(sheet.columns.length - 1);
	const merges = above.length ? `<mergeCells count="${above.length}">${above.map((_, i) => `<mergeCell ref="A${i + 1}:${across}${i + 1}"/>`).join("")}</mergeCells>` : "";
	const body = sheet.rows.map((r, i) => row(r, head + 1 + i, i % 2 ? 3 : 2)).join("");
	return `${XML}<worksheet xmlns="${MAIN}"><sheetPr><tabColor rgb="${GREEN()}"/><pageSetUpPr fitToPage="1"/></sheetPr><sheetViews><sheetView workbookViewId="0"><pane ySplit="${head}" topLeftCell="A${head + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
		+ `<cols>${cols}</cols><sheetData>${top}${row(sheet.columns.map((c) => c.title), head, 1)}${body}</sheetData>${merges}${PRINT}</worksheet>`;
}

/** The sheets, in order, as one .xlsx file (each sheet's name its own). */
export function xlsxWorkbook(sheets: Sheet[]): Uint8Array {
	const enc = new TextEncoder(), n = sheets.length;
	const workbook = `${XML}<workbook xmlns="${MAIN}" xmlns:r="${REL}"><sheets>${sheets.map((s, i) => `<sheet name="${text(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`;
	return zip([
		{ name: "[Content_Types].xml", data: enc.encode(contentTypes(n)) }, { name: "_rels/.rels", data: enc.encode(PACKAGE_RELS) },
		{ name: "xl/workbook.xml", data: enc.encode(workbook) }, { name: "xl/_rels/workbook.xml.rels", data: enc.encode(workbookRels(n)) },
		{ name: "xl/styles.xml", data: enc.encode(styles()) }, ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: enc.encode(worksheet(s)) })),
	]);
}

/** The sheet as an .xlsx file. */
export const xlsxFile = (sheet: Sheet): Uint8Array => xlsxWorkbook([sheet]);
