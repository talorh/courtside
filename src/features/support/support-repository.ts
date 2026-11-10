// Team managers' support tickets, their side (tickets, like a service
// desk): asking (a question, or a feature request), their own tickets and the replies on them, and answering. Saved first, then emailed. Every query names
// the team, and a team manager only ever reads their own tickets.

export const SUPPORT_TOPICS = ["members", "videos", "live", "fixture", "other"] as const;
export type SupportTopic = (typeof SUPPORT_TOPICS)[number];
/** The site's own tickets (monitoring) are about the platform. */
export const TOPIC_LABELS: Record<SupportTopic | "platform", string> = {
	members: "Members and signing in", videos: "Videos and uploads", live: "Live streaming", fixture: "Fixture and roster", other: "Something else", platform: "The site itself",
};
export type TicketStatus = "new" | "open" | "waiting" | "resolved";

/** A ticket's type: a support question, or a feature request (an idea for the site). */
export type TicketKind = "support" | "feature";
/** Where a feature request stands, once an admin has looked at it: shipped and declined close it. */
export const FEATURE_STAGES = ["considering", "planned", "shipped", "declined"] as const;
export type FeatureStage = (typeof FEATURE_STAGES)[number];
/** The form's choices: what a question's about, or a feature request (saved as about something else). */
export const ASK_CHOICES = [...SUPPORT_TOPICS, "feature"] as const;
export const ASK_LABELS: Record<(typeof ASK_CHOICES)[number], string> = { ...TOPIC_LABELS, feature: "Feature request: an idea for the site" };

export interface SupportInput { kind: TicketKind; topic: SupportTopic; message: string; contact: string }
export interface MyTicket { id: number; kind: TicketKind; stage: FeatureStage | null; topic: SupportTopic; message: string; status: TicketStatus; createdAt: string; updatedAt: string }
/** A reply on a ticket as its team manager sees it: theirs, or an admin's (never a private note or an event). */
export interface PublicReply { fromManager: boolean; adminEmail: string | null; body: string; createdAt: string }

const MINE = "SELECT id, kind, stage, topic, message, status, created_at AS createdAt, updated_at AS updatedAt FROM support_requests WHERE team_id = ? AND member_id = ? AND source = 'team'";

export async function insertSupport(db: D1Database, teamId: string, memberId: number, r: SupportInput, nowIso: string): Promise<number> {
	const result = await db.prepare("INSERT INTO support_requests (team_id, member_id, kind, topic, message, contact, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
		.bind(teamId, memberId, r.kind, r.topic, r.message, r.contact, nowIso, nowIso).run();
	return result.meta.last_row_id;
}

/** How many this person has asked since `sinceIso`. */
export async function countSupportSince(db: D1Database, teamId: string, memberId: number, sinceIso: string): Promise<number> {
	return (await db.prepare("SELECT COUNT(*) AS n FROM support_requests WHERE team_id = ? AND member_id = ? AND created_at >= ?")
		.bind(teamId, memberId, sinceIso).first<number>("n")) ?? 0;
}

/** Their own tickets, the most recently changed first. */
export async function listMyTickets(db: D1Database, teamId: string, memberId: number, limit: number): Promise<MyTicket[]> {
	return (await db.prepare(`${MINE} ORDER BY updated_at DESC, id DESC LIMIT ?`).bind(teamId, memberId, limit).all<MyTicket>()).results;
}

export const getMyTicket = (db: D1Database, teamId: string, memberId: number, id: number) =>
	db.prepare(`${MINE} AND id = ?`).bind(teamId, memberId, id).first<MyTicket>();

export async function listPublicReplies(db: D1Database, teamId: string, ticketId: number): Promise<PublicReply[]> {
	const { results } = await db.prepare(`SELECT member_id IS NOT NULL AS from_manager, admin_email, body, created_at FROM support_messages
		WHERE team_id = ? AND request_id = ? AND kind = 'reply' ORDER BY id`).bind(teamId, ticketId)
		.all<{ from_manager: number; admin_email: string | null; body: string; created_at: string }>();
	return results.map((r) => ({ fromManager: r.from_manager === 1, adminEmail: r.admin_email, body: r.body, createdAt: r.created_at }));
}

/** How many replies this person has written since `sinceIso`. */
export async function countRepliesSince(db: D1Database, teamId: string, memberId: number, sinceIso: string): Promise<number> {
	return (await db.prepare("SELECT COUNT(*) AS n FROM support_messages WHERE team_id = ? AND member_id = ? AND created_at >= ?")
		.bind(teamId, memberId, sinceIso).first<number>("n")) ?? 0;
}

/** The team manager's reply, for the admins, and their ticket open again (a new one stays new); the reply's id. */
export async function replyAsManager(db: D1Database, teamId: string, memberId: number, ticketId: number, body: string, nowIso: string): Promise<number> {
	const [, insert] = await db.batch([
		db.prepare(`UPDATE support_requests SET status = CASE status WHEN 'new' THEN 'new' ELSE 'open' END, resolved_at = NULL, resolved_by = NULL, updated_at = ?
			WHERE team_id = ? AND member_id = ? AND id = ?`).bind(nowIso, teamId, memberId, ticketId),
		db.prepare("INSERT INTO support_messages (request_id, team_id, kind, member_id, body, email_to, created_at) VALUES (?, ?, 'reply', ?, ?, 'admins', ?)")
			.bind(ticketId, teamId, memberId, body, nowIso),
	]);
	return insert?.meta.last_row_id ?? 0;
}
