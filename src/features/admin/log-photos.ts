// Lines that come in runs, made one in the admin Log. Phones send photos one at a time, so a line each would swamp the
// Log: one person's photos added (or deleted) on one team, from one device, within 30 minutes of each other make one
// line, "added 24 photos to Saints G14.5 (7:02pm to 7:40pm)". A problem that happened again is counted on its own line
// as it's written (problem-log.ts): "(12 times, 7:00pm to 8:00pm)".
import { PHOTO_REMOVAL_ASKED } from "../photos/photo-removals-service.ts";
import { PHOTO_SEASON_OVER } from "../photos/photos-service.ts";
import { formatClock, localTime } from "../../shared/time.ts";
import type { AdminLogLine } from "./admin-log-repository.ts";
import type { ProblemLine } from "./problems-repository.ts";
import type { LogEntry } from "./log-words.ts";

const WINDOW_MS = 30 * 60_000;
const GROUPED = new Set(["photo_added", "photo_deleted"]);

type AdminEntry = Extract<LogEntry, { admin: AdminLogLine }>;

/** `entries` newest first, each run of photo lines made one: its time the newest, `n` how many, `from` the oldest's time. */
export function groupPhotos(entries: LogEntry[]): LogEntry[] {
	const open = new Map<string, AdminEntry>();
	const out: LogEntry[] = [];
	for (const e of entries) {
		if (!("admin" in e) || !GROUPED.has(e.admin.action)) {
			out.push(e);
			continue;
		}
		const l = e.admin, key = [l.adminEmail.toLowerCase(), l.action, l.detail, l.team?.code, l.team?.seasonStart, l.device].join("|");
		const group = open.get(key);
		if (group && Date.parse(group.from ?? group.at) - Date.parse(e.at) <= WINDOW_MS) {
			group.n = (group.n ?? 1) + 1;
			group.from = e.at;
			continue;
		}
		const fresh: AdminEntry = { ...e, n: 1 };
		open.set(key, fresh);
		out.push(fresh);
	}
	return out;
}

const clock = (iso: string) => formatClock(localTime(new Date(iso)).slice(11, 16));
const WHY: Record<string, string> = { [PHOTO_REMOVAL_ASKED]: " after a removal request", [PHOTO_SEASON_OVER]: ": the season's over" };

/** A photo line in words: `t` the team; `n` photos, the oldest at `from`, the newest at `at`. */
export function photoWords(l: AdminLogLine, t: string, n = 1, from = l.at): string {
	const span = n > 1 && clock(from) !== clock(l.at) ? ` (${clock(from)} to ${clock(l.at)})` : "";
	if (l.action === "photo_added") return `added ${n === 1 ? "a photo" : `${n} photos`} to ${t}${span}`;
	if (l.action === "photo_deleted") return `deleted ${n === 1 ? "one" : n} of ${t}'s photos${WHY[l.detail] ?? ""}${span}`;
	return `kept one of ${t}'s photos after a removal request${l.detail ? `: “${l.detail}”` : ""}`;
}

/** A problem in words: what failed, why, and how many times. */
export function problemWords(p: ProblemLine): string {
	const times = p.times > 1 ? ` (${p.times} times, ${clock(p.firstAt)} to ${clock(p.at)})` : "";
	return `${p.what}${p.detail ? `: ${p.detail}` : ""}${times}`;
}
