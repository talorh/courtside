// Photos chosen but not all sent when the page was left (a phone ignores the page's warning on leaving): the Photos
// page says so the next time it's opened, once, so nobody takes the ones that are in for all of them. Kept on this
// phone or computer only; without storage (a private window) nothing is said.
const KEY = "courtside-photos-unsent";
const DAY_MS = 24 * 60 * 60 * 1000;

/** The note, in `storage` (localStorage). */
export function unsentNote(storage) {
	const read = () => { try { return JSON.parse(storage.getItem(KEY) ?? "null"); } catch { return null; } };
	const write = (value) => {
		try {
			if (value) storage.setItem(KEY, JSON.stringify(value));
			else storage.removeItem(KEY);
		} catch { /* not kept: nothing is said next time */ }
	};
	return {
		/** `total` photos chosen on `team`'s page, at `at` (ms). */
		start(team, total, at) { write({ team, total, added: 0, at }); },
		added(added) { const note = read(); if (note) write({ ...note, added }); },
		/** All sent, or the page has said which weren't. */
		finished() { write(null); },
		/** What was left unsent on this team's page in the last day, said once: { added, total }, or null. */
		take(team, now) {
			const note = read();
			if (!note || (note.team !== team && now - note.at < DAY_MS)) return null;
			write(null);
			return note.team === team && now - note.at < DAY_MS ? { added: note.added, total: note.total } : null;
		},
	};
}

export function leftWords({ added, total }) {
	const rest = total - added;
	if (rest === 1) {
		return `The page was left before ${added ? "the last" : "the"} photo was sent. Choose it again, and keep this page open until it's in.`;
	}
	return `The page was left before the ${added ? "other " : ""}${rest} photos were sent. Choose them again, and keep this page open until they're all in.`;
}
