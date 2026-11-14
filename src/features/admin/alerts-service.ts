import { CLUB } from "../../club.ts";
// Alerts raise tickets (basic monitoring, and only a ticket when there's something to do, so nobody's
// spammed): each kind's level is saved (Platform shows it); when it starts, the site opens a ticket saying
// what's wrong and what to do, emailed to the admins once; worse adds to that ticket (renamed for how it stands now)
// with one more email; better but still on is a line on it; back to ok resolves it by itself, with no email. No
// reminders: an open ticket stays in the queue. A ticket an admin resolved while the alert's still on is left alone until
// it gets worse.
import type { AppDeps } from "../../app/deps.ts";
import { formatGameDate, localTime } from "../../shared/time.ts";
import { type AlertKind, type AlertLevel, getAlert, saveAlert, setAlertTicket } from "./alerts-repository.ts";
import { findOpenSiteTicket, insertSiteTicket, messageStatement, retitleStatement, ticketStatement } from "./support-desk-repository.ts";
import { trySend } from "./support-desk-service.ts";

const RANK: Record<AlertLevel, number> = { ok: 0, warn: 1, urgent: 2 };

/** Each kind in words: what it's about, how it stands at each level, and what to do. */
const WORDS: Record<AlertKind, { thing: string; is: Record<"warn" | "urgent", string>; todo: string }> = {
	stream_storage: { thing: "video storage", is: { warn: "is running low", urgent: "is full" },
		todo: "buy more Stream storage in the Cloudflare dashboard (Stream, US$5 a month per 1,000 minutes). When it's full, uploads and live streams stop." },
	images: { thing: "photos", is: { warn: "are near Images' 100,000", urgent: "are nearly at Images' 100,000" }, todo: "delete old photos, or move up the Images plan." },
	daily_job: { thing: "the 3am job", is: { warn: "failed", urgent: "failed" }, todo: "look at Platform and the Worker's logs (the backup, the clean-up, deleting teams). If it hasn't run at all, check the Worker's Cron Triggers in the Cloudflare dashboard (Workers, courtside, Settings)." },
	sync_job: { thing: "the 5-minute job", is: { warn: "keeps failing", urgent: "keeps failing" }, todo: "look at the Worker's logs: uploads, live streams and video processing may be stuck. If it hasn't run at all, check the Worker's Cron Triggers in the Cloudflare dashboard (Workers, courtside, Settings)." },
	database: { thing: "the database", is: { warn: "is getting big", urgent: "is nearly full" },
		todo: "D1 includes 5 GB with Workers Paid (US$0.75 a GB a month past that) and can't grow past 10 GB: archive or delete old seasons' teams." },
	site_errors: { thing: "the site", is: { warn: "is failing", urgent: "is failing" },
		todo: "look at the Worker's logs (Observability) for request_error. Something broke, maybe the last deploy: the runbook's Rollback puts the one before back." },
	email: { thing: "emails", is: { warn: "aren't going", urgent: "aren't going" },
		todo: `check Email Sending for ${CLUB.domain} in the Cloudflare dashboard, and the Worker's logs for ticket_email_failed. Tickets are still on the site.` },
	email_allowance: { thing: "the month's emails", is: { warn: "are near the 3,000 included", urgent: "are nearly at the 3,000 included" },
		todo: "Workers Paid includes 3,000 emails a month (sign-in codes are most of them: one a device every 30 days). Past it, Email Sending charges per email or stops: check the plan in the Cloudflare dashboard before the month ends." },
	ai_models: { thing: "an AI model", is: { warn: "is to be retired", urgent: "is about to be retired" },
		todo: "pick a current model in Cloudflare's Workers AI catalog (the dashboard: AI, Workers AI, Models), change MODEL in src/platform/workers-ai.ts (the one model, for staging and the live site alike), and try Ask Virtual Team Manager, the Documentation assistant and a fixture import on staging before the day. Past it, they stop answering." },
	joiner: { thing: "the video joiner", is: { warn: "isn't answering", urgent: "couldn't join a game's video" },
		todo: "look at the courtside-join Worker's logs (Observability) and its container. A game's join is tried again every ten minutes, six times; after that its team manager is offered Keep the first part on the game's page." },
	game_day: { thing: "a coming game", is: { warn: "may have a problem", urgent: "isn't ready" },
		todo: "read what the check found (Platform, The game check) and put it right before tip-off: Stream's minutes are bought in the Cloudflare dashboard, the jobs' Cron Triggers are under the Worker's Settings, and the joiner has its own Worker and container. The check runs again every hour until tip-off and clears it once it's fine; Platform's Run the game check now checks at once." },
	budget: { thing: "a team's costs", is: { warn: "are on track to go over budget", urgent: "are over budget" },
		todo: "open the team on Costs (in the admin area): its months show where the money goes. Raise its season's budget there if it's right, or ask the team manager about how much is filmed and watched." },
};

const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
/** A ticket's name for an alert at a level: "Video storage is running low". */
const titleOf = (kind: AlertKind, level: "warn" | "urgent") => capital(`${WORDS[kind].thing} ${WORDS[kind].is[level]}`);

/** Records where `kind` stands now, and opens, adds to or resolves its ticket when that's news. `failures`: a job's failed
 * runs in a row. */
export async function setAlert(deps: AppDeps, kind: AlertKind, level: AlertLevel, detail: string, failures = 0): Promise<void> {
	const nowIso = deps.now().toISOString();
	const prev = await getAlert(deps.db, kind);
	const was = prev?.level ?? "ok";
	const since = level === "ok" ? null : was === "ok" ? nowIso : prev?.since ?? nowIso;
	await saveAlert(deps.db, { kind, level, detail, since, failures, checkedAt: nowIso });
	const open = await findOpenSiteTicket(deps.db, kind);
	const db = deps.db;
	const note = (body: string, emailTo: "admins" | null) => messageStatement(db, { ticket: open!, kind: "event", adminEmail: null, body, emailTo, nowIso });
	if (level === "ok") {
		if (open) await db.batch([ticketStatement(db, open.id, { status: "resolved", assignedTo: open.assignedTo, by: "site", nowIso }), note(`Cleared: ${detail}. Resolved by itself.`, null)]);
		return;
	}
	if (!open) {
		// Started, or worse than when an admin resolved its last ticket: a new ticket.
		if (was !== "ok" && RANK[level] <= RANK[was]) return;
		const message = `${titleOf(kind, level)}: ${detail}.\nSince ${formatGameDate(localTime(new Date(since ?? nowIso)))}.\n\nWhat to do: ${WORDS[kind].todo}`;
		const id = await insertSiteTicket(db, { alertKind: kind, title: titleOf(kind, level), message, nowIso });
		await setAlertTicket(db, kind, id);
		await trySend(deps, "ticket", id);
		return;
	}
	if (RANK[level] > RANK[was]) {
		// Its name says how it stands now, and it's news: up the queue it goes.
		const [, event] = await db.batch([retitleStatement(db, open.id, titleOf(kind, level), nowIso), note(`Worse: ${WORDS[kind].thing} ${WORDS[kind].is[level]}: ${detail}.`, "admins")]);
		await trySend(deps, "message", event?.meta.last_row_id ?? 0);
	} else if (RANK[level] < RANK[was]) {
		await note(`Better, but still on: ${detail}.`, null).run();
	}
}
