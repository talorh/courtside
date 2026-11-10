import { logProblem } from "../admin/problem-log.ts";
import { z } from "zod";
import type { TeamDeps } from "../../app/deps.ts";
import { badRequest } from "../../app/errors.ts";
import { FetchBudgetSpent } from "../../platform/fetch-budget.ts";
import { runEach } from "../../shared/run-each.ts";
import { localTime } from "../../shared/time.ts";
import { GAME_MINUTES, gamePhase } from "../games/game-format.ts";
import { requireGame } from "../games/games-service.ts";
import type { Member } from "../members/members-repository.ts";
import { parsePlayhqLink } from "../games/playhq-service.ts";
import { enterScoreWrite, playhqScoreWrite, scoreCheckedWrite, scoresDue } from "./scores-repository.ts";

// No live scores: during the game it's In progress. From half an hour after tip-off PlayHQ
// is asked every 5-minute run until 3 hours after it (results usually go in at the final buzzer), then about hourly
// until 3 days after tip-off, then never: the team manager can always enter it. A game with a final score, either way, is never asked
// about again.
const KEEN_MINUTES = 120;
// A junior game is over well inside its hour (a tournament's are about 40 minutes), so PlayHQ is asked from half an hour
// after tip-off: a game shows its result, and stops being In progress, within a run of PlayHQ calling it final.
const FIRST_ASK_MINUTES = 30;
const GIVE_UP_DAYS = 3;
const PER_RUN = 4;

/** Points as typed: digits only, so a box left empty is refused rather than saved as 0. */
const points = z.string().trim().regex(/^\d{1,3}$/, "enter the points as a number").transform(Number).pipe(z.number().max(300));
export const scoreFormSchema = z.object({ ours: points, opponent: points });

/** A team manager's final score (or a fix to one, PlayHQ's included). Not for a game that hasn't started. */
export async function enterScore(deps: TeamDeps, member: Member, gameId: number, form: z.infer<typeof scoreFormSchema>): Promise<void> {
	const game = await requireGame(deps.db, deps.team.id, gameId);
	if (gamePhase(game.startsAt, localTime(deps.now())) === "upcoming") throw badRequest("This game hasn't started yet, so it has no score.");
	await enterScoreWrite(deps.db, deps.team.id, { gameId, ...form, enteredBy: member.id, nowIso: deps.now().toISOString() }).run();
}

/** Cron, and a fixture's Check now: PlayHQ games from half an hour after tip-off get their final score once PlayHQ has it. */
export async function checkFinalScores(deps: TeamDeps) {
	const now = deps.now();
	const local = (minutesAgo: number) => localTime(new Date(now.getTime() - minutesAgo * 60_000));
	const iso = (minutesAgo: number) => new Date(now.getTime() - minutesAgo * 60_000).toISOString();
	const due = await scoresDue(deps.db, deps.team.id, {
		overBefore: local(FIRST_ASK_MINUTES), since: local(GIVE_UP_DAYS * 24 * 60), keenAfter: local(GAME_MINUTES + KEEN_MINUTES),
		keenChecked: iso(4), olderChecked: iso(55), limit: PER_RUN,
	});
	let scoresEntered = 0;
	const { errors } = await runEach(due, async (g) => {
		const result = await deps.playhq.gameResult(parsePlayhqLink(g.url).tenant, g.playhqGameId).catch((err: unknown) => {
			if (err instanceof FetchBudgetSpent) throw err;
			// Non-fatal: PlayHQ's feed isn't the official API and can be down or change. Only the time of the try is written
			// (so the back-off holds); the team manager can enter the score by hand.
			console.warn(JSON.stringify({ event: "playhq_score_failed", teamId: deps.team.id, gameId: g.gameId, error: String(err) }));
			return logProblem(deps, { kind: "site_problem", teamId: deps.team.id, what: "PlayHQ didn't give a game's final score (it's asked again later)", error: err }).then(() => null);
		});
		const us = result ? [result.home, result.away].find((side) => side.teamId === g.playhqTeamId) : undefined;
		const them = result && us ? (us === result.home ? result.away : result.home) : undefined;
		const ours = us?.score ?? null, opponent = them?.score ?? null;
		const final = result?.status === "FINAL" && ours !== null && opponent !== null;
		const writes = [scoreCheckedWrite(deps.db, deps.team.id, g.gameId, now.toISOString())];
		if (final) writes.push(playhqScoreWrite(deps.db, deps.team.id, { gameId: g.gameId, ours, opponent, nowIso: now.toISOString() }));
		// Nothing entered: not final yet, or a team manager entered it while PlayHQ was being asked (theirs stays).
		const [, entered] = await deps.db.batch(writes);
		if (!entered?.meta.changes) return;
		scoresEntered++;
		console.log(JSON.stringify({ event: "playhq_score_entered", teamId: deps.team.id, gameId: g.gameId, ours, opponent }));
	});
	return { scoresEntered, errors };
}
