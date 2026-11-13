// An address Email Sending won't send to, as the support desk's own ticket (source 'site', no team: nobody's signed in),
// known by its kind, "bounced:" and the address. Before any team is known, so a CROSS_TEAM exception in
// scripts/rules.mjs. The table's unique index allows one open site ticket a kind: one open ticket for an address.

/** The address's ticket; its id, or null when one is open already. */
export async function insertBouncedTicket(db: D1Database, t: { email: string; title: string; message: string; nowIso: string }): Promise<number | null> {
	try {
		return (await db.prepare("INSERT INTO support_requests (source, alert_kind, title, topic, message, contact, created_at, updated_at) VALUES ('site', ?, ?, 'members', ?, ?, ?, ?)")
			.bind(`bounced:${t.email}`, t.title, t.message, t.email, t.nowIso, t.nowIso).run()).meta.last_row_id;
	} catch (err) {
		if (String(err).includes("UNIQUE")) return null;
		throw err;
	}
}
