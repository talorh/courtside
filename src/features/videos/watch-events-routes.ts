// A family's player trouble on a game's page (public/watch-report.js): the live picture's connection failing or
// stopping, and when it came back, or Stream's player failing. A watch_events line in the Worker's logs alone, with the
// game, who and their device: so "we can't watch" on a game night can be told apart (the filming phone's own
// golive_events, Stream, or this phone's connection) without a line in the admin Log for every family.
import { notFound } from "../../app/errors.ts";
import { jsonOk } from "../../app/respond.ts";
import type { Router } from "../../app/router.ts";
import { parseJson } from "../../shared/validation.ts";
import { z } from "zod";
import { getGame } from "../games/games-repository.ts";

const watchEventsSchema = z.object({
	gameId: z.number().int().positive(), kind: z.enum(["live", "video"]),
	events: z.array(z.object({ s: z.number().int().min(0).max(86_400), what: z.string().min(1).max(160) })).min(1).max(20),
});

export function registerWatchEventsRoutes(router: Router): void {
	router.post("/api/watch-events", "watcher", async ({ req, member, deps }) => {
		const r = await parseJson(req, watchEventsSchema);
		if (!(await getGame(deps.db, deps.team.id, r.gameId))) throw notFound("Game");
		console.warn(JSON.stringify({ event: "watch_events", teamId: deps.team.id, gameId: r.gameId, memberId: member.id, device: deps.device, kind: r.kind, events: r.events }));
		return jsonOk({ logged: r.events.length });
	});
}
