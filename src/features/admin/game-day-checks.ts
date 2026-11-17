// The game check: are the coming games good to go. The 5-minute job checks each live game once as it comes within 8
// hours of tip-off (again if it's moved later, and every hour after while the alert isn't ok); Platform's button checks
// the week's without counting as any game's 8-hour check, and its verdict stands until a game's 8-hour check (or the
// week is up), checked again every hour while it isn't ok. The site is asked what they'll need: Stream answering with
// minutes to spare, each game's Go live input still there, the video joiner joining its test files, the 5-minute job
// running, and no other alert up that would touch a game. One alert, game_day: ok says what was found, warn or urgent
// raises a ticket for the admins (alerts-service.ts), and a fine check, or no live game left in the next 8 hours (the
// week, for the button's), clears it. A run whose outside calls are used up leaves it all to the next run. Never throws.
import type { AppDeps } from "../../app/deps.ts";
import { FetchBudgetSpent } from "../../platform/fetch-budget.ts";
import type { JoinResult } from "../../platform/joiner.ts";
import { addDays, formatGameDate, localTime } from "../../shared/time.ts";
import { KINDS } from "./alert-kinds.ts";
import { type AlertLevel, getAlert, listAlerts, type PlatformAlert } from "./alerts-repository.ts";
import { setAlert } from "./alerts-service.ts";
import { type LiveGame, liveGamesBetween, markReadyChecked } from "./game-day-repository.ts";
import { alertFailed } from "./problem-log.ts";

/** Stream minutes a game should have free: a long game and Stream's own margin. */
export const MINUTES_A_GAME = 150;
/** The 5-minute job is counted as stopped after this long without a run (usage-checks.ts says the same). */
const SYNC_LATE_MS = 15 * 60_000;
/** How long before tip-off a live game is checked, and how often again while the alert isn't ok. */
export const HOURS_AHEAD = 8;
const RECHECK_MS = 60 * 60_000;
const HOUR_MS = 3_600_000;
/** Alerts that don't stop a game: long-lived ones, the 3am job's night, photos, and storage (checked here, per game). */
const NOT_A_GAME: ReadonlyArray<string> = ["game_day", "budget", "ai_models", "daily_job", "images", "stream_storage"];
const NO_GAMES = `No live games in the next ${HOURS_AHEAD} hours`;
/** How far ahead Platform's button looks. */
const WEEK = "7 days", WEEK_MS = 7 * 24 * HOUR_MS;

export interface GameToCheck { team: string; startsAt: string; opponent: string; input: "there" | "gone" | null }
type JoinerAnswer = JoinResult | { ok: false; down: string } | null;
export interface GameDayInputs {
	games: GameToCheck[]; storage: { usedMinutes: number; limitMinutes: number } | null; joiner: JoinerAnswer;
	syncCheckedAt: string | null; alerts: PlatformAlert[]; now: Date; within: string; staging: boolean;
}

const RANK: Record<AlertLevel, number> = { ok: 0, warn: 1, urgent: 2 };
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const thousands = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const list = (parts: string[]) => (parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : parts.join(""));

/** The check's verdict from what was found: its level and the words Platform and the ticket show. */
export function gameDayReadiness(p: GameDayInputs): { level: AlertLevel; detail: string } {
	const fine: string[] = [], wrong: string[] = [];
	let level: AlertLevel = "ok";
	const raise = (to: AlertLevel, words: string) => { wrong.push(words); if (RANK[to] > RANK[level]) level = to; };
	const games = p.games.length
		? `${plural(p.games.length, "live game")} in the next ${p.within}: ${p.games.map((g) => `${g.team} ${formatGameDate(g.startsAt)} v ${g.opponent}`).join("; ")}.`
		: `No live games in the next ${p.within}.`;
	if (!p.storage) raise("urgent", "Stream didn't answer");
	else {
		const free = p.storage.limitMinutes - p.storage.usedMinutes;
		if (p.games.length && free < p.games.length * MINUTES_A_GAME) raise("urgent", `Stream has only ${thousands(free)} minutes free for ${plural(p.games.length, "game")} (about ${MINUTES_A_GAME} each)`);
		else fine.push(`Stream answered with ${thousands(free)} minutes free`);
	}
	for (const g of p.games.filter((x) => x.input === "gone")) raise("warn", `Stream no longer has the Go live input for ${g.team}'s game (Go live will set up a new one)`);
	const there = p.games.filter((g) => g.input === "there").length;
	if (there) fine.push(there === 1 ? "the Go live input is there" : `the ${there} Go live inputs are there`);
	if (!p.joiner) raise("warn", "no video joiner is bound to this Worker");
	else if ("down" in p.joiner) raise("warn", `the joiner didn't answer (${p.joiner.down})`);
	else if (!p.joiner.ok) raise("warn", `the joiner couldn't join its test files (${p.joiner.reason})`);
	else fine.push(`the joiner joined its test files in ${plural(p.joiner.seconds, "second")}`);
	if (p.staging) fine.push("staging has no 5-minute job");
	else if (!p.syncCheckedAt) raise("urgent", "the 5-minute job has never run");
	else if (p.now.getTime() - Date.parse(p.syncCheckedAt) > SYNC_LATE_MS) raise("urgent", `the 5-minute job hasn't run since ${formatGameDate(localTime(new Date(p.syncCheckedAt)))}`);
	else fine.push(`the 5-minute job ran ${minutesAgo(p.syncCheckedAt, p.now)}`);
	const up = p.alerts.filter((a) => a.level !== "ok" && !NOT_A_GAME.includes(a.kind));
	if (up.length) raise(up.some((a) => a.level === "urgent") ? "urgent" : "warn", `alerts already up: ${up.map((a) => `${KINDS.find((k) => k.kind === a.kind)?.label ?? a.kind} (${a.level})`).join(", ")}`);
	const detail = wrong.length ? `${games} Not ready: ${wrong.join("; ")}. Otherwise ${list(fine)}` : `${games} ${list(fine)}`;
	return { level, detail: detail.slice(0, 900) };
}

function minutesAgo(iso: string, now: Date): string {
	const minutes = Math.floor((now.getTime() - Date.parse(iso)) / 60_000);
	return minutes < 1 ? "just now" : `${plural(minutes, "minute")} ago`;
}

/** Judges `rows` and records the game_day alert: `within` says the window, as the detail does ("8 hours"). `stamp`:
 * this is the games' 8-hour check. */
async function judge(deps: AppDeps, rows: LiveGame[], within: string, stamp: boolean): Promise<void> {
	const now = deps.now();
	// Calls refused for the run's budget aren't a finding: they throw, so nothing's judged or marked until the next run.
	const or = <T>(fallback: T) => (err: unknown): T => { if (err instanceof FetchBudgetSpent) throw err; return fallback; };
	const [storage, joiner, sync, alerts, inputs] = await Promise.all([
		deps.live.storage().catch(or(null)),
		deps.joiner ? deps.joiner.selfTest().catch((err: unknown) => ({ ok: false as const, down: err instanceof Error ? err.message : String(err) })) : null,
		getAlert(deps.db, "sync_job"), listAlerts(deps.db),
		// Stream not answering is its own finding above: an input it can't be asked about isn't counted gone.
		Promise.all(rows.map((g) => (g.liveInputUid ? deps.live.getInput(g.liveInputUid).then((i) => (i ? "there" as const : "gone" as const), or(null)) : null))),
	]);
	const games = rows.map((g, i) => ({ team: g.team, startsAt: g.startsAt, opponent: g.opponent, input: inputs[i] ?? null }));
	const verdict = gameDayReadiness({ games, storage, joiner, syncCheckedAt: sync?.checkedAt ?? null, alerts, now, within, staging: deps.config.staging });
	console.log(JSON.stringify({ event: "game_day_check", teamId: null, level: verdict.level, games: games.length, within }));
	await setAlert(deps, "game_day", verdict.level, verdict.detail);
	if (stamp) await markReadyChecked(deps.db, rows, now.toISOString());
}

/** Platform's button: every live game in the next 7 days, now. A failure is logged as a problem, never thrown. */
export async function checkGames(deps: AppDeps): Promise<void> {
	try {
		await judge(deps, await weekGames(deps, deps.now()), WEEK, false);
	} catch (err) {
		await alertFailed(deps, "game_day", err);
	}
}

const weekGames = (deps: AppDeps, now: Date) => liveGamesBetween(deps.db, localTime(now), localTime(addDays(now, 7)));

/** The 5-minute job's: the live games in the next 8 hours, once any of them hasn't had its 8-hour check, and again
 * every hour while the alert isn't ok. With none, the button's verdict on the week stands for the week while it's ok,
 * and its games are checked again every hour while it isn't; any other game check alert left over, or the button's
 * once the week has no live game or is up, is set to ok, once. A failure is logged as a problem, never thrown. */
export async function checkComingGames(deps: AppDeps): Promise<void> {
	try {
		const now = deps.now();
		const rows = await liveGamesBetween(deps.db, localTime(now), localTime(new Date(now.getTime() + HOURS_AHEAD * HOUR_MS)));
		const was = await getAlert(deps.db, "game_day");
		if (!rows.length) {
			const age = was ? now.getTime() - Date.parse(was.checkedAt) : 0;
			if (was && was.detail.split(/[.:]/)[0]!.endsWith(`in the next ${WEEK}`) && age < WEEK_MS) {
				if (was.level === "ok" || age < RECHECK_MS) return;
				const week = await weekGames(deps, now);
				if (week.length) return await judge(deps, week, WEEK, false);
			}
			if (was && (was.level !== "ok" || was.detail !== NO_GAMES)) await setAlert(deps, "game_day", "ok", NO_GAMES);
			return;
		}
		const again = was !== null && was.level !== "ok" && now.getTime() - Date.parse(was.checkedAt) >= RECHECK_MS;
		if (rows.some((g) => due(g)) || again) await judge(deps, rows, `${HOURS_AHEAD} hours`, true);
	} catch (err) {
		if (!(err instanceof FetchBudgetSpent)) await alertFailed(deps, "game_day", err);
	}
}

/** A game is due its 8-hour check until a check has looked at it within 8 hours of its tip-off: one from before that
 * (it's since been moved later) doesn't count. Compared in the club's wall time, as starts_at is. */
const due = (g: LiveGame) => g.readyCheckedAt === null || localTime(new Date(Date.parse(g.readyCheckedAt) + HOURS_AHEAD * HOUR_MS)) < g.startsAt;
