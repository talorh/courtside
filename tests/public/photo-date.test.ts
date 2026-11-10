import { describe, expect, it } from "vitest";
// @ts-expect-error: a browser script (plain JS), tested here on its own.
import { exifDate, takenAt } from "../../public/photo-date.js";
import { exifApp1, testJpeg } from "../helpers/jpeg.ts";

/** testJpeg with this EXIF block in place of its own (after the JFIF header, where phones put it). */
const withExif = (app1: number[]) => {
	const plain = testJpeg();
	return new Uint8Array([...plain.slice(0, 20), ...app1, ...plain.slice(20)]);
};

describe("when a photo was taken, read on the phone before it's made smaller", () => {
	it("is the photo's own date and time from its EXIF, either byte order", () => {
		expect(exifDate(withExif(exifApp1({ taken: "2026:10:23 19:05:12" })))).toBe("2026-10-23T19:05:12");
		expect(exifDate(withExif(exifApp1({ taken: "2027:01:02 08:00:59", bigEndian: true })))).toBe("2027-01-02T08:00:59");
		expect(exifDate(testJpeg({ exif: true }))).toBe("2026-10-23T19:05:12");
	});
	it("is nothing when the photo doesn't say: no EXIF, a camera's clock never set, cut short, or not a JPEG", () => {
		expect(exifDate(testJpeg())).toBe("");
		expect(exifDate(withExif(exifApp1({ taken: "0000:00:00 00:00:00" })))).toBe("");
		expect(exifDate(withExif(exifApp1()).slice(0, 60))).toBe("");
		expect(exifDate(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("");
		expect(exifDate(new Uint8Array([]))).toBe("");
	});
	it("reads it from the chosen file", async () => {
		expect(await takenAt(new File([withExif(exifApp1({ taken: "2026:10:30 18:41:07" }))], "IMG_0001.JPG"))).toBe("2026-10-30T18:41:07");
	});
});
