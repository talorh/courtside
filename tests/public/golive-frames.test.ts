import { describe, expect, it } from "vitest";
// @ts-expect-error plain browser module, no types
import { frameFixer } from "../../public/golive-frames.js";

// Safari can write a frame with a length below zero (a number near 2^32) when its recorder is paused or stopped as the
// camera stops: that frame reads as 82 days and Stream refuses the whole video. Every piece the phone hands over is put
// right before it's kept or sent: each such frame takes the length its fragment's other frames have, the size unchanged.

const u32 = (n: number) => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const box = (type: string, body: number[]) => [...u32(8 + body.length), ...[...type].map((c) => c.charCodeAt(0)), ...body];
/** A fragment of `durations` frames (a trun with lengths and sizes), its tfhd with `defaultDuration` if given. */
function fragment(durations: number[], defaultDuration?: number) {
	const tfhd = defaultDuration === undefined ? box("tfhd", [0, 2, 0, 0, ...u32(2)]) : box("tfhd", [0, 2, 0, 8, ...u32(2), ...u32(defaultDuration)]);
	const trun = box("trun", [0, 0, 3, 1, ...u32(durations.length), ...u32(0), ...durations.flatMap((d) => [...u32(d), ...u32(100)])]);
	const moof = box("moof", [...box("mfhd", [0, 0, 0, 0, ...u32(49)]), ...box("traf", [...tfhd, ...box("tfdt", [1, 0, 0, 0, ...u32(0), ...u32(57868)]), ...trun])]);
	return [...moof, ...box("mdat", new Array(durations.length * 100).fill(7))];
}
const HEAD = [...box("ftyp", [105, 115, 111, 109, 0, 0, 2, 0]), ...box("moov", new Array(40).fill(0))];
const blob = (bytes: number[]) => new Blob([new Uint8Array(bytes)], { type: "video/mp4" });
const bytesOf = async (b: Blob) => [...new Uint8Array(await b.arrayBuffer())];
/** Every frame length in the bytes, fragment by fragment. */
async function lengths(b: Blob): Promise<number[][]> {
	const bytes = await bytesOf(b), view = new DataView(new Uint8Array(bytes).buffer), out: number[][] = [];
	for (let i = 0; i + 4 <= bytes.length; i++) {
		if (String.fromCharCode(...bytes.slice(i, i + 4)) !== "trun") continue;
		const n = view.getUint32(i + 8);
		out.push(Array.from({ length: n }, (_, k) => view.getUint32(i + 16 + k * 8)));
	}
	return out;
}
/** Every piece through one fixer, then what it still held: the bytes it hands back, all together. */
async function through(pieces: number[][]): Promise<Blob> {
	const fix = frameFixer("video/mp4"), out: Blob[] = [];
	for (const p of pieces) out.push(await fix.push(blob(p)));
	out.push(fix.flush());
	return new Blob(out, { type: "video/mp4" });
}
const below = (ticks: number) => 2 ** 32 - ticks;

describe("Go live's recording, put right as the phone hands it over", () => {
	it("gives a frame below zero the length its fragment's other frames have, anywhere in the recording, the size unchanged", async () => {
		// Today's test: -6 ticks in the fragment before the last, -309 in the last frame of all.
		const pieces = [HEAD, fragment([20, 20, below(6), 21]), fragment([20, 22, below(309)])];
		const out = await through(pieces);
		expect(out.size).toBe(pieces.flat().length);
		expect(await lengths(out)).toEqual([[20, 20, 20, 21], [20, 22, 20]]);
	});

	it("waits for a fragment that arrives in two pieces, then puts it right", async () => {
		const whole = [...HEAD, ...fragment([20, 20]), ...fragment([20, below(3)])];
		const split = whole.length - 150;
		const fix = frameFixer("video/mp4");
		const first = await fix.push(blob(whole.slice(0, split)));
		// Whole boxes go at once (the second fragment's moof, put right); its picture, still arriving, is held.
		expect(first.size).toBe(whole.length - 208);
		const second = await fix.push(blob(whole.slice(split)));
		expect(await lengths(new Blob([first, second, fix.flush()]))).toEqual([[20, 20], [20, 20]]);
	});

	it("takes the fragment's default length, else the shortest there is, else the shortest a frame can be", async () => {
		expect(await lengths(await through([fragment([below(1)], 20)]))).toEqual([[20]]);
		expect(await lengths(await through([fragment([below(1)])]))).toEqual([[1]]);
	});

	it("puts right a fragment default below zero, as Safari writes it, its runs then carrying no lengths of their own", async () => {
		// Safari's layout: tfhd with base offset, a default length, size and flags (0x020039); runs flagged 0x205 and 0x701.
		const tfhd = box("tfhd", [0, 2, 0, 0x39, ...u32(2), ...u32(0), ...u32(0), ...u32(below(309)), ...u32(100), ...u32(0)]);
		const noLengths = box("trun", [0, 0, 2, 5, ...u32(1), ...u32(0), ...u32(0), ...u32(100)]);
		const lengths7 = box("trun", [0, 0, 7, 1, ...u32(2), ...u32(0), ...u32(20), ...u32(100), ...u32(0), ...u32(below(1)), ...u32(100), ...u32(0)]);
		const audio = box("traf", [...box("tfhd", [0, 2, 0, 0x18, ...u32(1), ...u32(1024), ...u32(10)]), ...box("trun", [0, 0, 2, 1, ...u32(1), ...u32(0), ...u32(10)])]);
		const moof = box("moof", [...box("mfhd", [0, 0, 0, 0, ...u32(1)]), ...audio, ...box("traf", [...tfhd, ...noLengths, ...lengths7])]);
		const bytes = await bytesOf(await through([[...HEAD, ...moof, ...box("mdat", new Array(310).fill(7))]]));
		const view = new DataView(new Uint8Array(bytes).buffer);
		const at = (type: string, nth = 0) => bytes.findIndex((_, i) => String.fromCharCode(...bytes.slice(i, i + 4)) === type && nth-- === 0) - 4;
		expect(view.getUint32(at("tfhd", 1) + 24)).toBe(20); // the default: the shortest good length in the fragment
		expect(view.getUint32(at("tfhd", 0) + 16)).toBe(1024); // audio's untouched
		expect(view.getUint32(at("trun", 2) + 32)).toBe(20);
	});

	it("a track whose default length goes below zero, with no lengths of its own, takes its last good default", async () => {
		const audio = (theDefault: number) => box("moof", box("traf", [...box("tfhd", [0, 2, 0, 8, ...u32(1), ...u32(theDefault)]), ...box("trun", [0, 0, 2, 1, ...u32(1), ...u32(0), ...u32(10)])]));
		const bytes = await bytesOf(await through([[...HEAD, ...audio(1024), ...box("mdat", new Array(10).fill(7)), ...audio(below(5)), ...box("mdat", new Array(10).fill(7))]]));
		const view = new DataView(new Uint8Array(bytes).buffer);
		const defaults = bytes.map((_, i) => i).filter((i) => String.fromCharCode(...bytes.slice(i, i + 4)) === "tfhd").map((i) => view.getUint32(i + 12));
		expect(defaults).toEqual([1024, 1024]);
	});

	it("never holds the game back: a box that says it runs to the end, or that never ends, sends everything on", async () => {
		const toEnd = [...HEAD, ...box("mdat", []).slice(0, 4).map(() => 0), 109, 100, 97, 116, 1, 2, 3];
		expect(await bytesOf(await through([toEnd, [4, 5, 6]]))).toEqual([...toEnd, 4, 5, 6]);
		const fix = frameFixer("video/mp4");
		const huge = [...HEAD, ...u32(400_000_000), 109, 100, 97, 116];
		let out = (await fix.push(blob(huge))).size;
		for (let i = 0; i < 10; i++) out += (await fix.push(new Blob([new Uint8Array(2_000_000)]))).size;
		expect(out).toBe(huge.length + 20_000_000); // past 16 MB held, it all goes on unchanged
	});

	it("leaves a good recording alone, and anything it can't read goes on unchanged, nothing lost", async () => {
		const good = [...HEAD, ...fragment([20, 20, 20])];
		expect(await bytesOf(await through([good.slice(0, 50), good.slice(50)]))).toEqual(good);
		const junk = [...HEAD, 0, 0, 0, 9, 0xff, 0xfe, 0, 1, 5, ...fragment([below(2)])];
		expect(await bytesOf(await through([junk.slice(0, 70), junk.slice(70)]))).toEqual(junk);
		// A recording cut off part-way through a box still hands every byte back at the end.
		const cut = good.slice(0, good.length - 10);
		expect(await bytesOf(await through([cut]))).toEqual(cut);
	});
});
