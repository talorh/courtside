import { logProblem } from "../admin/problem-log.ts";
import { checkFinalScores } from "../scores/scores-service.ts";
import { redirect } from "../../app/respond.ts";
import type { Router } from "../../app/router.ts";
import { notFound } from "../../app/errors.ts";
import { idParam } from "../../shared/validation.ts";
import { closeUnusedLive } from "../live/live-service.ts";
import { fixtureGamesWithOpenLive, setPlayhqFixtureVideo } from "./playhq-video-repository.ts";
import { getPlayhqFixture, removePlayhqFixture } from "./playhq-repository.ts";
import { checkPlayhqFixture } from "./playhq-service.ts";

/** A PlayHQ fixture's Check now, No video or Video, and Remove, on the Fixture page (Add fixture is /fixture/link). */
export function registerPlayhqRoutes(router: Router): void {
	router.post("/fixture/playhq/:id/check", "manager", async ({ params, deps, viewer }) => {
		const fixture = await getPlayhqFixture(deps.db, deps.team.id, idParam(params.id, "PlayHQ fixture"));
		if (!fixture) throw notFound("PlayHQ fixture");
		// A failed check is saved on the fixture (the page shows why) and logged; the games stay as they were.
		const ok = await checkPlayhqFixture(deps, fixture).then(() => true, async (err: unknown) => {
			console.warn(JSON.stringify({ event: "playhq_check_failed", teamId: deps.team.id, fixtureId: fixture.id, error: String(err) }));
			await logProblem(deps, { kind: "site_problem", teamId: deps.team.id, who: viewer.email, what: `PlayHQ couldn't be read for ${fixture.name} (Check now)`, error: err });
			return false;
		});
		// And any game that's over gets its final score now, rather than at the next 5-minute run. A game whose score
		// couldn't be saved is collected, not thrown, so each one is logged here as the 5-minute job logs its own.
		const { errors } = await checkFinalScores(deps).catch((err: unknown) => ({ errors: [err] }));
		for (const err of errors) {
			console.warn(JSON.stringify({ event: "playhq_score_failed", teamId: deps.team.id, fixtureId: fixture.id, error: String(err) }));
			await logProblem(deps, { kind: "site_problem", teamId: deps.team.id, who: viewer.email, what: "PlayHQ's final scores couldn't be read (Check now)", error: err });
		}
		return redirect(`/fixture?done=${ok ? "playhqchecked" : "playhqfailed"}`);
	});

	// This tournament doesn't allow filming, next year's might: switch a fixture's games (and later ones) either way.
	for (const [path, noVideo] of [["no-video", true], ["video", false]] as const) {
		router.post(`/fixture/playhq/:id/${path}`, "manager", async ({ params, deps }) => {
			const fixture = await getPlayhqFixture(deps.db, deps.team.id, idParam(params.id, "PlayHQ fixture"));
			if (!fixture) throw notFound("PlayHQ fixture");
			// As for one game: a Go live only opened is closed, and a game streaming refuses it (its footage is on its way).
			if (noVideo) for (const gameId of await fixtureGamesWithOpenLive(deps.db, deps.team.id, fixture.id)) await closeUnusedLive(deps, gameId, "set to No video");
			await setPlayhqFixtureVideo(deps.db, deps.team.id, fixture.id, noVideo, deps.now().toISOString());
			return redirect(`/fixture?done=${noVideo ? "playhqnovideo" : "playhqvideo"}`);
		});
	}

	router.post("/fixture/playhq/:id/remove", "manager", async ({ params, deps }) => {
		// Not this team's (or gone already): not found, never a "must change one row" failure.
		const fixture = await getPlayhqFixture(deps.db, deps.team.id, idParam(params.id, "PlayHQ fixture"));
		if (!fixture) throw notFound("PlayHQ fixture");
		await removePlayhqFixture(deps.db, deps.team.id, fixture.id);
		return redirect("/fixture?done=playhqremoved");
	}, { confirm: true });
}
