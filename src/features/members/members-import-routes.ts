// Manage team's Add from a spreadsheet: the template, the filled-in sheet (saved as CSV) read and shown first, then the
// new people added.
import { badRequest } from "../../app/errors.ts";
import { fileResponse, htmlResponse, redirect } from "../../app/respond.ts";
import type { Router } from "../../app/router.ts";
import { parseForm } from "../../shared/validation.ts";
import { PEOPLE_TEMPLATE_CSV, readPeopleCsv } from "./members-csv.ts";
import { addFromSheet, importSchema, sheetPeople } from "./members-import.ts";
import { peopleImportPage } from "./views/people-import-page.ts";

const MAX_SHEET_BYTES = 100_000;
const CHOOSE = "Choose the spreadsheet (saved as CSV) first.";

export function registerMembersImportRoutes(router: Router): void {
	router.get("/members/sample.csv", "manager", async () => fileResponse(PEOPLE_TEMPLATE_CSV, "text/csv; charset=utf-8", "people-template.csv"));

	router.post("/members/sheet", "manager", async ({ req, frame, deps }) => {
		// Checked before the form is read, so a huge upload is never held in memory (the form adds a little to the file).
		if (Number(req.headers.get("Content-Length") ?? 0) > MAX_SHEET_BYTES + 20_000) throw badRequest("That file is too big for a list of people. Save just that sheet as CSV.");
		const data = await req.formData().catch((err: unknown) => { throw badRequest(CHOOSE, err); });
		const file = data.get("file");
		if (!(file instanceof File) || file.size === 0) throw badRequest(CHOOSE);
		if (file.size > MAX_SHEET_BYTES) throw badRequest("That file is too big for a list of people. Save just that sheet as CSV.");
		const text = await file.text();
		if (/^PK/.test(text)) throw badRequest("That's an Excel file. Save it as CSV first (File → Save As → CSV), then choose that.");
		const read = readPeopleCsv(text);
		return htmlResponse(peopleImportPage(frame, { people: await sheetPeople(deps.db, deps.team.id, read.people), problems: read.problems }));
	});

	router.post("/members/import", "manager", async ({ req, viewer, deps }) => {
		const added = await addFromSheet(deps, viewer.email, (await parseForm(req, importSchema)).people);
		return redirect(`/manage?done=${added ? "imported" : "importnone"}#people`);
	});
}
