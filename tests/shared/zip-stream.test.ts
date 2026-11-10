import { describe, expect, it } from "vitest";
import { zipStream } from "../../src/shared/zip-stream.ts";

/** The zip's bytes, and each central directory entry's DOS date (the day a file was last changed). */
async function dates(modified: string[]) {
	const zip = new Uint8Array(await new Response(zipStream(modified.map((m, i) => ({ name: `${i}.jpg`, modified: m, bytes: async () => new Uint8Array([i]) })))).arrayBuffer());
	const view = new DataView(zip.buffer);
	const end = zip.byteLength - 22, out: number[] = [];
	for (let at = view.getUint32(end + 16, true), i = 0; i < view.getUint16(end + 10, true); i++) {
		out.push(view.getUint16(at + 14, true));
		at += 46 + view.getUint16(at + 28, true);
	}
	return out;
}

describe("a streamed zip's file dates", () => {
	it("are the photo's own day", async () => {
		expect(await dates(["2026-10-23T19:05:12"])).toEqual([((2026 - 1980) << 9) | (10 << 5) | 23]);
	});
	it("stay within what a zip can hold when a camera's clock was never set: 1980 to 2107", async () => {
		expect(await dates(["1970-01-01T00:00:00", "2150-06-01T10:00:00"])).toEqual([(0 << 9) | (1 << 5) | 1, (127 << 9) | (12 << 5) | 31]);
	});
});
