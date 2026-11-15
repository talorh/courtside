import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clubCss } from "../../src/app/club-files.ts";

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

/** WCAG contrast of two #rrggbb colours. */
const contrast = (a: string, b: string) => {
	const lum = (hex: string) => {
		const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
		return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
	};
	const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
	return (hi! + 0.05) / (lo! + 0.05);
};

describe("the pull hint's pill", () => {
	it("reads clearly on its white background in both themes: its colour is a club token that takes white text in both", () => {
		const rule = /\.pullhint\{([^}]*)\}/.exec(readFileSync("public/app.css", "utf8"))?.[1] ?? "";
		const background = /(?:^|;)background:(#[0-9a-f]{6}|#fff)(?:;|$)/i.exec(rule)?.[1]?.replace(/^#fff$/i, "#ffffff");
		const token = /(?:^|;)color:var\((--[a-z-]+)\)(?:;|$)/.exec(rule)?.[1];
		expect(background).toBe("#ffffff");
		expect(token, `.pullhint's color (${rule})`).toBeDefined();
		// The token's value in each theme of /club.css: the light one first, then the dark.
		const values = [...clubCss().matchAll(new RegExp(`${token}:(#[0-9a-fA-F]{6})`, "g"))].map((m) => m[1]!);
		expect(values).toHaveLength(3);
		for (const color of values) expect(contrast(color, background!), `${token} ${color}`).toBeGreaterThanOrEqual(4.5);
	});
});
