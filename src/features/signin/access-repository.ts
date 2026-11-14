// The sign-in page's tickets on the support desk (source 'site', no team: nobody's signed in): an access request, or an
// address Email Sending won't send to, each known by its kind and the address ("access:", "bounced:"). Before any team is
// known, so a CROSS_TEAM exception in scripts/rules.mjs. The table's unique index allows one open site ticket a kind: one
// open ticket of each for an address.

const KIND = (email: string) => `access:${email}`;

/** An open request for this address, if any. */
export async function hasOpenAccessRequest(db: D1Database, email: string): Promise<boolean> {
	return (await db.prepare("SELECT 1 FROM support_requests WHERE source = 'site' AND alert_kind = ? AND status <> 'resolved'").bind(KIND(email)).first()) !== null;
}

/** Every address's requests since `sinceIso`: the page's limit for the whole site. */
export async function countAccessRequestsSince(db: D1Database, sinceIso: string): Promise<number> {
	return (await db.prepare("SELECT COUNT(*) AS n FROM support_requests WHERE source = 'site' AND alert_kind LIKE 'access:%' AND created_at >= ?").bind(sinceIso).first<number>("n")) ?? 0;
}

/** The address's ticket; its id, or null when one of its kind for the address is open already. */
export async function insertAddressTicket(db: D1Database, r: { kind: "access" | "bounced"; email: string; title: string; message: string; nowIso: string }): Promise<number | null> {
	try {
		return (await db.prepare("INSERT INTO support_requests (source, alert_kind, title, topic, message, contact, created_at, updated_at) VALUES ('site', ?, ?, 'members', ?, ?, ?, ?)")
			.bind(`${r.kind}:${r.email}`, r.title, r.message, r.email, r.nowIso, r.nowIso).run()).meta.last_row_id;
	} catch (err) {
		if (String(err).includes("UNIQUE")) return null;
		throw err;
	}
}
