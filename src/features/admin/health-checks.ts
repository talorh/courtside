// Insights' Alerts checks: each thing the site watches, as green, amber (a warning), red (urgent) or grey (not checked
// yet), with its figure and where it's dealt with. The platform's alerts (usage-checks.ts) as they stand, and what the
// page checks itself as it opens: the nightly backup and clean-up, Stream answering, videos stuck or failed, the
// Worker's errors in the last day, and the sign-in page refusing more than usual.
import type { SignInFigures } from "../../auth/sign-in-codes-repository.ts";
import type { CloudflareFigures } from "../../platform/cloudflare-insights.ts";
import type { StoredObject } from "../../platform/r2-originals.ts";
import { formatGameDate, localTime } from "../../shared/time.ts";
import type { PlatformAlert } from "./alerts-repository.ts";
import type { HealthCounts } from "./health-repository.ts";
import { KINDS } from "./alert-kinds.ts";

export type HealthLevel = "ok" | "warn" | "urgent" | "idle";
export interface Check { name: string; level: HealthLevel; figure: string; href: string; since?: string | null; ticketId?: number | null }

interface HealthInputs {
	alerts: PlatformAlert[]; counts: HealthCounts; now: Date; staging: boolean;
	lastBackup: StoredObject | null; lastSweep: StoredObject | null;
	/** Stream's minutes, or null when it didn't answer. */
	storage: { usedMinutes: number; limitMinutes: number } | null;
	/** The Worker's last 24 hours: null when not read (no token: `cloudflare` false). */
	day: CloudflareFigures | null; cloudflare: boolean;
	signIns: SignInFigures;
}

const HOUR_MS = 3_600_000;
/** A video processing this long since it started is stuck: a live game's starts with the stream, so a game of up to
 * two hours and Stream's half hour or so of processing fit inside it. */
export const STUCK_HOURS = 4;
/** A night missed: the backup and clean-up run every night. */
const STALE_HOURS = 36;
/** The Worker's errors in a day, as a share of its requests: 1% warns, 5% is urgent. */
const ERRORS = { warn: 0.01, urgent: 0.05 };
/** Sign-in attempts refused in a day (unknown emails, over a limit, the robot check) past which someone may be trying. */
const REFUSED_A_DAY = 100;

const when = (iso: string) => formatGameDate(localTime(new Date(iso)));
const age = (iso: string, now: Date) => (now.getTime() - Date.parse(iso)) / HOUR_MS;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function alertChecks(p: HealthInputs): Check[] {
	return KINDS.map((k) => {
		const a = p.alerts.find((x) => x.kind === k.kind);
		const href = k.kind === "budget" ? "/admin/costs" : "/admin/platform";
		if (!a) return { name: k.label, level: "idle", figure: p.staging && /job/.test(k.kind) ? "Staging: runs only when asked" : k.first.split(":")[0]!, href };
		return { name: k.label, level: a.level, figure: a.detail, href, since: a.since, ticketId: a.ticketId };
	});
}

function nightly(name: string, at: string | undefined, failed: string | undefined, p: HealthInputs): Check {
	if (!at) return { name, level: p.staging ? "idle" : "warn", figure: p.staging ? "Staging has none" : "None yet", href: "/admin/platform" };
	if (failed) return { name, level: "warn", figure: `${when(at)}: ${failed}`, href: "/admin/platform" };
	const level = age(at, p.now) > STALE_HOURS ? "warn" : "ok";
	return { name, level, figure: `${level === "ok" ? "Last" : "Not since"} ${when(at)}`, href: "/admin/platform" };
}

export function healthChecks(p: HealthInputs): Check[] {
	const b = p.lastBackup, s = p.lastSweep, c = p.counts, d = p.day;
	const share = d && d.workers.requests ? d.workers.errors / d.workers.requests : 0;
	return [
		...alertChecks(p),
		nightly("Nightly backup", b?.uploaded, b?.custom.problems ? `failed its checks (${b.custom.problems})` : undefined, p),
		nightly("Nightly clean-up", s?.custom.at, s?.custom.at && s.custom.ok !== "yes" ? `didn't finish (${s.custom.problem})` : undefined, p),
		{ name: "Stream answering", level: p.storage ? "ok" : "warn", figure: p.storage ? "Answered just now" : "Didn't answer in 3 seconds", href: "/admin/platform" },
		{ name: "Videos processing", level: c.stuck ? "warn" : "ok", figure: c.stuck ? `${plural(c.stuck, "video")} processing for over ${STUCK_HOURS} hours` : "None stuck", href: "/admin/log?show=videos" },
		{ name: "Uploads failed", level: c.failed ? "warn" : "ok", figure: c.failed ? `${plural(c.failed, "upload")} failed in the last 7 days` : "None in the last 7 days", href: "/admin/log?show=videos&event=video_failed" },
		{
			name: "Worker errors", href: "/admin/platform",
			level: !p.cloudflare || !d ? "idle" : share >= ERRORS.urgent ? "urgent" : share >= ERRORS.warn ? "warn" : "ok",
			figure: !p.cloudflare ? "Needs the read-only token" : !d ? "Cloudflare didn't answer" : `${plural(d.workers.errors, "error")} in ${d.workers.requests.toLocaleString("en-AU")} requests, last 24 hours`,
		},
		{ name: "Sign-ins refused", level: p.signIns.refused > REFUSED_A_DAY ? "warn" : "ok", figure: `${p.signIns.refused} in the last 24 hours`, href: "/admin/log?show=signins" },
	];
}

