import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
	vi.unstubAllGlobals();
	vi.resetModules();
});

// @ts-expect-error: a browser script (plain JS), tested here on its own.
const load = async () => import("../../public/match-message.js") as Promise<{ waLink: (text: string) => string | null }>;

describe("the match day message's page script", () => {
	it("makes the WhatsApp link from the message as it stands, or none when it's too long for a link", async () => {
		const { waLink } = await load();
		expect(waLink("Hi Team.\n\nGreen uniform")).toBe("https://wa.me/?text=Hi%20Team.%0A%0AGreen%20uniform");
		expect(waLink("🏀 Opponent: Lakeside\n".repeat(120))).toBeNull();
	});
	it("keeps Open WhatsApp and the words under it in step as the message is changed", async () => {
		const listeners: Record<string, () => void> = {};
		const box = { value: "Hi Team.", addEventListener: (type: string, fn: () => void) => { listeners[type] = fn; } };
		const open = { href: "https://wa.me/?text=Hi%20Team.", hidden: false };
		const fits = { hidden: false }, long = { hidden: true };
		vi.stubGlobal("document", {
			getElementById: (id: string) => (id === "match-message" ? box : null),
			querySelector: (sel: string) => ({ "[data-wa]": open, "[data-wa-fits]": fits, "[data-wa-long]": long } as Record<string, unknown>)[sel] ?? null,
		});
		await load();
		box.value = "Hi Team, see you at 6.";
		listeners.input!();
		expect(open).toEqual({ href: "https://wa.me/?text=Hi%20Team%2C%20see%20you%20at%206.", hidden: false });
		box.value = "x".repeat(3000);
		listeners.input!();
		expect([open.hidden, fits.hidden, long.hidden]).toEqual([true, true, false]);
		box.value = "Short again";
		listeners.input!();
		expect([open.hidden, fits.hidden, long.hidden, open.href]).toEqual([false, false, true, "https://wa.me/?text=Short%20again"]);
	});
});
