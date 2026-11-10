import { describe, expect, it } from "vitest";
// @ts-expect-error: a browser script (plain JS), tested here on its own.
import { upright } from "../../public/golive-upright.js";

const QUARTER = [0, 0x10000, 0, -0x10000, 0, 0, 0, 0, 0x40000000];
const IDENTITY = [0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000];
const HALF = [-0x10000, 0, 0, 0, -0x10000, 0, 0, 0, 0x40000000];

/** ftyp + moov(trak(tkhd)) + some media, as iPhone Safari's MediaRecorder writes it (version 0 tkhd). */
function recording(matrix: number[], width: number, height: number): Blob {
	const tkhd = new DataView(new ArrayBuffer(92));
	tkhd.setUint32(0, 92);
	[..."tkhd"].forEach((c, i) => tkhd.setUint8(4 + i, c.charCodeAt(0)));
	matrix.forEach((v, i) => tkhd.setInt32(48 + i * 4, v));
	tkhd.setUint32(84, width * 65536);
	tkhd.setUint32(88, height * 65536);
	const box = (type: string, body: ArrayBuffer) => {
		const head = new DataView(new ArrayBuffer(8));
		head.setUint32(0, 8 + body.byteLength);
		[...type].forEach((c, i) => head.setUint8(4 + i, c.charCodeAt(0)));
		return new Uint8Array([...new Uint8Array(head.buffer), ...new Uint8Array(body)]).buffer;
	};
	return new Blob([box("ftyp", new ArrayBuffer(20)), box("moov", box("trak", tkhd.buffer)), new Uint8Array(5000).fill(7)], { type: "video/mp4" });
}

async function matrixOf(part: Blob): Promise<number[]> {
	const view = new DataView(await part.arrayBuffer());
	return Array.from({ length: 9 }, (_, i) => view.getInt32(28 + 8 + 8 + 48 + i * 4));
}

describe("upright (iPhone labels a sideways recording as turned)", () => {
	it("sets a sideways video's quarter or half turn back to none, keeping the part the same size", async () => {
		for (const turn of [QUARTER, HALF]) {
			const part = recording(turn, 1280, 720);
			const fixed: Blob = await upright(part);
			expect(await matrixOf(fixed)).toEqual(IDENTITY);
			expect(fixed.size).toBe(part.size);
			expect(new Uint8Array(await fixed.slice(fixed.size - 10).arrayBuffer())).toEqual(new Uint8Array(10).fill(7));
		}
	});
	it("leaves portrait video, unturned video and anything that isn't MP4 alone", async () => {
		for (const part of [recording(QUARTER, 720, 1280), recording(IDENTITY, 1280, 720)]) {
			expect(await upright(part)).toBe(part);
		}
		const webm = new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3])], { type: "video/webm" });
		expect(await upright(webm)).toBe(webm);
	});
});
