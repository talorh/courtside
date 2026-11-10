import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A browser page that isn't the Home Screen app, so pull-refresh.js (and webapp.js, which it reads) only load.
let pullState: (dy: number, dx: number) => string;
beforeEach(async () => {
	vi.stubGlobal("navigator", { userAgent: "test", standalone: false, maxTouchPoints: 0 });
	vi.stubGlobal("matchMedia", () => ({ matches: false }));
	vi.stubGlobal("window", { addEventListener: () => {} });
	vi.stubGlobal("document", { getElementById: () => null, documentElement: { classList: { add: () => {} } } });
	// @ts-expect-error: a browser script (plain JS), tested here on its own.
	({ pullState } = await import("../../public/pull-refresh.js"));
});
afterEach(() => {
	vi.unstubAllGlobals();
	vi.resetModules();
});

describe("pull down to refresh (Home Screen app)", () => {
	it("a short drag does nothing, a longer one says pull, and past 80 px letting go reloads", () => {
		expect(pullState(5, 0)).toBe("none");
		expect(pullState(40, 3)).toBe("pull");
		expect(pullState(80, 10)).toBe("release");
		expect(pullState(200, 0)).toBe("release");
	});
	it("a sideways swipe (the roster chart, a card) isn't a pull", () => {
		expect(pullState(60, 90)).toBe("none");
		expect(pullState(120, -130)).toBe("none");
	});
});
