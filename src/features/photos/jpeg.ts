// Photos are JPEGs the phone made itself (public/photos.js): drawn on a canvas, which leaves off the camera's
// details. The site still checks that's what arrived, reads its size, and takes out any metadata that's there anyway:
// EXIF and XMP can say where a photo was taken (defence in depth for photos of children). It keeps the frame, the
// tables and the scans (the picture) up to the end marker, and drops application segments but the colour profile,
// comments, and anything after the end (where some phones keep more details).

const SOI = 0xd8, SOS = 0xda, EOI = 0xd9;
const restart = (m: number) => m >= 0xd0 && m <= 0xd7;
// Segments with no length after them.
const standalone = (m: number) => m === 0x01 || restart(m);
// Start of frame: where the size is (not DHT, JPG or DAC, which share the range).
const frame = (m: number) => m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc;
const ICC = [0x49, 0x43, 0x43, 0x5f, 0x50, 0x52, 0x4f, 0x46, 0x49, 0x4c, 0x45, 0x00]; // "ICC_PROFILE\0": colours only

/** Application segments (EXIF, XMP, Photoshop) and comments go; the colour profile (APP2 ICC) and JFIF header stay. */
function metadata(marker: number, segment: Uint8Array): boolean {
	if (marker === 0xfe) return true;
	if (marker === 0xe2) return !ICC.every((b, i) => segment[4 + i] === b);
	return marker >= 0xe1 && marker <= 0xef;
}

/** Where a scan's coded data ends: the next marker (0xFF then anything but a stuffed 0x00 or a restart), or -1. */
function scanEnd(bytes: Uint8Array, from: number): number {
	for (let at = bytes.indexOf(0xff, from); at >= 0 && at + 1 < bytes.length; at = bytes.indexOf(0xff, at + 2)) {
		const next = bytes[at + 1]!;
		if (next !== 0 && !restart(next)) return at;
	}
	return -1;
}

function joined(parts: Uint8Array[], width: number, height: number) {
	const bytes = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
	parts.reduce((offset, part) => (bytes.set(part, offset), offset + part.length), 0);
	return { bytes, width, height };
}

/** The JPEG with its metadata taken out, and its size; null when it isn't a whole JPEG. */
export function cleanJpeg(bytes: Uint8Array): { bytes: Uint8Array; width: number; height: number } | null {
	if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== SOI) return null;
	const kept: Uint8Array[] = [bytes.subarray(0, 2)];
	let at = 2, width = 0, height = 0, scan = false;
	while (at + 1 < bytes.length) {
		if (bytes[at] !== 0xff) return null;
		const marker = bytes[at + 1]!;
		if (marker === 0xff) { at++; continue; } // padding between segments
		if (marker === EOI) return scan && width && height ? joined([...kept, bytes.subarray(at, at + 2)], width, height) : null;
		if (standalone(marker)) { kept.push(bytes.subarray(at, at + 2)); at += 2; continue; }
		if (at + 4 > bytes.length) return null;
		const length = (bytes[at + 2]! << 8) | bytes[at + 3]!;
		if (length < 2 || at + 2 + length > bytes.length) return null;
		const segment = bytes.subarray(at, at + 2 + length);
		if (frame(marker) && length >= 8) {
			height = (segment[5]! << 8) | segment[6]!;
			width = (segment[7]! << 8) | segment[8]!;
		}
		if (marker === SOS) {
			// The scan's coded data runs on to the next marker: more tables and scans (a progressive JPEG), or the end.
			const end = scanEnd(bytes, at + 2 + length);
			if (end < 0) return null;
			kept.push(bytes.subarray(at, end));
			scan = true;
			at = end;
			continue;
		}
		if (!metadata(marker, segment)) kept.push(segment);
		at += 2 + length;
	}
	return null; // no end marker: cut short
}
