import { afterEach, describe, expect, it, vi } from "vitest";

// A team manager's view on a computer (public/view.js): the desktop view or the phone's, their choice, kept per device.

afterEach(() => {
	vi.unstubAllGlobals();
	vi.resetModules();
});

async function open(saved: string | null, wide = true) {
	const store: Record<string, string> = saved ? { "courtside-view": saved } : {};
	const root = { dataset: {} as Record<string, string> };
	const buttons = ["mobile", "desktop"].map((to) => ({ dataset: { viewTo: to }, on: {} as Record<string, () => void>, addEventListener(type: string, fn: () => void) { this.on[type] = fn; } }));
	let ready: (() => void) | null = null;
	const doc = { documentElement: root, cookie: "", querySelectorAll: () => buttons, addEventListener: (type: string, fn: () => void) => { if (type === "DOMContentLoaded") ready = fn; } };
	vi.stubGlobal("document", doc);
	// A wide screen with a mouse (desktop.css's media query), or a phone.
	vi.stubGlobal("matchMedia", () => ({ matches: wide }));
	vi.stubGlobal("localStorage", { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } });
	const scrollTo = vi.fn();
	vi.stubGlobal("window", { scrollTo });
	vi.resetModules(); // the script runs at load: a fresh copy each time
	// @ts-expect-error: a browser script (plain JS), tested here on its own.
	await import("../../public/view.js");
	ready!();
	return { root, store, doc, click: (to: string) => buttons.find((b) => b.dataset.viewTo === to)!.on.click!(), scrollTo };
}

describe("the team manager's view switch", () => {
	it("keeps its names to itself: a plain script in the head beside theme.js, which declares KEY and root too", async () => {
		const { readFileSync } = await import("node:fs");
		const text = readFileSync("public/view.js", "utf8");
		expect(text).toMatch(/^\(\(\) => \{\n/m);
		expect(text.trimEnd().endsWith("})();")).toBe(true);
	});
	it("applies a saved mobile view before the page paints, and nothing when there's no choice", async () => {
		expect((await open("mobile")).root.dataset).toEqual({ view: "mobile" });
		expect((await open(null)).root.dataset).toEqual({});
	});
	it("switches to the mobile view and back, remembering the choice on this device", async () => {
		const page = await open(null);
		page.click("mobile");
		expect([page.root.dataset.view, page.store["courtside-view"]]).toEqual(["mobile", "mobile"]);
		page.click("desktop");
		expect([page.root.dataset.view, page.store["courtside-view"]]).toEqual([undefined, undefined]);
		expect(page.scrollTo).toHaveBeenCalledTimes(2);
	});
	it("tells the site which view this device uses, in a cookie: the desktop view on a wide screen with a mouse unless the mobile view is chosen", async () => {
		expect((await open(null)).doc.cookie).toBe("courtside_view=desktop; Path=/; Secure; SameSite=Lax; Max-Age=2592000");
		expect((await open("mobile")).doc.cookie).toMatch(/^courtside_view=mobile; /);
		expect((await open(null, false)).doc.cookie).toMatch(/^courtside_view=mobile; /);
		const page = await open(null);
		page.click("mobile");
		expect(page.doc.cookie).toMatch(/^courtside_view=mobile; /);
		page.click("desktop");
		expect(page.doc.cookie).toMatch(/^courtside_view=desktop; /);
	});
});
