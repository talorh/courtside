import { describe, expect, it, vi } from "vitest";
// @ts-expect-error: a browser script (plain JS), tested here on its own.
import { celebrate, makePieces, placeAt } from "../../public/win.js";

// The win pop-up's confetti (public/win.js), on a stand-in page: a phone's screen with the card in the middle.
const CARD = { left: 16, top: 300, width: 358, height: 240 };
const PHONE = { width: 390, height: 844 };
const COLOURS = ["#2A8F3D", "#FFFFFF"];

interface Piece { x: number; y: number; colour: string; front: boolean }
const pieces = (screen = PHONE): Piece[] => makePieces(CARD, screen, COLOURS, () => 0.5);

function page({ hidden = false, still = false } = {}) {
	const drawn = [0, 0];
	const canvas = (i: number) => ({ width: 0, height: 0, getContext: () => ({ setTransform() {}, clearRect() { drawn[i]!++; }, save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, beginPath() {}, arc() {}, fill() {}, fillRect() {}, fillStyle: "" }) });
	const canvases = [canvas(0), canvas(1)];
	const listeners: Record<string, (e: unknown) => void> = {};
	const classes = new Set<string>();
	const pop = {
		dataset: { confetti: COLOURS.join(",") }, clientWidth: PHONE.width, clientHeight: PHONE.height, removed: false,
		classList: { add: (c: string) => classes.add(c), remove: (c: string) => classes.delete(c) },
		querySelectorAll: () => canvases, querySelector: () => ({ getBoundingClientRect: () => CARD }),
		addEventListener: (name: string, fn: (e: unknown) => void) => { listeners[name] = fn; },
		remove() { pop.removed = true; },
	};
	const frames: Array<(now: number) => void> = [];
	const doc = { hidden, shown: [] as Array<() => void>, addEventListener: (_: string, fn: () => void) => { doc.shown.push(fn); }, removeEventListener: (_: string, fn: () => void) => { doc.shown = doc.shown.filter((f) => f !== fn); } };
	const win = {
		devicePixelRatio: 2, document: doc, performance: { now: () => 1000 }, matchMedia: () => ({ matches: still }),
		requestAnimationFrame: (fn: (now: number) => void) => { frames.push(fn); return frames.length; },
	};
	return { pop, win, doc, frames, drawn, canvases, classes, end: (e: unknown) => listeners.animationend!(e) };
}

describe("the win pop-up's confetti", () => {
	it("starts every piece on the card's edge, in the pop-up's colours, about one in five in front of the card", () => {
		const all = pieces();
		expect(all.length).toBe(230);
		for (const p of all) {
			expect(p.x).toBeGreaterThanOrEqual(CARD.left);
			expect(p.x).toBeLessThanOrEqual(CARD.left + CARD.width);
			expect(p.y).toBeGreaterThanOrEqual(CARD.top);
			expect(p.y).toBeLessThanOrEqual(CARD.top + CARD.height);
			expect(COLOURS).toContain(p.colour);
		}
		expect(all.filter((p) => p.front).length).toBe(46);
	});
	it("throws more on a bigger screen, but never more than a phone can draw smoothly", () => {
		expect(pieces({ width: 1440, height: 900 }).length).toBeGreaterThan(400);
		expect(pieces({ width: 3840, height: 2160 }).length).toBe(700);
	});
	it("a piece leaves from where it started, then slows and falls", () => {
		for (const p of makePieces(CARD, PHONE, COLOURS)) {
			expect(placeAt(p, 0)).toMatchObject({ x: p.x, y: p.y });
			expect(placeAt(p, 1.4).y).toBeGreaterThan(placeAt(p, 1).y);
		}
	});
	it("draws both layers on each frame, at the screen's own sharpness, and takes the pop-up away when its fade ends", () => {
		const { pop, win, frames, drawn, canvases, end } = page();
		celebrate(pop, win);
		expect(canvases.map((c) => [c.width, c.height])).toEqual([[780, 1688], [780, 1688]]);
		frames.shift()!(1016);
		frames.shift()!(1033);
		expect(drawn).toEqual([2, 2]);
		// The card's own pop-in ending isn't the pop-up's end.
		end({ target: {} });
		expect(pop.removed).toBe(false);
		end({ target: pop });
		expect(pop.removed).toBe(true);
		const left = frames.length;
		frames.shift()!(1050);
		expect(frames.length).toBe(left - 1);
	});
	it("with reduced motion: one still frame of confetti, nothing moving", () => {
		const { pop, win, frames, drawn, end } = page({ still: true });
		celebrate(pop, win);
		expect(drawn).toEqual([1, 1]);
		expect(frames).toEqual([]);
		end({ target: pop });
		expect(pop.removed).toBe(true);
	});
	it("opened in a tab that isn't showing: waits, and plays when the page is looked at", () => {
		const { pop, win, doc, frames, classes } = page({ hidden: true });
		celebrate(pop, win);
		expect([...classes]).toEqual(["waiting"]);
		expect(frames).toEqual([]);
		doc.shown[0]!();
		expect([...classes]).toEqual(["waiting"]);
		doc.hidden = false;
		doc.shown[0]!();
		expect([...classes]).toEqual([]);
		expect(frames.length).toBe(1);
		expect(doc.shown).toEqual([]);
	});
	it("does nothing on a page with no pop-up", async () => {
		vi.stubGlobal("document", { querySelector: () => null });
		vi.resetModules();
		// @ts-expect-error: a browser script (plain JS), run here with a stand-in page.
		await expect(import("../../public/win.js")).resolves.toBeDefined();
		vi.unstubAllGlobals();
	});
});
