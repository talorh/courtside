import { htmlResponse, redirect } from "../../app/respond.ts";
import type { Router } from "../../app/router.ts";
import { compareIso, localTime, nextFridayDate } from "../../shared/time.ts";
import { usualTipOff } from "../teams/team-code.ts";
import { doneMessage, idParam, parseForm } from "../../shared/validation.ts";
import { gameName, logGameChange } from "./game-log.ts";
import { getGame, listGamesWithVideoStatus } from "./games-repository.ts";
import { addGame, deleteGame, editGame, gameFormSchema, requireGame, toGameInput } from "./games-service.ts";
import { deleteGameWithFootage } from "../videos/game-removal-service.ts";
import { closeLiveForGame, closeUnusedLive } from "../live/live-service.ts";
import { listOpenLive, wasStreamed } from "../live/live-repository.ts";
import { listPlayhqFixtures } from "./playhq-repository.ts";
import { FIXTURE_MESSAGES, fixturePage } from "./views/fixture-page.ts";
import { listScores } from "../scores/scores-repository.ts";

export function registerFixtureRoutes(router: Router): void {
	// Everyone can see the fixture; only team managers change it (every change below is theirs).
	router.get("/fixture", "watcher", async ({ url, frame, member, deps }) => {
		const { db } = deps;
		// A closed season's fixture is the read-only list.
		const canEdit = member.role === "manager" && deps.team.status === "active";
		const editId = canEdit ? url.searchParams.get("edit") : null;
		const open = await listOpenLive(db, deps.team.id);
		return htmlResponse(fixturePage({
			frame,
			canEdit,
			// Oldest first, the same order as the Games list (games at the same time in the order they were added).
			games: (await listGamesWithVideoStatus(db, deps.team.id))
				.sort((a, b) => compareIso(a.game.startsAt, b.game.startsAt) || a.game.id - b.game.id),
			playhq: canEdit ? await listPlayhqFixtures(db, deps.team.id) : [],
			editing: editId ? await requireGame(db, deps.team.id, idParam(editId, "Game")) : null,
			message: doneMessage(FIXTURE_MESSAGES, url),
			nowLocal: localTime(deps.now()),
			defaultStart: { date: nextFridayDate(deps.now()), time: usualTipOff(deps.team.code) },
			// Only a game that has actually streamed; opening Go live alone sets up a stream for the game it picks.
			live: new Map(open.filter(wasStreamed).map((l) => [l.gameId, l.endRequestedAt ? "saving" : "streaming"])),
			scores: await listScores(db, deps.team.id),
		}));
	});

	router.post("/fixture", "manager", async ({ req, member, viewer, deps }) => {
		const form = await parseForm(req, gameFormSchema);
		const id = await addGame(deps, toGameInput(form), member.id, form.video);
		const added = await getGame(deps.db, deps.team.id, id);
		if (added) await logGameChange(deps, { email: viewer.email, memberId: member.id }, "game_added", gameName(added));
		return redirect(`/fixture?done=${form.video === "none" ? "novideo" : "added"}`);
	});

	router.post("/fixture/:id", "manager", async ({ req, params, member, viewer, deps }) => {
		const form = await parseForm(req, gameFormSchema);
		const id = idParam(params.id, "Game");
		await editGame(deps, id, toGameInput(form), form.video);
		const saved = await getGame(deps.db, deps.team.id, id);
		if (saved) await logGameChange(deps, { email: viewer.email, memberId: member.id }, "game_changed", gameName(saved));
		return redirect(`/fixture?done=${form.video === "none" ? "novideo" : "saved"}`);
	});

	router.post("/fixture/:id/delete", "manager", async ({ params, member, viewer, deps }) => {
		const id = idParam(params.id, "Game");
		const game = await requireGame(deps.db, deps.team.id, id);
		await closeUnusedLive(deps, id, "deleted");
		await deleteGame(deps.db, deps.team.id, id, deps.now());
		await logGameChange(deps, { email: viewer.email, memberId: member.id }, "game_deleted", gameName(game), id);
		return redirect("/fixture?done=deleted");
	}, { confirm: true });

	router.post("/fixture/:id/delete-all", "manager", async ({ params, member, viewer, deps }) => {
		const id = idParam(params.id, "Game");
		const game = await requireGame(deps.db, deps.team.id, id);
		await closeLiveForGame(deps, id);
		await deleteGameWithFootage(deps, id);
		await logGameChange(deps, { email: viewer.email, memberId: member.id }, "game_deleted", `${gameName(game)}, and its video`, id);
		return redirect("/fixture?done=deletedall");
	}, { confirm: true });
}
