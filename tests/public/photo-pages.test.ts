import { afterEach, describe, expect, it, vi } from "vitest";

// The photo pages a swipe moves between (public/photo-pages.js): swiping away and back puts the opened photo's own
// caption, links and buttons back, never the neighbour's; and each page is read once at a time, giving up on a stall.

type Part = { sel: string; photo: number; copy: boolean; inert: boolean; on: Map<string, Part> | null; cloneNode: () => Part; replaceWith: (next: Part) => void };
const OWN = [".photo-when", ".photonav", ".photoback", ".side"];

/** A stand-in for a photo's page: its figure (its facts) and its own parts, each saying which photo's it is. */
function standIn(photo: number, newer: number | null, older: number | null) {
	const parts = new Map<string, Part>();
	/** A part goes in its page's place for it; one replaced puts the new one there, on whichever page it's on. */
	const place = (on: Map<string, Part>, p: Part) => { p.on = on; on.set(p.sel, p); };
	const part = (sel: string, of: number, copy = false): Part => {
		// A copy keeps the inert attribute, as the browser's cloneNode does.
		const made: Part = { sel, photo: of, copy, inert: false, on: null, cloneNode: () => Object.assign(part(sel, of, true), { inert: made.inert }), replaceWith: (next) => { if (made.on) place(made.on, next); } };
		return made;
	};
	for (const sel of OWN) place(parts, part(sel, photo));
	const dataset: Record<string, string> = { id: String(photo), thumb: `/thumb-${photo}.jpg` };
	for (const [which, id] of [["newer", newer], ["older", older]] as const) {
		if (id) Object.assign(dataset, { [which]: String(id), [`${which}Src`]: `/photo-${id}.jpg`, [`${which}Thumb`]: `/thumb-${id}.jpg` });
	}
	const figure = { dataset, querySelector: () => ({ getAttribute: () => `/photo-${photo}.jpg` }) };
	const page = {
		title: `Photo ${photo}`, parts, place,
		querySelector: (sel: string): unknown => (sel === ".photoview" ? figure : parts.get(sel) ?? null),
		cloneNode: () => { const copy = standIn(photo, newer, older); for (const p of parts.values()) copy.place(copy.parts, p.cloneNode()); return copy; },
	};
	return page;
}
type Page = ReturnType<typeof standIn>;
const shows = (page: Page) => OWN.map((sel) => page.parts.get(sel)!.photo);

afterEach(() => {
	vi.unstubAllGlobals();
	vi.resetModules();
});

/** Photo 7 opened (photo 5 older), with photo 5's page served as `serve` says. */
async function open(serve: (url: string, init?: RequestInit) => Promise<Response> = async () => new Response("5")) {
	const page = standIn(7, null, 5);
	const fetch = vi.fn(serve);
	vi.stubGlobal("document", page);
	vi.stubGlobal("fetch", fetch);
	vi.stubGlobal("DOMParser", class { parseFromString(text: string) { return standIn(Number(text), 7, null); } });
	vi.spyOn(console, "warn").mockImplementation(() => {});
	// @ts-expect-error: a browser script (plain JS), tested here on its own.
	const pages = await import("../../public/photo-pages.js");
	return { page, fetch, pages, seven: pages.opened(page) };
}

describe("swiping between photos", () => {
	it("away and back: the opened photo's own caption, links and buttons, not the neighbour's", async () => {
		const { page, pages, seven } = await open();
		expect(seven).toMatchObject({ id: "7", src: "/photo-7.jpg", older: { id: "5", src: "/photo-5.jpg" } });
		const five = await pages.pageFor("5");
		pages.show(five);
		expect([shows(page), page.title]).toEqual([[5, 5, 5, 5], "Photo 5"]);
		pages.show(pages.known("7"));
		expect([shows(page), page.title]).toEqual([[7, 7, 7, 7], "Photo 7"]);
		// And again: each swipe brings fresh copies, so what was kept for each photo is never the page's own.
		pages.show(pages.known("5"));
		pages.show(pages.known("7"));
		expect(shows(page)).toEqual([7, 7, 7, 7]);
		expect(OWN.every((sel) => page.parts.get(sel)!.copy && page.parts.get(sel) !== seven.doc.querySelector(sel))).toBe(true);
	});
	it("while the next photo's page is on its way, the caption, links and buttons showing can't be used, then are its own", async () => {
		const { page, pages } = await open();
		pages.hold();
		expect(OWN.map((sel) => page.parts.get(sel)!.inert)).toEqual([true, true, true, true]);
		pages.show(await pages.pageFor("5"));
		expect([shows(page), OWN.map((sel) => page.parts.get(sel)!.inert)]).toEqual([[5, 5, 5, 5], [false, false, false, false]]);
		// Swiped back to a page kept from before: its copies are usable too.
		pages.hold();
		pages.show(pages.known("7"));
		expect([shows(page), OWN.map((sel) => page.parts.get(sel)!.inert)]).toEqual([[7, 7, 7, 7], [false, false, false, false]]);
	});
	it("the opened page's copy is taken as it was opened, before a swipe changes the page", async () => {
		const { page, pages, seven } = await open();
		expect(seven.doc).not.toBe(page);
		pages.show(await pages.pageFor("5"));
		expect(OWN.map((sel) => (seven.doc.querySelector(sel) as Part).photo)).toEqual([7, 7, 7, 7]);
	});
	it("a page is asked for once at a time, and kept once read", async () => {
		let answer: (res: Response) => void = () => {};
		const { fetch, pages } = await open(() => new Promise((resolve) => { answer = resolve; }));
		const [first, second] = [pages.pageFor("5"), pages.pageFor("5")];
		answer(new Response("5"));
		expect((await first).id).toBe("5");
		expect(await second).toBe(await first);
		expect((await pages.pageFor("5")).id).toBe("5");
		expect(fetch).toHaveBeenCalledTimes(1);
		expect(fetch.mock.calls[0]![1]).toMatchObject({ headers: { Accept: "text/html" } });
		expect(fetch.mock.calls[0]![1]?.signal).toBeInstanceOf(AbortSignal);
	});
	it("a read that stalls is given up (null, so the photo opens as usual) and asked again next time", async () => {
		const stalled = () => Promise.reject(new DOMException("The operation timed out.", "TimeoutError"));
		const { fetch, pages } = await open(stalled);
		expect(await pages.pageFor("5")).toBeNull();
		fetch.mockImplementation(async () => new Response("5"));
		expect((await pages.pageFor("5")).id).toBe("5");
		expect(fetch).toHaveBeenCalledTimes(2);
	});
	it("a page forgotten (its picture's link ran out) is read again", async () => {
		const { fetch, pages } = await open();
		await pages.pageFor("5");
		pages.forget("5");
		await pages.pageFor("5");
		expect(fetch).toHaveBeenCalledTimes(2);
	});
});
