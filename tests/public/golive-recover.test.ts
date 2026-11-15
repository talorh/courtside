import { afterEach, describe, expect, it, vi } from "vitest";
import { webLiveCard } from "../../src/features/live/views/web-live-card.ts";

// Go live's panel for a recording already on its way (public/golive-recover.js), on a stand-in page: the filmer's own
// recording from another phone (nothing kept on this one), so Save what was recorded and Delete it and start again.
afterEach(() => {
	vi.unstubAllGlobals();
	vi.resetModules();
});

type Fake = { hidden: boolean; disabled: boolean; textContent: string; onclick?: () => Promise<void> | void; focus(): void; getBoundingClientRect(): { top: number; bottom: number } };
const fake = (hidden = false): Fake => ({ hidden, disabled: false, textContent: "", focus() {}, getBoundingClientRect: () => ({ top: 100, bottom: 200 }) });

async function open(answers: Record<string, () => Promise<unknown>> = {}) {
	const buttons: Record<string, Fake> = Object.fromEntries(["continue", "save", "discard", "discardyes", "discardno"].map((a) => [a, fake()]));
	const parts: Record<string, Fake> = Object.fromEntries(["[data-recover-msg]", "[data-recover-carry]", "[data-recover-here]", "[data-recover-other]"].map((s) => [s, fake(true)]));
	parts["[data-discardask]"] = fake(true);
	const panel = { ...fake(true), querySelector: (sel: string) => parts[sel] };
	const card = { dataset: { game: "7", recording: "41", mine: "1" }, querySelector: () => panel };
	const busy: boolean[] = [], posted: string[] = [];
	const stored = new Map<string, string>();
	vi.stubGlobal("localStorage", { getItem: (k: string) => stored.get(k) ?? null, setItem: (k: string, v: string) => stored.set(k, v), removeItem: (k: string) => stored.delete(k) });
	vi.stubGlobal("document", {
		querySelector: () => null, visibilityState: "visible", addEventListener() {}, removeEventListener() {},
		documentElement: { dataset: {}, classList: { toggle: (_: string, on: boolean) => busy.push(on) } },
	});
	vi.stubGlobal("navigator", { wakeLock: { request: async () => ({ released: false, addEventListener() {}, release: async () => {} }) } });
	vi.stubGlobal("innerHeight", 800);
	vi.stubGlobal("scrollBy", () => {});
	const reload = vi.fn();
	vi.stubGlobal("location", { reload });
	vi.stubGlobal("fetch", async (path: string) => {
		posted.push(path);
		return Response.json({ ok: true, data: await (answers[path]?.() ?? {}) });
	});
	// @ts-expect-error: a browser script (plain JS), tested here on its own.
	const { recordingInTheWay } = await import("../../public/golive-recover.js");
	const stops = recordingInTheWay(card, { btn: (a: string) => buttons[a], say: () => {}, carryOn: {} });
	return { stops, buttons, ask: parts["[data-discardask]"]!, note: parts["[data-recover-msg]"]!, busy, posted, reload };
}

describe("a recording on its way, from another of the filmer's phones", () => {
	it("Delete it and start again asks first: Keep it changes nothing, and only Yes, delete it deletes the recording", async () => {
		const page = await open();
		expect(page.stops).toBe(true);
		await page.buttons.discard!.onclick!();
		expect(page.posted).toEqual([]);
		expect([page.ask.hidden, page.buttons.discard!.hidden]).toEqual([false, true]);
		await page.buttons.discardno!.onclick!();
		expect([page.ask.hidden, page.buttons.discard!.hidden]).toEqual([true, false]);
		expect(page.posted).toEqual([]);
		await page.buttons.discard!.onclick!();
		await page.buttons.discardyes!.onclick!();
		expect(page.posted).toEqual(["/api/uploads/41/abort"]);
		expect(page.reload).toHaveBeenCalledTimes(1);
	});
	it("Save what was recorded keeps the screen on from the tap until it has its answer", async () => {
		let saved = () => {};
		const page = await open({ "/api/live/7/save": () => new Promise((resolve) => { saved = () => resolve({ status: "saved" }); }) });
		const saving = page.buttons.save!.onclick!();
		await vi.waitFor(() => expect(page.posted).toEqual(["/api/live/7/save"]));
		expect(page.busy).toEqual([true]);
		saved();
		await saving;
		expect(page.busy).toEqual([true, false]);
		expect(page.note.textContent).toMatch(/^Saved\./);
	});
	it("the card has the question the script opens, with Yes, delete it and Keep it, hidden until Delete is tapped", () => {
		const card = webLiveCard(7, 41, false, true, "your team manager").__html;
		expect(card).toMatch(/<div class="confirmpanel" data-discardask role="alertdialog" aria-labelledby="discard-q" hidden><p id="discard-q"><b>Delete the recording\?<\/b>/);
		expect(card).toContain('<button class="btn danger" type="button" data-act="discardyes">Yes, delete it</button>');
		expect(card).toContain('<button class="btn" type="button" data-act="discardno">Keep it</button>');
	});
});
