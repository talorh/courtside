// The Log's words: each line as a row of the table (who, the event, what happened in a sentence, its team, its device and
// where it came from), from any of its sources: the admin log, the sign-in page's events, the teams' Activity, or
// problems.
import type { SignInEvent, SignInLogLine } from "../../auth/sign-in-codes-repository.ts";
import { teamLabel } from "../teams/team-code.ts";
import type { ActivityLogLine } from "./activity-admin-repository.ts";
import type { AdminAction, AdminLogLine } from "./admin-log-repository.ts";
import type { ProblemLine } from "./problems-repository.ts";
import { activityWords } from "./log-activity.ts";
import { EVENTS, type LogEvent, type LogKind } from "./log-events.ts";
import { photoWords, problemWords } from "./log-photos.ts";

/** A line of the Log, from any source, to sort together. A run of photo lines is one (log-photos.ts): `n` of them, the
 * oldest at `from`. */
export type LogEntry = { at: string; admin: AdminLogLine; n?: number; from?: string } | { at: string; signIn: SignInLogLine } | { at: string; activity: ActivityLogLine }
	| { at: string; problem: ProblemLine };

/** A Log line as the table shows it. `who` is an email, or "site" for the site's own; `team` is its key (code and
 * season) and `teamName` how it reads; `device` the browser it came from ("iPhone, Safari"), or "". */
export interface LogRow {
	at: string; kind: LogKind; who: string; event: LogEvent; what: string; team: string | null; teamName: string | null; teamSeason: string | null; ip: string; device: string;
}

type Team = { code: string; seasonStart: number };
const teamCols = (team: Team | null) => ({
	team: team ? `${team.code}-${team.seasonStart}` : null, teamName: team ? teamLabel(team) : null, teamSeason: team ? teamLabel(team, { season: true }) : null,
});

/** Each admin log line in words: `t` is the team ("Saints G14.5"), `d` the line's detail. */
const WHAT: Record<AdminAction, (t: string, d: string, line: AdminLogLine) => string> = {
	team_onboarded: (_t, _d, l) => `onboarded ${l.team ? teamLabel(l.team, { season: true }) : "a team"}`,
	team_edited: (t, d) => `edited ${t}: ${d}`,
	team_closed: (t, d) => `ended ${t}'s season and closed it, to be ${d}`,
	team_reopened: (t) => `reopened ${t}`,
	delete_scheduled: (t) => `set ${t} to be deleted tonight`,
	delete_cancelled: (t) => `cancelled tonight's delete of ${t}`,
	team_deleted: (t, d) => `deleted ${t}: ${d}`,
	team_opened: (t) => `opened ${t} for the first time`,
	view_as: (t, d) => (d === "stopped" ? `stopped viewing ${t} as another role` : `viewed ${t} as ${d}`),
	support_done: (t) => `marked a support request from ${t} done`,
	support_replied: (t, d) => `answered support ${d}${t === "a team" ? "" : ` from ${t}`}`,
	support_assigned: (_t, d, l) => (d.endsWith(" to nobody") ? `let go of support ${d.slice(0, -" to nobody".length)}`
		: d.endsWith(` to ${l.adminEmail}`) ? `took support ${d.slice(0, -` to ${l.adminEmail}`.length)}` : `gave support ${d}`),
	support_status: (_t, d) => `marked support ${d}`,
	test_email: (_t, d) => `sent a test email: ${d}`,
	admin_added: (_t, d) => `added ${d} as a site admin`,
	admin_removed: (_t, d) => `removed ${d} as a site admin`,
	member_added: (t, d) => `added ${d} to ${t}`,
	member_changed: (t, d) => `changed ${d} on ${t}`,
	member_removed: (t, d) => `took ${d} off ${t}`,
	member_let_in: (t, d) => `let ${d} sign in again on ${t}, ending their wait`,
	player_added: (t, d) => `added ${d} to ${t}'s squad`,
	player_changed: (t, d) => `changed ${t}'s player ${d}`,
	player_removed: (t, d) => `took ${d} off ${t}'s squad`,
	game_added: (t, d) => `added ${d} to ${t}'s fixture`,
	game_changed: (t, d) => `changed ${t}'s game ${d}`,
	game_deleted: (t, d) => `deleted ${t}'s game ${d}`,
	video_deleted: (t, d) => `deleted ${t}'s video of ${d}`,
	video_moved: (t, d) => `moved ${t}'s video ${d}`,
	live_app_chosen: (t, d) => `set ${t}'s game ${d} to stream from an external app`,
	live_app_camera: (t, d) => `set ${t}'s game ${d} back to the phone's camera`,
	live_app_stopped: (t, d) => `ended the external app's stream of ${t}'s game ${d}`,
	game_lines_changed: (t, d) => `changed ${t}'s game lines: ${d}`,
	live_started: (t, d) => `went live on ${t}'s game ${d}`,
	live_ended: (t, d) => `ended the live stream of ${t}'s game ${d}`,
	live_test: (t, d) => `had the live stream of ${t}'s game ${d}, so it was thrown away as a test`,
	live_saved: (t, d) => `saved the live stream of ${t}'s game ${d}`,
	live_continued: (t, d) => `carried on the live stream of ${t}'s game ${d}`,
	video_joined: (t, d) => `joined the parts of ${t}'s game ${d}`,
	join_failed: (t, d) => `couldn't join the parts of ${t}'s game ${d}`,
	first_part_kept: (t, d) => `kept the first part of ${t}'s game ${d}`,
	photo_added: (t, _d, l) => photoWords(l, t), photo_deleted: (t, _d, l) => photoWords(l, t), photo_kept: (t, _d, l) => photoWords(l, t),
};

const SIGN_IN: Record<SignInEvent, string> = {
	code_sent: "was sent a sign-in code",
	signed_in: "signed in",
	wrong: "typed a wrong code",
	unknown_email: "tried to sign in: not on any team's list, so no code was sent",
	limited: "was refused: over a sign-in limit",
	robot: "was refused: the robot check (Turnstile) said no",
	desktop_view: "is using the desktop view",
	mobile_view: "is using the mobile view",
};

/** The line as a row of the table. */
export function logRow(e: LogEntry): LogRow {
	if ("signIn" in e) {
		const s = e.signIn;
		return { at: e.at, kind: "signins", who: s.email, event: s.kind, what: SIGN_IN[s.kind], ...teamCols(null), ip: s.ip, device: s.device };
	}
	if ("problem" in e) {
		const p = e.problem;
		return { at: e.at, kind: "problems", who: p.who, event: p.kind, what: problemWords(p), ...teamCols(p.team), ip: "", device: p.device };
	}
	if ("activity" in e) {
		const a = e.activity, { who, what } = activityWords(a, teamLabel(a.team));
		return { at: e.at, kind: EVENTS[a.kind].kind, who, event: a.kind, what, ...teamCols(a.team), ip: "", device: a.device };
	}
	const l = e.admin, t = l.team ? teamLabel(l.team) : "a team";
	const what = e.n && e.n > 1 ? photoWords(l, t, e.n, e.from) : WHAT[l.action](t, l.detail, l);
	return { at: e.at, kind: EVENTS[l.action].kind, who: l.adminEmail, event: l.action, what, ...teamCols(l.team), ip: "", device: l.device };
}

/** Who did it, as a person reads it. */
export const whoName = (who: string) => (who === "site" ? "The site" : who || "Someone no longer on the team");
