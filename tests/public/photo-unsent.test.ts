import { describe, expect, it } from "vitest";
// @ts-expect-error: a browser script (plain JS), tested here on its own.
import { leftWords, unsentNote } from "../../public/photo-unsent.js";

const HOUR = 60 * 60 * 1000;

/** localStorage's calls, in memory. */
function memory() {
	const items = new Map<string, string>();
	return { items, getItem: (k: string) => items.get(k) ?? null, setItem: (k: string, v: string) => void items.set(k, v), removeItem: (k: string) => void items.delete(k) };
}

describe("photos left unsent when the page was left", () => {
	it("says how many were in, on the same team's page next time, and only once", () => {
		const storage = memory();
		const note = unsentNote(storage);
		note.start("b12.1-2026", 6, 0);
		note.added(1);
		expect(note.take("b12.1-2026", HOUR)).toEqual({ added: 1, total: 6 });
		expect(note.take("b12.1-2026", HOUR)).toBeNull();
	});

	it("says nothing once they've all been sent, or the page has said which weren't", () => {
		const note = unsentNote(memory());
		note.start("b12.1-2026", 3, 0);
		note.added(2);
		note.finished();
		expect(note.take("b12.1-2026", HOUR)).toBeNull();
	});

	it("keeps another team's for that team's page", () => {
		const note = unsentNote(memory());
		note.start("b14.3-2026-2", 4, 0);
		expect(note.take("b12.1-2026", HOUR)).toBeNull();
		expect(note.take("b14.3-2026-2", HOUR)).toEqual({ added: 0, total: 4 });
	});

	it("forgets one from over a day ago", () => {
		const note = unsentNote(memory());
		note.start("b12.1-2026", 6, 0);
		expect(note.take("b12.1-2026", 25 * HOUR)).toBeNull();
		expect(note.take("b12.1-2026", HOUR)).toBeNull();
	});

	it("works without storage (a private window): nothing is said", () => {
		const broken = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); }, removeItem: () => { throw new Error("denied"); } };
		const note = unsentNote(broken);
		note.start("b12.1-2026", 6, 0);
		note.added(1);
		note.finished();
		expect(note.take("b12.1-2026", HOUR)).toBeNull();
	});

	it("words it for one photo left or several", () => {
		expect(leftWords({ added: 1, total: 6 })).toBe("The page was left before the other 5 photos were sent. Choose them again, and keep this page open until they're all in.");
		expect(leftWords({ added: 2, total: 3 })).toBe("The page was left before the last photo was sent. Choose it again, and keep this page open until it's in.");
		expect(leftWords({ added: 0, total: 2 })).toBe("The page was left before the 2 photos were sent. Choose them again, and keep this page open until they're all in.");
	});
});
