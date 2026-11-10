// The end-of-season pack's one action (the pack is on Manage team): asking Stream to make every game's HD copy now, so
// they're all ready to download together. Allowed once a team's season is over, as the pack is for then.
import { redirect } from "../../app/respond.ts";
import type { Router } from "../../app/router.ts";
import { packGames } from "./season-pack-repository.ts";
import { logProblem } from "../admin/problem-log.ts";

/** Stream's calls a run, in turn, so a season of games doesn't ask Stream for them all at once. */
const AT_ONCE = 6;

export function registerSeasonPackRoutes(router: Router): void {
	router.post("/season-pack/hd", "manager", async ({ deps }) => {
		const games = await packGames(deps.db, deps.team.id);
		let asked = 0, refused = 0;
		for (let i = 0; i < games.length; i += AT_ONCE) {
			// One game's copy Stream won't make (or an answer that doesn't come) leaves the others to carry on.
			const states = await Promise.allSettled(games.slice(i, i + AT_ONCE).map(async (g) => {
				const state = await deps.stream.downloadStatus(g.streamUid);
				if (state === "none") await deps.stream.generateDownload(g.streamUid);
				if (state === "error") throw new Error(`Stream has no HD copy of ${g.streamUid}`);
				return state;
			}));
			for (const s of states) {
				if (s.status === "rejected") {
					refused++;
					console.error(JSON.stringify({ event: "season_pack_hd_failed", teamId: deps.team.id, error: String(s.reason) }));
					await logProblem(deps, { kind: "stream_problem", teamId: deps.team.id, what: "A video's HD copy for the season's videos download couldn't be made", error: s.reason });
				} else if (s.value !== "ready") asked++;
			}
		}
		return redirect(`/manage?done=${refused ? "hdsome" : asked ? "hdasked" : "hdready"}#season-pack`);
	}, { closedTeams: true });
}
