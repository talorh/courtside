import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cleanJpeg } from "../../../src/features/photos/jpeg.ts";
import { hasExif, testJpeg } from "../../helpers/jpeg.ts";

describe("cleanJpeg", () => {
	it("reads the size and keeps the picture", () => {
		const out = cleanJpeg(testJpeg({ width: 2560, height: 1920 }))!;
		expect([out.width, out.height]).toEqual([2560, 1920]);
		expect([...out.bytes.slice(0, 2)]).toEqual([0xff, 0xd8]);
		expect([...out.bytes.slice(-2)]).toEqual([0xff, 0xd9]);
	});
	it("takes out a camera's EXIF (where the photo was taken) and comments, keeping everything else as it was", () => {
		const withExif = testJpeg({ exif: true });
		expect(hasExif(withExif)).toBe(true);
		const out = cleanJpeg(withExif)!;
		expect(hasExif(out.bytes)).toBe(false);
		expect(out.bytes).toEqual(testJpeg({ exif: false }));
	});
	it("refuses anything that isn't a whole JPEG", () => {
		expect(cleanJpeg(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBeNull(); // a PNG
		expect(cleanJpeg(testJpeg().slice(0, 30))).toBeNull(); // cut short before the picture
		expect(cleanJpeg(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2]))).toBeNull(); // no size
		expect(cleanJpeg(testJpeg().slice(0, -2))).toBeNull(); // no end: the picture was cut short
	});
	it("takes out what's after the picture's end (Samsung phones keep details there) and what's between its scans", () => {
		const plain = testJpeg();
		const trailer = new Uint8Array([...plain, ...new TextEncoder().encode("SEFT GPS -37.81 145.23")]);
		expect(cleanJpeg(trailer)!.bytes).toEqual(plain);
		// A progressive JPEG: a second scan after more tables, with an EXIF block slipped in between. The scans keep
		// their stuffed 0xFF bytes and restart markers.
		const firstScan = plain.slice(0, -2);
		const exif = [0xff, 0xe1, 0, 10, ...new TextEncoder().encode("Exif"), 0, 0, 0x47, 0x50];
		const moreTables = [0xff, 0xc4, 0, 4, 0x10, 0x01];
		const secondScan = [0xff, 0xda, 0, 8, 1, 1, 0, 0, 0x3f, 0, 0xab, 0xff, 0x00, 0xcd, 0xff, 0xd0, 0xef];
		const progressive = new Uint8Array([...firstScan, ...exif, ...moreTables, ...secondScan, 0xff, 0xd9]);
		const out = cleanJpeg(progressive)!;
		expect(hasExif(out.bytes)).toBe(false);
		expect(out.bytes).toEqual(new Uint8Array([...firstScan, ...moreTables, ...secondScan, 0xff, 0xd9]));
	});
	it("reads a real JPEG", () => {
		const out = cleanJpeg(new Uint8Array(readFileSync("public/technical-difficulties.jpg")))!;
		expect([out.width, out.height]).toEqual([360, 354]);
	});
});
