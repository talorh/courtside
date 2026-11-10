import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
	vi.unstubAllGlobals();
	vi.resetModules();
});

type Handler = (e?: unknown) => unknown;

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1";

/** A phone opening a page: `faq` puts the Help page's install box on it; `standalone`/`displayMode` say it was opened from the Home Screen. */
async function open({ faq = true, standalone = false, displayMode = false, userAgent = "test" } = {}) {
	const on: Record<string, Handler> = {};
	const button = { hidden: true, click: (() => {}) as Handler, addEventListener: (_: string, fn: Handler) => { button.click = fn; } };
	const note = { textContent: "" };
	const box = { hidden: true, querySelector: (sel: string) => (sel === "button" ? button : note) };
	const marked: string[] = [];
	vi.stubGlobal("navigator", { userAgent, standalone, maxTouchPoints: 5 });
	vi.stubGlobal("matchMedia", (q: string) => ({ matches: displayMode && q === "(display-mode: standalone)" }));
	vi.stubGlobal("window", { addEventListener: (type: string, fn: Handler) => { on[type] = fn; } });
	vi.stubGlobal("document", { getElementById: (id: string) => (faq && id === "install-box" ? box : null), documentElement: { classList: { add: (c: string) => marked.push(c) }, dataset: { site: "Courtside" } } });
	// @ts-expect-error: a browser script (plain JS), tested here on its own.
	await import("../../public/webapp.js");
	return { on, box, button, note, marked };
}

/** What Chrome hands the page when the site can be installed. */
const offer = (outcome: "accepted" | "dismissed") => ({ preventDefault: vi.fn(), prompt: vi.fn(async () => {}), userChoice: Promise.resolve({ outcome }) });

describe("the site as an app on the Home Screen", () => {
	it("holds back the browser's own install banner, and the Help page offers an Install button instead", async () => {
		const page = await open();
		expect(page.box.hidden).toBe(true);
		const e = offer("accepted");
		page.on.beforeinstallprompt!(e);
		expect(e.preventDefault).toHaveBeenCalled();
		expect(page.box.hidden).toBe(false);
		expect(page.button.hidden).toBe(false);
		await page.button.click();
		expect(e.prompt).toHaveBeenCalledTimes(1);
		expect(page.note.textContent).toContain("Installing");
		page.on.appinstalled!();
		expect(page.note.textContent).toBe("Installed. Look for Courtside on your Home Screen.");
		expect(page.button.hidden).toBe(true);
		// A browser only lets a page ask once: tapping again does nothing.
		await page.button.click();
		expect(e.prompt).toHaveBeenCalledTimes(1);
	});
	it("holds the banner back on every other page too (it could cover Go live's buttons)", async () => {
		const page = await open({ faq: false });
		const e = offer("accepted");
		page.on.beforeinstallprompt!(e);
		expect(e.preventDefault).toHaveBeenCalled();
	});
	it("says so when the offer is turned down, and the button goes (it can't ask again)", async () => {
		const page = await open();
		page.on.beforeinstallprompt!(offer("dismissed"));
		await page.button.click();
		expect(page.button.hidden).toBe(true);
		expect(page.note.textContent).toContain("The steps below work any time");
	});
	it("opened from the Home Screen (iPhone or Android): says it's done (pull down reloads: pull-refresh.js)", async () => {
		for (const how of [{ standalone: true }, { displayMode: true }]) {
			const page = await open(how);
			expect(page.marked).toEqual([]);
			expect(page.box.hidden).toBe(false);
			expect(page.button.hidden).toBe(true);
			expect(page.note.textContent).toContain("You're in the app now");
			// Never offers to install what's already open as the app.
			page.on.beforeinstallprompt!(offer("accepted"));
			expect(page.button.hidden).toBe(true);
			vi.resetModules();
		}
	});
	it("in Safari on an iPhone, says there's no Install button there (Apple's rule) instead of leaving a gap", async () => {
		const page = await open({ userAgent: IPHONE });
		expect(page.box.hidden).toBe(false);
		expect(page.button.hidden).toBe(true);
		expect(page.note.textContent).toContain("No Install button on an iPhone or iPad");
		expect(page.marked).toEqual([]);
	});
	it("in a browser with nothing to offer yet (Firefox, or Chrome before it's ready), the box stays hidden", async () => {
		const page = await open();
		expect(page.box.hidden).toBe(true);
		expect(page.marked).toEqual([]);
	});
});
