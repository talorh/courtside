import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
	vi.unstubAllGlobals();
	vi.resetModules();
});

type Handler = (e?: unknown) => unknown;
interface Fake { textContent: string; className: string; disabled?: boolean; onclick?: Handler; children: Fake[]; on: Record<string, Handler>; removed: boolean }

/** A page with the door on it. */
async function open() {
	const made: Fake[] = [];
	const element = (): Fake & Record<string, unknown> => {
		const e = { textContent: "", className: "", children: [] as Fake[], on: {} as Record<string, Handler>, removed: false,
			setAttribute: () => {}, append: (...kids: Fake[]) => { e.children.push(...kids); }, replaceChildren: () => {},
			addEventListener: (type: string, fn: Handler) => { e.on[type] = fn; }, remove: () => { e.removed = true; }, focus: () => {} };
		made.push(e);
		return e;
	};
	const door = element();
	const fetch = vi.fn(async () => new Response("{\"ok\":true}", { status: 200 }));
	const assign = vi.fn();
	vi.stubGlobal("fetch", fetch);
	vi.stubGlobal("location", { assign });
	vi.stubGlobal("document", { createElement: element, body: { append: () => {} }, querySelectorAll: () => [door] });
	// @ts-expect-error: a browser script (plain JS), tested here on its own.
	const mod = await import("../../public/signout.js");
	const texts = () => made.map((e) => e.textContent).filter(Boolean);
	const buttonNamed = (text: string) => made.find((e) => e.textContent === text)!;
	return { mod, door, fetch, assign, texts, buttonNamed };
}

// The site's own sign-in: signing out ends this device's session at POST /signout; no more waiting for
// Access to stop taking the old sign-in.
describe("signing out (the door at the top right)", () => {
	it("asks first, then has the site end the session in the background and stays on the page, with Sign in again at once", async () => {
		const page = await open();
		page.door.on.click!({ preventDefault: () => {} });
		expect(page.texts()).toContain("Sign out?");
		expect(page.fetch).not.toHaveBeenCalled();
		await page.buttonNamed("Sign out").onclick!();
		expect(page.fetch).toHaveBeenCalledWith("/signout", { method: "POST", headers: { Accept: "application/json" }, cache: "no-store" });
		expect(page.texts()).toContain("Signed out");
		const again = page.buttonNamed("Sign in again");
		expect(again.disabled).toBeFalsy();
		again.onclick!();
		expect(page.assign).toHaveBeenCalledWith("/signin");
	});
	it("says so when the site can't be reached, or refuses, and lets them try again", async () => {
		const page = await open();
		page.fetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));
		page.door.on.click!({ preventDefault: () => {} });
		await page.buttonNamed("Sign out").onclick!();
		expect(page.texts()).toContain("Couldn't reach the site. Check your connection, then try again.");
		expect(page.buttonNamed("Sign out").disabled).toBe(false);
		page.fetch.mockResolvedValueOnce(new Response("", { status: 503 }));
		await page.buttonNamed("Sign out").onclick!();
		expect(page.texts()).not.toContain("Signed out");
	});
});
