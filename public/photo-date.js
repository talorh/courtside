// When a photo was taken: its EXIF DateTimeOriginal, the phone's own clock (local time on a
// local phone), read before the phone makes it smaller, as the smaller copy has no EXIF at all. The Photos page is
// sorted by it. 'YYYY-MM-DDTHH:MM:SS', or "" when the photo doesn't say (a screenshot, a saved image): the site then
// uses when it was added.

const EXIF = [0x45, 0x78, 0x69, 0x66, 0, 0]; // "Exif\0\0"

/** Reads the start of the file only: EXIF comes before the picture. */
export async function takenAt(file) {
	return exifDate(new Uint8Array(await file.slice(0, 128 * 1024).arrayBuffer()));
}

/** DateTimeOriginal from a JPEG's bytes, or "". */
export function exifDate(bytes) {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	if (bytes.length < 4 || view.getUint16(0) !== 0xffd8) return "";
	for (let at = 2; at + 4 <= bytes.length;) {
		const marker = view.getUint16(at);
		// Not a segment, or the picture itself starts: there's no EXIF before it.
		if ((marker & 0xff00) !== 0xff00 || marker === 0xffda) return "";
		if (marker === 0xffe1 && EXIF.every((b, i) => bytes[at + 4 + i] === b)) return fromTiff(view, at + 10);
		at += 2 + view.getUint16(at + 2);
	}
	return "";
}

/** The date in the EXIF's TIFF block starting at `start` (its offsets count from there). */
function fromTiff(view, start) {
	try {
		const little = view.getUint16(start) === 0x4949; // "II"; "MM" is big-endian
		const u16 = (at) => view.getUint16(start + at, little);
		const u32 = (at) => view.getUint32(start + at, little);
		// The entry for `tag` in the directory at `dir`, or -1.
		const entry = (dir, tag) => {
			for (let i = 0, n = u16(dir); i < n; i++) if (u16(dir + 2 + i * 12) === tag) return dir + 2 + i * 12;
			return -1;
		};
		const exif = entry(u32(4), 0x8769); // the EXIF directory, from the first one
		const date = exif < 0 ? -1 : entry(u32(exif + 8), 0x9003); // DateTimeOriginal: "YYYY:MM:DD HH:MM:SS"
		if (date < 0 || u32(date + 4) < 19) return "";
		const text = String.fromCharCode(...new Uint8Array(view.buffer, view.byteOffset + start + u32(date + 8), 19));
		const m = /^(\d{4}):(\d\d):(\d\d) (\d\d):(\d\d):(\d\d)$/.exec(text);
		// A camera whose clock was never set writes zeros. The site checks it's a real date and time again.
		return m && m[1] >= "2000" ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}` : "";
	} catch (err) {
		// Cut short or garbled (a read ran off the end): the photo doesn't say.
		if (err instanceof RangeError) return "";
		throw err;
	}
}
