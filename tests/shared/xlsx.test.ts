import { describe, expect, it } from "vitest";
import { xlsxFile, xlsxWorkbook } from "../../src/shared/xlsx.ts";
import { sheetCells, sheetRows, unzip } from "../helpers/unzip.ts";

describe("xlsx: one sheet Excel opens", () => {
	it("has the parts a workbook needs, a bold, frozen header row, set column widths, and text kept exactly as written", () => {
		const file = xlsxFile({
			name: "Roster 2026-27", columns: [{ title: "Week of", width: 12 }, { title: "Game", width: 40 }],
			rows: [["Mon 26 Oct 2026", "Fri 30 Oct, 6:40pm · vs Lakeside & Co <A>\nSat 31 Oct"], ["Mon 2 Nov 2026", "bell\u0007 gone"]],
		});
		const parts = unzip(file);
		expect([...parts.keys()]).toEqual(["[Content_Types].xml", "_rels/.rels", "xl/workbook.xml", "xl/_rels/workbook.xml.rels", "xl/styles.xml", "xl/worksheets/sheet1.xml"]);
		const text = (name: string) => new TextDecoder().decode(parts.get(name)!.data);
		expect(text("[Content_Types].xml")).toContain('<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>');
		expect(text("xl/workbook.xml")).toContain('<sheet name="Roster 2026-27" sheetId="1" r:id="rId1"/>');
		const sheet = text("xl/worksheets/sheet1.xml");
		expect(sheet).toContain('<c r="A1" t="inlineStr" s="1"><is><t xml:space="preserve">Week of</t></is></c>');
		expect(sheet).toContain('<col min="2" max="2" width="40" customWidth="1"/>');
		expect(sheet).toContain('<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>');
		expect(sheet).toContain("vs Lakeside &amp; Co &lt;A&gt;\nSat 31 Oct");
		expect(sheetRows(file)).toEqual([["Week of", "Game"], ["Mon 26 Oct 2026", "Fri 30 Oct, 6:40pm · vs Lakeside & Co <A>\nSat 31 Oct"], ["Mon 2 Nov 2026", "bell gone"]]);
	});
	it("is in the Saints' colours: a bottle-green header row in white, rows banded in light green, a green tab", () => {
		const file = xlsxFile({ name: "x", columns: [{ title: "A", width: 10 }], rows: [["one"], ["two"], ["three"]] });
		const parts = unzip(file);
		const text = (name: string) => new TextDecoder().decode(parts.get(name)!.data);
		const styles = text("xl/styles.xml");
		expect(styles).toContain('<fgColor rgb="FF0A4A23"/>');
		expect(styles).toContain('<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>');
		expect(styles).toContain('<fgColor rgb="FFEEF6F0"/>');
		const sheet = text("xl/worksheets/sheet1.xml");
		expect(sheet).toContain('<sheetPr><tabColor rgb="FF2A8F3D"/><pageSetUpPr fitToPage="1"/></sheetPr>');
		// Printed across one A4 page's width, landscape.
		expect(sheet).toContain('<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>');
		// Banded: the rows take turns, plain then light green.
		expect([...sheet.matchAll(/<c r="A(\d)" t="inlineStr" s="(\d)">/g)].map((m) => `${m[1]}:${m[2]}`)).toEqual(["1:1", "2:2", "3:3", "4:2"]);
	});
	it("can open with a title and lines under it, each across the table, the header frozen beneath them", () => {
		const file = xlsxFile({ name: "x", title: "Round 1 · vs Pine Valley", details: ["Saints B12.1 · 2026/27", "Sat 14 Nov 2026, 9:00am"],
			columns: [{ title: "Time", width: 10 }, { title: "Note", width: 40 }], rows: [["2:05", "Press worked"]] });
		const sheet = new TextDecoder().decode(unzip(file).get("xl/worksheets/sheet1.xml")!.data);
		expect(sheetRows(file)).toEqual([["Round 1 · vs Pine Valley"], ["Saints B12.1 · 2026/27"], ["Sat 14 Nov 2026, 9:00am"], [], ["Time", "Note"], ["2:05", "Press worked"]]);
		expect(sheet).toContain('<c r="A1" t="inlineStr" s="4">');
		expect(sheet).toContain('<c r="A2" t="inlineStr" s="5">');
		expect(sheet).toContain('<mergeCells count="3"><mergeCell ref="A1:B1"/><mergeCell ref="A2:B2"/><mergeCell ref="A3:B3"/></mergeCells>');
		expect(sheet).toContain('<pane ySplit="5" topLeftCell="A6" activePane="bottomLeft" state="frozen"/>');
	});
});

describe("xlsx: a workbook of several sheets, with numbers Excel can add up", () => {
	const book = () => xlsxWorkbook([
		{ name: "Summary", columns: [{ title: "Figure", width: 30 }, { title: "Amount", width: 14, format: "money" }], rows: [["This month", 12.5], ["Season", 1234.567]] },
		{ name: "Teams", columns: [{ title: "Team", width: 20 }, { title: "Players", width: 10, format: "count" }, { title: "Budget used", width: 12, format: "percent" }, { title: "GB", width: 8, format: "decimal" }],
			rows: [["Saints B12.1", 10, 0.42, 1.234], ["Saints G14.5", 0, Number.NaN, 0]] },
	]);
	it("names every sheet in the workbook, its parts and its relationships", () => {
		const parts = unzip(book());
		const text = (name: string) => new TextDecoder().decode(parts.get(name)!.data);
		expect([...parts.keys()]).toContain("xl/worksheets/sheet2.xml");
		expect(text("xl/workbook.xml")).toContain('<sheet name="Summary" sheetId="1" r:id="rId1"/><sheet name="Teams" sheetId="2" r:id="rId2"/>');
		expect(text("xl/_rels/workbook.xml.rels")).toContain('<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>');
		expect(text("xl/_rels/workbook.xml.rels")).toContain('Target="styles.xml"/>');
		expect(text("[Content_Types].xml")).toContain('<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>');
	});
	it("keeps numbers as numbers, in dollars, a count or a percentage, banded like the text; one that isn't a number is left empty", () => {
		const file = book(), styles = new TextDecoder().decode(unzip(file).get("xl/styles.xml")!.data);
		expect(styles).toContain('<numFmt numFmtId="164" formatCode="&quot;$&quot;#,##0.00"/>');
		const summary = sheetCells(file, 1), teams = sheetCells(file, 2);
		expect(summary[1]).toEqual([{ v: "This month", s: 2 }, { v: 12.5, s: 6 }]);
		expect(summary[2]).toEqual([{ v: "Season", s: 3 }, { v: 1234.567, s: 7 }]);
		expect(teams[1]).toEqual([{ v: "Saints B12.1", s: 2 }, { v: 10, s: 8 }, { v: 0.42, s: 10 }, { v: 1.234, s: 12 }]);
		expect(teams[2]).toEqual([{ v: "Saints G14.5", s: 3 }, { v: 0, s: 9 }, { v: "", s: 3 }, { v: 0, s: 13 }]);
	});
	it("one sheet is still xlsxFile's workbook", () => {
		const one = { name: "x", columns: [{ title: "A", width: 10 }], rows: [["one"]] };
		expect(xlsxFile(one)).toEqual(xlsxWorkbook([one]));
	});
});
