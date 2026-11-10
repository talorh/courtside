// The support desk, the admins' side: every team's tickets
// and the site's own, their conversations, owners and statuses. Site-wide by nature, so a CROSS_TEAM exception in
// scripts/rules.mjs.
import type { Role } from "../../auth/permissions.ts";
import type { FeatureStage, SupportTopic, TicketKind, TicketStatus } from "../support/support-repository.ts";

export interface Ticket {
	id: number; source: "team" | "site"; kind: TicketKind; stage: FeatureStage | null; teamId: string | null; team: { id: string; code: string; seasonStart: number } | null;
	member: { id: number; name: string; email: string; role: Role } | null; alertKind: string | null; title: string | null;
	topic: SupportTopic | "platform"; message: string; contact: string; status: TicketStatus; assignedTo: string | null;
	emailedAt: string | null; createdAt: string; updatedAt: string; resolvedAt: string | null; resolvedBy: string | null;
}
export type MessageKind = "reply" | "note" | "event";
export interface DeskMessage {
	id: number; ticketId: number; kind: MessageKind; memberName: string | null; adminEmail: string | null; body: string;
	emailTo: string | null; emailedAt: string | null; createdAt: string;
}
/** Each type's views: needs an answer (new and open), yours, then waiting and resolved, or each stage; and all. */
export const QUEUE_VIEWS = { support: ["attention", "mine", "waiting", "resolved", "all"], feature: ["attention", "mine", "considering", "planned", "shipped", "declined", "all"] } as const;
export type QueueView = (typeof QUEUE_VIEWS)[TicketKind][number];
/** Narrowing a queue: a team, an owner ("none": nobody's), and words (in the ticket, its title, who asked, or its number). */
export interface QueueFilters { team: string; owner: string; q: string }

const TICKET = `SELECT s.*, t.code, t.season_start, m.name, m.email, m.role FROM support_requests s
	LEFT JOIN teams t ON t.id = s.team_id LEFT JOIN members m ON m.id = s.member_id`;
// ?1 is the admin looking, ?2 the queue's type.
const WHERE: Record<QueueView, string> = {
	attention: "s.status IN ('new', 'open')", mine: "s.assigned_to = ?1 COLLATE NOCASE AND s.status <> 'resolved'",
	waiting: "s.status = 'waiting'", resolved: "s.status = 'resolved'", all: "1 = 1",
	considering: "s.stage = 'considering'", planned: "s.stage = 'planned'", shipped: "s.stage = 'shipped'", declined: "s.stage = 'declined'",
};
const VIEW_NAMES = Object.keys(WHERE) as QueueView[];
// ?3 the team, ?4 the owner, ?5 the words, each only when given.
const FILTERS = `(?3 = '' OR s.team_id = ?3) AND (?4 = '' OR (?4 = 'none' AND s.assigned_to IS NULL) OR s.assigned_to = ?4 COLLATE NOCASE)
	AND (?5 = '' OR instr(lower(s.message || ' ' || COALESCE(s.title, '') || ' ' || COALESCE(m.name, '') || ' ' || COALESCE(m.email, '') || ' #' || s.id), lower(?5)) > 0)`;

type Row = Record<string, unknown> & { id: number; source: "team" | "site"; team_id: string | null; member_id: number | null };
function toTicket(r: Row): Ticket {
	const s = (k: string) => r[k] as string;
	return {
		id: r.id, source: r.source, kind: r.kind as TicketKind, stage: r.stage as FeatureStage | null, teamId: r.team_id, team: r.team_id ? { id: r.team_id, code: s("code"), seasonStart: r.season_start as number } : null,
		member: r.member_id ? { id: r.member_id, name: s("name"), email: s("email"), role: r.role as Role } : null, alertKind: r.alert_kind as string | null,
		title: r.title as string | null, topic: r.topic as Ticket["topic"], message: s("message"), contact: s("contact"), status: r.status as TicketStatus,
		assignedTo: r.assigned_to as string | null, emailedAt: r.emailed_at as string | null, createdAt: s("created_at"), updatedAt: s("updated_at"),
		resolvedAt: r.resolved_at as string | null, resolvedBy: r.resolved_by as string | null,
	};
}

const NO_FILTERS: QueueFilters = { team: "", owner: "", q: "" };

/** A view of one type's queue, narrowed by `f`: the most recently changed first. */
export async function listQueue(db: D1Database, q: { kind: TicketKind; view: QueueView; me: string; filters?: QueueFilters }, limit: number): Promise<Ticket[]> {
	const f = q.filters ?? NO_FILTERS;
	const { results } = await db.prepare(`${TICKET} WHERE s.kind = ?2 AND ${WHERE[q.view]} AND ${FILTERS} ORDER BY s.updated_at DESC, s.id DESC LIMIT ?6`)
		.bind(q.me, q.kind, f.team, f.owner, f.q, limit).all<Row>();
	return results.map(toTicket);
}

/** How many tickets of a type are in each view, narrowed by `f`. */
export async function queueCounts(db: D1Database, kind: TicketKind, me: string, f: QueueFilters = NO_FILTERS): Promise<Record<QueueView, number>> {
	const row = await db.prepare(`SELECT ${VIEW_NAMES.map((v) => `SUM(CASE WHEN ${WHERE[v]} THEN 1 ELSE 0 END) AS "${v}"`).join(", ")}
		FROM support_requests s LEFT JOIN members m ON m.id = s.member_id WHERE s.kind = ?2 AND ${FILTERS}`)
		.bind(me, kind, f.team, f.owner, f.q).first<Record<QueueView, number | null>>();
	return Object.fromEntries(VIEW_NAMES.map((v) => [v, row?.[v] ?? 0])) as Record<QueueView, number>;
}

export const getTicket = async (db: D1Database, id: number) => {
	const row = await db.prepare(`${TICKET} WHERE s.id = ?`).bind(id).first<Row>();
	return row ? toTicket(row) : null;
};

const MESSAGE = `SELECT x.id, x.request_id, x.kind, COALESCE(NULLIF(m.name, ''), m.email) AS member_name, x.admin_email, x.body, x.email_to, x.emailed_at, x.created_at
	FROM support_messages x LEFT JOIN members m ON m.id = x.member_id`;
type MessageRow = { id: number; request_id: number; kind: MessageKind; member_name: string | null; admin_email: string | null; body: string; email_to: string | null; emailed_at: string | null; created_at: string };
const toMessage = (r: MessageRow): DeskMessage => ({
	id: r.id, ticketId: r.request_id, kind: r.kind, memberName: r.member_name, adminEmail: r.admin_email, body: r.body, emailTo: r.email_to, emailedAt: r.emailed_at, createdAt: r.created_at,
});

export async function listMessages(db: D1Database, ticketId: number): Promise<DeskMessage[]> {
	return (await db.prepare(`${MESSAGE} WHERE x.request_id = ? ORDER BY x.id`).bind(ticketId).all<MessageRow>()).results.map(toMessage);
}

export const getMessage = async (db: D1Database, id: number) => {
	const row = await db.prepare(`${MESSAGE} WHERE x.id = ?`).bind(id).first<MessageRow>();
	return row ? toMessage(row) : null;
};

/** An admin's reply, note or event on a ticket (or the site's own: no admin); its id. `emailTo` null: no email. */
export function messageStatement(db: D1Database, m: { ticket: Ticket; kind: MessageKind; adminEmail: string | null; body: string; emailTo: string | null; nowIso: string }) {
	return db.prepare("INSERT INTO support_messages (request_id, team_id, kind, admin_email, body, email_to, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
		.bind(m.ticket.id, m.ticket.teamId, m.kind, m.adminEmail, m.body, m.emailTo, m.nowIso);
}

/** The site's own ticket's name now (its alert got worse), and news: it moves up the queue. */
export const retitleStatement = (db: D1Database, id: number, title: string, nowIso: string) =>
	db.prepare("UPDATE support_requests SET title = ?, updated_at = ? WHERE id = ? AND source = 'site'").bind(title, nowIso, id);

/** A ticket's type and stage (null: not looked at yet, or a support question), and news. */
export const stageStatement = (db: D1Database, id: number, kind: TicketKind, stage: FeatureStage | null, nowIso: string) =>
	db.prepare("UPDATE support_requests SET kind = ?, stage = ?, updated_at = ? WHERE id = ?").bind(kind, stage, nowIso, id);

/** A ticket's status, owner and when it last changed, all in one; resolving says who and when. */
export function ticketStatement(db: D1Database, id: number, t: { status: TicketStatus; assignedTo: string | null; by: string; nowIso: string }) {
	return db.prepare(`UPDATE support_requests SET status = ?2, assigned_to = ?3, updated_at = ?5,
		resolved_at = CASE WHEN ?2 = 'resolved' THEN COALESCE(resolved_at, ?5) END, resolved_by = CASE WHEN ?2 = 'resolved' THEN COALESCE(resolved_by, ?4) END WHERE id = ?1`)
		.bind(id, t.status, t.assignedTo, t.by, t.nowIso);
}

export const markTicketEmailed = (db: D1Database, id: number, nowIso: string) => db.prepare("UPDATE support_requests SET emailed_at = ? WHERE id = ?").bind(nowIso, id).run();
export const markMessageEmailed = (db: D1Database, id: number, nowIso: string) => db.prepare("UPDATE support_messages SET emailed_at = ? WHERE id = ?").bind(nowIso, id).run();

// A ticket's first email is news only until it's resolved: one resolved before it could go (an alert that cleared while
// emails weren't going) is never sent.
const FIRST_UNSENT = "emailed_at IS NULL AND status <> 'resolved'";

/** Tickets whose first email hasn't gone, and messages whose email hasn't, oldest first. */
export async function listUnsent(db: D1Database, limit: number): Promise<{ tickets: number[]; messages: number[] }> {
	const [tickets, messages] = await db.batch<{ id: number }>([
		db.prepare(`SELECT id FROM support_requests WHERE ${FIRST_UNSENT} ORDER BY id LIMIT ?`).bind(limit),
		db.prepare("SELECT id FROM support_messages WHERE email_to IS NOT NULL AND emailed_at IS NULL ORDER BY id LIMIT ?").bind(limit),
	]);
	return { tickets: (tickets?.results ?? []).map((r) => r.id), messages: (messages?.results ?? []).map((r) => r.id) };
}

/** Emails still waiting since before `beforeIso` (the "emails not going" alert). */
export async function countUnsentBefore(db: D1Database, beforeIso: string): Promise<number> {
	return (await db.prepare(`SELECT (SELECT COUNT(*) FROM support_requests WHERE ${FIRST_UNSENT} AND created_at < ?1)
		+ (SELECT COUNT(*) FROM support_messages WHERE email_to IS NOT NULL AND emailed_at IS NULL AND created_at < ?1) AS n`).bind(beforeIso).first<number>("n")) ?? 0;
}

/** The site's open ticket about one of its alerts, if any (at most one: a unique index). */
export const findOpenSiteTicket = async (db: D1Database, alertKind: string) => {
	const row = await db.prepare(`${TICKET} WHERE s.source = 'site' AND s.alert_kind = ? AND s.status <> 'resolved'`).bind(alertKind).first<Row>();
	return row ? toTicket(row) : null;
};

/** The site's own ticket about an alert (no team, nobody asked), about the platform unless `topic` says otherwise; its id. */
export async function insertSiteTicket(db: D1Database, t: { alertKind: string; title: string; message: string; nowIso: string; topic?: "platform" | "videos" }): Promise<number> {
	return (await db.prepare("INSERT INTO support_requests (source, alert_kind, title, topic, message, created_at, updated_at) VALUES ('site', ?, ?, ?, ?, ?, ?)")
		.bind(t.alertKind, t.title, t.topic ?? "platform", t.message, t.nowIso, t.nowIso).run()).meta.last_row_id;
}
