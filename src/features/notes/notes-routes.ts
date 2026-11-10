import { z } from "zod";
import { forbidden, notFound } from "../../app/errors.ts";
import { fileResponse, redirect } from "../../app/respond.ts";
import type { Router } from "../../app/router.ts";
import { idParam, parseForm } from "../../shared/validation.ts";
import { XLSX_TYPE, xlsxFile } from "../../shared/xlsx.ts";
import { parseClock } from "../clips/clips-service.ts";
import { downloadBaseName } from "../games/game-format.ts";
import { requireGame } from "../games/games-service.ts";
import type { Member } from "../members/members-repository.ts";
import { notesSheet } from "./notes-export.ts";
import { getNoteGameId, insertNote, listNotes, softDeleteNote } from "./notes-repository.ts";

const noteSchema = z.object({
	at: z.string().trim().max(8).default(""),
	body: z.string().trim().min(1, "Write the note first").max(1000),
});

/** Coaches' notes are for coaches only: team managers outrank coaches but must not see them. */
export const isCoach = (member: Member) => member.role === "coach";

function requireCoach(member: Member): void {
	if (!isCoach(member)) throw forbidden("Coaches' notes are only for coaches.");
}

export function registerNoteRoutes(router: Router): void {
	router.post("/games/:id/notes", "coach", async ({ req, params, member, deps }) => {
		requireCoach(member);
		const { db } = deps;
		const game = await requireGame(db, deps.team.id, idParam(params.id, "Game"));
		const form = await parseForm(req, noteSchema);
		const atSeconds = form.at ? parseClock(form.at, "Time") : null;
		await insertNote(db, deps.team.id, { gameId: game.id, atSeconds, body: form.body, createdBy: member.id });
		return redirect(`/games/${game.id}?done=note#notes`);
	});

	// The game's notes for Excel, for coaches only, as the notes are.
	router.get("/games/:id/notes.xlsx", "coach", async ({ params, member, deps }) => {
		requireCoach(member);
		const game = await requireGame(deps.db, deps.team.id, idParam(params.id, "Game"));
		const sheet = notesSheet(deps.team, game, await listNotes(deps.db, deps.team.id, game.id), deps.now());
		return fileResponse(xlsxFile(sheet), XLSX_TYPE, `${downloadBaseName(deps.team, game)}-coaches-notes.xlsx`);
	});

	router.post("/notes/:id/delete", "coach", async ({ params, member, deps }) => {
		requireCoach(member);
		const id = idParam(params.id, "Note");
		const gameId = await getNoteGameId(deps.db, deps.team.id, id);
		if (gameId === null) throw notFound("Note");
		await softDeleteNote(deps.db, deps.team.id, id, deps.now().toISOString());
		return redirect(`/games/${gameId}?done=notedeleted#notes`);
	}, { confirm: true });
}
