// The sign-in page's tickets on the support desk (source 'site', no team: nobody's signed in): an access request, or an
// address Email Sending won't send to, each known by its kind and the address ("access:", "bounced:"). Before any team is
// known, so a CROSS_TEAM exception in scripts/rules.mjs. The table's unique index allows one open site ticket a kind: one
// open ticket of each for an address.

const KIND = (email: string) => `access:${email}`;
const INSERT = "INSERT INTO support_requests (source, alert_kind, title, topic, message, contact, created_at, updated_at)";

/** An open request for this address, if any. */
export async function hasOpenAccessRequest(db: D1Database, email: string): Promise<boolean> {
	return (await db.prepare("SELECT 1 FROM support_requests WHERE source = 'site' AND alert_kind = ? AND status <> 'resolved'").bind(KIND(email)).first()) !== null;
}

/** What `insert` gives, or null when the unique index says one of its kind for the address is open already. */
async function unlessOpen<T>(insert: () => Promise<T>): Promise<T | null> {
	try {
		return await insert();
	} catch (err) {
		if (String(err).includes("UNIQUE")) return null;
		throw err;
	}
}

/** The address's ticket; its id, or null when one of its kind for the address is open already. */
export async function insertAddressTicket(db: D1Database, r: { kind: "access" | "bounced"; email: string; title: string; message: string; nowIso: string }): Promise<number | null> {
	return unlessOpen(async () => (await db.prepare(`${INSERT} VALUES ('site', ?, ?, 'members', ?, ?, ?, ?)`)
		.bind(`${r.kind}:${r.email}`, r.title, r.message, r.email, r.nowIso, r.nowIso).run()).meta.last_row_id);
}

/** An access request's ticket, made only while the whole site has had fewer than `max` since `sinceIso`. The count is
 * in the same statement as the insert, so requests sent together can't all pass it: its id, "busy" when the site is at
 * its limit, or null when one for the address is open already. */
export async function insertAccessTicket(db: D1Database, r: { email: string; title: string; message: string; nowIso: string }, limit: { sinceIso: string; max: number }): Promise<number | "busy" | null> {
	return unlessOpen(async () => (await db.prepare(`${INSERT} SELECT 'site', ?, ?, 'members', ?, ?, ?, ?
		WHERE (SELECT COUNT(*) FROM support_requests WHERE source = 'site' AND alert_kind LIKE 'access:%' AND created_at >= ?) < ? RETURNING id`)
		.bind(KIND(r.email), r.title, r.message, r.email, r.nowIso, r.nowIso, limit.sinceIso, limit.max).first<number>("id")) ?? "busy");
}
