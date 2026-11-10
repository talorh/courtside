import { z } from "zod";
import { htmlResponse, redirect } from "../../app/respond.ts";
import type { Router } from "../../app/router.ts";
import { doneMessage, parseForm } from "../../shared/validation.ts";
import { CLUB_LINES } from "./game-lines-club.ts";
import { getGameLines, saveGameLines } from "./game-lines-repository.ts";
import { checkLines, LINE_GROUPS, LINE_KINDS, type LineKind } from "./game-lines.ts";
import { GAME_LINES_MESSAGES, gameLinesPage } from "./views/game-lines-page.ts";

// Every box, as the page sends it: a box left out is an empty one (the club's lines).
const linesSchema = z.object(Object.fromEntries(LINE_KINDS.map((k) => [k, z.string().max(6000).default("")])) as Record<LineKind, z.ZodDefault<z.ZodString>>);

export function registerGameLinesRoutes(router: Router): void {
	// Manage team's Game lines: each group's lines in use, the team's own or the club's.
	router.get("/manage/game-lines", "manager", async ({ url, frame, deps }) => {
		const own = await getGameLines(deps.db, deps.team.id);
		const text = Object.fromEntries(LINE_KINDS.map((k) => [k, (own[k] ?? CLUB_LINES[k]).join("\n")])) as Record<LineKind, string>;
		return htmlResponse(gameLinesPage({ frame, text, message: doneMessage(GAME_LINES_MESSAGES, url), problems: [] }));
	});

	// All or nothing: one wrong line and nothing is saved, the page coming back with what was typed and what's wrong.
	router.post("/manage/game-lines", "manager", async ({ req, frame, viewer, deps }) => {
		const form = await parseForm(req, linesSchema);
		const checked = LINE_KINDS.map((k) => ({ kind: k, result: checkLines(k, form[k]) }));
		const problems = checked.flatMap(({ kind, result }) => ("problems" in result ? result.problems.map((p) => `${LINE_GROUPS[kind].name}: ${p}`) : []));
		if (problems.length) return htmlResponse(gameLinesPage({ frame, text: form, message: null, problems }), 400);
		const lines = Object.fromEntries(checked.map(({ kind, result }) => [kind, "lines" in result ? result.lines : []])) as Record<LineKind, string[]>;
		const changed = await saveGameLines(deps, viewer.email, lines);
		return redirect(`/manage/game-lines?done=${changed.length ? "saved" : "same"}`);
	});
}
