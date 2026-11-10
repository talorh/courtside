// Small JPEGs for tests: the markers the site reads (there's no real picture inside: nothing here decodes one).
const segment = (marker: number, payload: number[]) => [0xff, marker, (payload.length + 2) >> 8, (payload.length + 2) & 0xff, ...payload];
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

/**
 * A real EXIF block (APP1), as a phone writes one: when the photo was taken (DateTimeOriginal, 'YYYY:MM:DD HH:MM:SS'),
 * which way up it is (Orientation, 6 = turned a quarter clockwise) and a line standing in for where it was taken.
 */
export function exifApp1(o: { taken?: string; orientation?: number; bigEndian?: boolean } = {}): number[] {
	const { taken = "2026:10:23 19:05:12", orientation = 1, bigEndian = false } = o;
	const u16 = (n: number) => (bigEndian ? [n >> 8, n & 0xff] : [n & 0xff, n >> 8]);
	const u32 = (n: number) => (bigEndian ? [n >>> 24, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff] : [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, n >>> 24]);
	const entry = (tag: number, type: number, count: number, value: number[]) => [...u16(tag), ...u16(type), ...u32(count), ...value];
	const place = "GPS -37.81 145.23";
	// Offsets from the start of the TIFF header: IFD0 (3 entries) at 8, the EXIF directory (1 entry) at 50, then the
	// date (20 bytes) at 68 and the place at 88.
	const tiff = [
		...(bigEndian ? ascii("MM") : ascii("II")), ...u16(42), ...u32(8),
		...u16(3), ...entry(0x010e, 2, place.length + 1, u32(88)), ...entry(0x0112, 3, 1, [...u16(orientation), 0, 0]), ...entry(0x8769, 4, 1, u32(50)), ...u32(0),
		...u16(1), ...entry(0x9003, 2, 20, u32(68)), ...u32(0),
		...ascii(taken), 0, ...ascii(place), 0,
	];
	return segment(0xe1, [...ascii("Exif"), 0, 0, ...tiff]);
}

/** A JPEG `width` × `height`; with `exif`, also an EXIF block and a comment, as a camera can write (where it was taken). */
export function testJpeg(o: { width?: number; height?: number; exif?: boolean } = {}): Uint8Array {
	const { width = 640, height = 480, exif = false } = o;
	return new Uint8Array([
		0xff, 0xd8,
		...segment(0xe0, [...ascii("JFIF"), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]),
		...(exif ? exifApp1() : []),
		...(exif ? segment(0xfe, ascii("GPS -37.81 145.23")) : []),
		...segment(0xc0, [8, height >> 8, height & 0xff, width >> 8, width & 0xff, 1, 1, 0x11, 0]),
		...segment(0xda, [1, 1, 0, 0, 0x3f, 0]), 0x12, 0x34, 0x56, 0xff, 0xd9,
	]);
}

/** Whether the bytes still hold an EXIF block or the test's location line. */
export const hasExif = (bytes: Uint8Array) => Buffer.from(bytes).includes(Buffer.from("Exif\0\0")) || Buffer.from(bytes).includes(Buffer.from("GPS"));
