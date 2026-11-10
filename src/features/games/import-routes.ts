import { CLUB } from "../../club.ts";
import { badRequest } from "../../app/errors.ts";
import { fileResponse, htmlResponse, redirect } from "../../app/respond.ts";
import type { Router } from "../../app/router.ts";
import { parseForm } from "../../shared/validation.ts";
import { z } from "zod";
import { COMPETITIONS } from "./games-repository.ts";
import { readFixtureCsv, SAMPLE_CSV } from "./fixture-csv.ts";
import { addImportSchema, addImported, preview } from "./fixture-import.ts";
import { readFixtureLink } from "./fixture-link.ts";
import { addPlayhqFixtureFromLink, isPlayhqLink } from "./playhq-service.ts";
import { fixtureTeamHint, usualTipOff } from "../teams/team-code.ts";
import { importPage } from "./views/import-page.ts";
import { countGames, logGameChange } from "./game-log.ts";
import { listPlayhqFixtures } from "./playhq-repository.ts";


const MAX_SHEET_BYTES = 300_000;
const TOO_BIG = "That file is too big for a fixture. Save just the fixture sheet as CSV.";
const linkSchema = z.object({
	url: z.string().trim().min(1, "Paste the link to the fixture").max(400),
	competition: z.enum(COMPETITIONS),
	noVideo: z.literal("1").optional(),
});

/** Add fixture from a link (PlayHQ, or any public page read by AI), from a spreadsheet, and the add-after-checking step. */
export function registerImportRoutes(router: Router): void {
	router.get("/fixture/sample.csv", "manager", async () => fileResponse(SAMPLE_CSV, "text/csv; charset=utf-8", "fixture-sample.csv"));

	router.post("/fixture/link", "manager", async ({ req, frame, member, viewer, deps }) => {
		const form = await parseForm(req, linkSchema);
		if (isPlayhqLink(form.url)) {
			if (form.competition === "Practice match") throw badRequest(`A PlayHQ fixture is ${CLUB.league} or a tournament. Choose one of those.`);
			const fixtureId = await addPlayhqFixtureFromLink(deps, { url: form.url, competition: form.competition, noVideo: form.noVideo });
			const fixture = (await listPlayhqFixtures(deps.db, deps.team.id)).find((f) => f.id === fixtureId);
			if (fixture) await logGameChange(deps, { email: viewer.email, memberId: member.id }, "game_added", `${countGames(fixture.gameCount)} from PlayHQ`);
			return redirect("/fixture?done=playhqadded");
		}
		const read = await readFixtureLink(deps, form.url, { team: fixtureTeamHint(deps.team.code), usualTime: usualTipOff(deps.team.code), competition: form.competition, noVideo: !!form.noVideo });
		return htmlResponse(importPage(frame, await preview(deps, "the fixture page", read.games, read.problems)));
	});

	router.post("/fixture/sheet", "manager", async ({ req, frame, deps }) => {
		// Checked before the form is read, so a huge upload is never held in memory (the form adds a little to the file).
		if (Number(req.headers.get("Content-Length") ?? 0) > MAX_SHEET_BYTES + 20_000) throw badRequest(TOO_BIG);
		const data = await req.formData().catch((err: unknown) => { throw badRequest("Choose the spreadsheet (saved as CSV) first.", err); });
		const file = data.get("file");
		const competition = z.enum(COMPETITIONS).safeParse(data.get("competition"));
		if (!competition.success) throw badRequest("Choose the competition the games are in.");
		if (!(file instanceof File) || file.size === 0) throw badRequest("Choose the spreadsheet (saved as CSV) first.");
		if (file.size > MAX_SHEET_BYTES) throw badRequest(TOO_BIG);
		const text = await file.text();
		if (/^PK/.test(text)) throw badRequest("That's an Excel file. Save it as CSV first (File → Save As → CSV), then choose that.");
		const read = readFixtureCsv(text, competition.data);
		return htmlResponse(importPage(frame, await preview(deps, "your spreadsheet", read.games, read.problems)));
	});

	router.post("/fixture/import", "manager", async ({ req, member, viewer, deps }) => {
		const added = await addImported(deps, member.id, await parseForm(req, addImportSchema, ["pick"]));
		if (added) await logGameChange(deps, { email: viewer.email, memberId: member.id }, "game_added", `${countGames(added)} from a fixture`);
		return redirect(`/fixture?done=${added ? "imported" : "importnone"}`);
	});
}
