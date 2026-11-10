import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
	vi.unstubAllGlobals();
	vi.resetModules();
});

/** The Roster page opened at `hash`. `folded`: the week w2026-11-23 sits in Later (or Earlier) weeks, still closed. */
async function open(hash: string, folded: boolean) {
	const fold = { open: !folded };
	const week = { closest: (selector: string) => (selector === "details:not([open])" && !fold.open ? fold : null), scrollIntoView: vi.fn() };
	vi.stubGlobal("location", { hash });
	vi.stubGlobal("document", { querySelector: () => null, getElementById: (id: string) => (id === "w2026-11-23" ? week : null) });
	// @ts-expect-error: a browser script (plain JS), tested here on its own.
	await import("../../public/roster.js");
	return { fold, week };
}

describe("the roster page script", () => {
	it("a link to a week in Later or Earlier weeks (after Save week, or Back to the roster) opens that fold and shows the week", async () => {
		const { fold, week } = await open("#w2026-11-23", true);
		expect(fold.open).toBe(true);
		expect(week.scrollIntoView).toHaveBeenCalledOnce();
	});
	it("leaves a week that's already showing, or no link at all, to the browser", async () => {
		expect((await open("#w2026-11-23", false)).week.scrollIntoView).not.toHaveBeenCalled();
		vi.resetModules();
		const none = await open("", true);
		expect(none.fold.open).toBe(false);
		expect(none.week.scrollIntoView).not.toHaveBeenCalled();
	});
});
