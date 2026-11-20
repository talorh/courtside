import { afterEach, describe, expect, it, vi } from "vitest";
import { webLiveCard } from "../../src/features/live/views/web-live-card.ts";
import { fakeIndexedDb } from "../helpers/fake-indexeddb.ts";
// @ts-expect-error plain browser module, no types
import { openStore } from "../../public/golive-store.js";

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
	vi.stubGlobal("addEventListener", () => {});
	vi.stubGlobal("removeEventListener", () => {});
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
	it("the card has the progress bar Save and Carry on move along, and how to stop the phone getting hot", () => {
		const card = webLiveCard(7, 41, false, true, "your team manager").__html;
		expect(card).toContain('<p class="small" data-recover-msg role="status"></p>\n<progress data-recover-bar max="1" value="0" hidden></progress></div>');
		expect(card).toContain("<b>Phones get hot</b> filming a whole game: take it out of its case, keep it out of the sun and turn the brightness down.");
		expect(card).toContain("Anything that phone hadn't sent yet is only on it, so save from that phone if you can.");
	});
});

describe("what this phone kept for a recording the site no longer has open", () => {
	async function phoneWith(recording: string) {
		const stored = new Map<string, string>([
			["courtside-live:7", JSON.stringify({ videoId: 41, segment: 2, partSize: 1000, etags: { 1: '"e1"' } })],
			["courtside-live:7:kept", JSON.stringify([{ videoId: 41, segment: 1, etags: { 1: '"e1"' } }])],
		]);
		vi.stubGlobal("localStorage", { getItem: (k: string) => stored.get(k) ?? null, setItem: (k: string, v: string) => stored.set(k, v), removeItem: (k: string) => stored.delete(k) });
		vi.stubGlobal("document", { querySelector: () => null, documentElement: { dataset: {} }, addEventListener() {} });
		const idb = fakeIndexedDb();
		vi.stubGlobal("indexedDB", idb);
		const store = await openStore();
		const bytes = new Blob([new Uint8Array(10)], { type: "video/mp4" });
		await store.putPart("41/1", 2, bytes);
		await store.putTail("41/2", 0, bytes);
		await store.putPart("52/1", 1, bytes); // another game's recording, still on its way
		// @ts-expect-error: a browser script (plain JS), tested here on its own.
		const { recordingInTheWay } = await import("../../public/golive-recover.js");
		const card = { dataset: { game: "7", recording }, querySelector: () => null };
		const stops = recordingInTheWay(card, { btn: () => fake(), say: () => {}, carryOn: {} });
		await new Promise((resolve) => setTimeout(resolve, 20));
		const keys = [...idb.rows("parts"), ...idb.rows("tail")].map((r) => r.k);
		return { stops, keys, stored };
	}
	it("saved or deleted elsewhere: the footage it kept goes with the notes, and nothing of any other recording", async () => {
		const phone = await phoneWith("");
		expect(phone.stops).toBe(false);
		expect(phone.keys).toEqual(["52/1/1"]);
		expect([...phone.stored.keys()]).toEqual([]);
	});
});

describe("Save on the phone that made the recording: what it kept goes first, or nothing is saved", () => {
	async function ownPhone(storage: "fine" | "broken" | "fails-sending", answers: Record<string, () => Promise<unknown>> = {}, keeps = true, earlier = false) {
		const buttons: Record<string, Fake> = Object.fromEntries(["continue", "save", "discard", "discardyes", "discardno"].map((a) => [a, fake()]));
		const parts: Record<string, Fake & { max?: number; value?: number }> = Object.fromEntries(["[data-recover-msg]", "[data-recover-carry]", "[data-recover-here]", "[data-recover-other]", "[data-discardask]", "[data-recover-bar]"].map((s) => [s, fake(true)]));
		const panel = { ...fake(true), querySelector: (sel: string) => parts[sel] };
		const card = { dataset: { game: "7", recording: "41", mine: "1", ended: "1" }, querySelector: () => panel };
		const stored = new Map<string, string>([["courtside-live:7", JSON.stringify({ videoId: 41, segment: earlier ? 2 : 1, partSize: 10, etags: { 1: '"e1"' }, keeps })]]);
		if (earlier) stored.set("courtside-live:7:kept", JSON.stringify([{ videoId: 41, segment: 1, partSize: 10, etags: {} }]));
		vi.stubGlobal("localStorage", { getItem: (k: string) => stored.get(k) ?? null, setItem: (k: string, v: string) => stored.set(k, v), removeItem: (k: string) => stored.delete(k) });
		vi.stubGlobal("document", { querySelector: () => null, visibilityState: "visible", addEventListener() {}, removeEventListener() {}, documentElement: { dataset: {}, classList: { toggle() {} } } });
		vi.stubGlobal("navigator", { onLine: true, wakeLock: { request: async () => ({ released: false, addEventListener() {}, release: async () => {} }) } });
		vi.stubGlobal("innerHeight", 800);
		vi.stubGlobal("scrollBy", () => {});
		const leaving: string[] = [];
		vi.stubGlobal("addEventListener", (type: string) => leaving.push(`+${type}`));
		vi.stubGlobal("removeEventListener", (type: string) => leaving.push(`-${type}`));
		const idb = fakeIndexedDb();
		vi.stubGlobal("indexedDB", idb);
		const store = await openStore();
		await store.putPart("41/1", 2, new Blob([new Uint8Array(10)], { type: "video/mp4" }));
		if (storage === "broken") vi.stubGlobal("indexedDB", { open: () => { throw new Error("storage didn't open"); } });
		if (storage === "fails-sending") idb.failGets = true;
		const posted: Array<[string, string]> = [];
		vi.stubGlobal("fetch", async (path: string, init: { body: string | Blob }) => {
			if (path.endsWith("/part-urls")) return Response.json({ ok: true, data: { urls: { 2: "https://r2.test/part/2" } } });
			if (path.startsWith("https://r2.test/")) { posted.push([path, ""]); return new Response(null, { headers: { ETag: '"e2"' } }); }
			posted.push([path, typeof init?.body === "string" ? init.body : ""]);
			return Response.json({ ok: true, data: await (answers[path]?.() ?? { status: "saved" }) });
		});
		// @ts-expect-error: a browser script (plain JS), tested here on its own.
		const { recordingInTheWay } = await import("../../public/golive-recover.js");
		recordingInTheWay(card, { btn: (a: string) => buttons[a], say: () => {}, carryOn: { mime: "video/mp4" } });
		return { buttons, note: parts["[data-recover-msg]"]!, bar: parts["[data-recover-bar]"]!, posted, stored, leaving, idb };
	}

	it("says it's checking the moment Save is tapped, before anything else", async () => {
		const page = await ownPhone("fine");
		const saving = page.buttons.save!.onclick!();
		expect(page.buttons.save!.textContent).toBe("Checking what's on this phone…");
		expect(page.note.textContent).toBe("Checking what's on this phone…");
		await saving;
	});
	it("sends what it kept with a progress bar, asks before the page is left meanwhile, then saves", async () => {
		const page = await ownPhone("fine");
		await page.buttons.save!.onclick!();
		expect(page.posted.map(([p]) => p)).toEqual(["https://r2.test/part/2", "/api/live/7/save"]);
		expect(page.bar.hidden).toBe(false);
		expect(page.bar.max).toBe(1);
		expect(page.leaving).toEqual(["+beforeunload", "-beforeunload"]);
		expect(page.note.textContent).toMatch(/^Saved\./);
	});
	it("storage that can't be read: tried again, then nothing is saved or cleared, the filmer is told, and the site hears of it", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		try {
			const page = await ownPhone("broken");
			const saving = page.buttons.save!.onclick!();
			await vi.runAllTimersAsync();
			await saving;
			const paths = page.posted.map(([p]) => p);
			expect(paths).not.toContain("/api/live/7/save");
			expect(paths.filter((p) => p === "/api/live/7/events").length).toBeGreaterThan(0);
			expect(page.posted.find(([p]) => p === "/api/live/7/events")![1]).toContain("recording store unreadable");
			expect(page.note.textContent).toMatch(/^This phone's copy of the recording couldn't be read just now, so nothing has been saved yet/);
			expect(page.stored.has("courtside-live:7")).toBe(true);
			expect(page.buttons.save!.disabled).toBe(false);
		} finally {
			vi.useRealTimers();
		}
	});
	it("a phone whose storage never worked while it recorded kept nothing, so unreadable storage doesn't stop the save", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		try {
			const page = await ownPhone("broken", {}, false);
			const saving = page.buttons.save!.onclick!();
			await vi.runAllTimersAsync();
			await saving;
			expect(page.posted.map(([p]) => p)).toContain("/api/live/7/save");
			expect(page.note.textContent).toMatch(/^Saved\./);
		} finally {
			vi.useRealTimers();
		}
	});
	it("an earlier segment's copy noted on the phone: unreadable storage stops the save even when this segment kept nothing", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		try {
			const page = await ownPhone("broken", {}, false, true);
			const saving = page.buttons.save!.onclick!();
			await vi.runAllTimersAsync();
			await saving;
			expect(page.posted.map(([p]) => p)).not.toContain("/api/live/7/save");
			expect(page.note.textContent).toMatch(/^This phone's copy of the recording couldn't be read just now/);
		} finally {
			vi.useRealTimers();
		}
	});
	it("storage that fails part way through sending: nothing is saved, the filmer is told, and the next tap reads it afresh", async () => {
		const page = await ownPhone("fails-sending");
		await page.buttons.save!.onclick!();
		expect(page.posted.map(([p]) => p)).not.toContain("/api/live/7/save");
		expect(page.note.textContent).toMatch(/^This phone's copy of the recording couldn't be read just now/);
		expect(page.posted.find(([p]) => p === "/api/live/7/events")?.[1]).toContain("recording store");
		page.idb.failGets = false;
		await page.buttons.save!.onclick!();
		expect(page.posted.map(([p]) => p)).toContain("/api/live/7/save");
	});
	it("the bar reaches the end once the last kept part has gone, and Save no longer says it's checking while it sends", async () => {
		const page = await ownPhone("fine");
		const labels: string[] = [];
		let label = page.buttons.save!.textContent;
		Object.defineProperty(page.buttons.save!, "textContent", { get: () => label, set: (v: string) => { label = v; labels.push(v); } });
		await page.buttons.save!.onclick!();
		expect(page.bar.value).toBe(page.bar.max);
		expect(labels.slice(0, 2)).toEqual(["Checking what's on this phone…", "Saving…"]);
	});
});

describe("Carry on streaming on the phone that made the recording", () => {
	it("reads what the phone kept before asking the site to carry on, so a second tap can't start another part", async () => {
		const buttons: Record<string, Fake> = Object.fromEntries(["continue", "save", "discard", "discardyes", "discardno"].map((a) => [a, fake()]));
		const parts: Record<string, Fake> = Object.fromEntries(["[data-recover-msg]", "[data-recover-carry]", "[data-recover-here]", "[data-recover-other]", "[data-discardask]", "[data-recover-bar]"].map((s) => [s, fake(true)]));
		const panel = { ...fake(true), querySelector: (sel: string) => parts[sel] };
		const card = { dataset: { game: "7", recording: "41", mine: "1" }, querySelector: () => panel };
		const stored = new Map<string, string>([["courtside-live:7", JSON.stringify({ videoId: 41, segment: 1, partSize: 10, etags: {}, keeps: true })]]);
		vi.stubGlobal("localStorage", { getItem: (k: string) => stored.get(k) ?? null, setItem: (k: string, v: string) => stored.set(k, v), removeItem: (k: string) => stored.delete(k) });
		vi.stubGlobal("document", { querySelector: () => null, visibilityState: "visible", addEventListener() {}, removeEventListener() {}, documentElement: { dataset: {}, classList: { toggle() {} } } });
		vi.stubGlobal("innerHeight", 800);
		vi.stubGlobal("scrollBy", () => {});
		vi.stubGlobal("indexedDB", { open: () => { throw new Error("storage didn't open"); } });
		vi.spyOn(console, "warn").mockImplementation(() => {});
		const order: string[] = [];
		vi.stubGlobal("fetch", async (path: string) => { order.push(path); return Response.json({ ok: true, data: { segment: 2 } }); });
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		try {
			// @ts-expect-error: a browser script (plain JS), tested here on its own.
			const { recordingInTheWay } = await import("../../public/golive-recover.js");
			const said: string[] = [];
			recordingInTheWay(card, { btn: (a: string) => buttons[a], say: () => {}, carryOn: { mime: "video/mp4", say: (t: string) => said.push(t), ready: async () => {} } });
			const going = buttons.continue!.onclick!();
			await vi.runAllTimersAsync();
			await going;
			expect(order.indexOf("/api/live/7/continue")).toBeGreaterThan(order.lastIndexOf("/api/live/7/events"));
			expect(said.join(" ")).toMatch(/couldn't be read, so those minutes can't be sent and won't be in the video/);
		} finally {
			vi.useRealTimers();
		}
	});
	it("what the phone kept failing part way while the game streams again: the filmer is told those minutes are lost", async () => {
		const buttons: Record<string, Fake> = Object.fromEntries(["continue", "save", "discard", "discardyes", "discardno"].map((a) => [a, fake()]));
		const parts: Record<string, Fake> = Object.fromEntries(["[data-recover-msg]", "[data-recover-carry]", "[data-recover-here]", "[data-recover-other]", "[data-discardask]", "[data-recover-bar]"].map((s) => [s, fake(true)]));
		const panel = { ...fake(true), querySelector: (sel: string) => parts[sel] };
		const card = { dataset: { game: "7", recording: "41", mine: "1" }, querySelector: () => panel };
		const stored = new Map<string, string>([["courtside-live:7", JSON.stringify({ videoId: 41, segment: 1, partSize: 10, etags: {}, keeps: true })]]);
		vi.stubGlobal("localStorage", { getItem: (k: string) => stored.get(k) ?? null, setItem: (k: string, v: string) => stored.set(k, v), removeItem: (k: string) => stored.delete(k) });
		vi.stubGlobal("document", { querySelector: () => null, visibilityState: "visible", addEventListener() {}, removeEventListener() {}, documentElement: { dataset: {}, classList: { toggle() {} } } });
		vi.stubGlobal("innerHeight", 800);
		vi.stubGlobal("scrollBy", () => {});
		vi.stubGlobal("navigator", { onLine: true });
		const idb = fakeIndexedDb();
		vi.stubGlobal("indexedDB", idb);
		const store = await openStore();
		await store.putPart("41/1", 1, new Blob([new Uint8Array(10)], { type: "video/mp4" }));
		vi.spyOn(console, "warn").mockImplementation(() => {});
		vi.stubGlobal("fetch", async () => Response.json({ ok: true, data: { segment: 2 } }));
		// @ts-expect-error: a browser script (plain JS), tested here on its own.
		const { recordingInTheWay } = await import("../../public/golive-recover.js");
		const said: string[] = [];
		let sending: Promise<void> = Promise.resolve();
		recordingInTheWay(card, { btn: (a: string) => buttons[a], say: () => {}, carryOn: { mime: "video/mp4", say: (t: string) => said.push(t), ready: async (_a: unknown, _m: number, s: Promise<void>) => { sending = s; } } });
		await new Promise((r) => setTimeout(r, 20));
		idb.failGets = true;
		await buttons.continue!.onclick!();
		await sending.catch(() => {});
		expect(said.at(-1)).toBe("Some of what the closed page kept on this phone couldn't be sent, so those minutes won't be in the video.");
	});
});
