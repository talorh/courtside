// A zip of files kept as they are (stored: a JPEG doesn't squeeze), written one file at a time as it's sent, so a page
// of photos is never in memory at once (zip.ts builds a small one whole). Each file's size and CRC are known before
// its header, so it needs no descriptor after it, which every unzipper reads.
import { crc32 } from "./zip.ts";

export interface ZipEntry {
	name: string;
	/** local wall time 'YYYY-MM-DDTHH:MM:SS', shown as the file's date. */
	modified: string;
	/** The file's bytes, fetched when its turn comes; null leaves it out (gone meanwhile). */
	bytes: () => Promise<Uint8Array | null>;
}

/** MS-DOS time and date, as zips keep them: 1980 to 2107 only, so a day outside that (a camera whose clock was never
 * set) is held at the nearer end. */
function dos(modified: string): [number, number] {
	const [y, mo, d, h, mi, s] = modified.split(/[-T:]/).map(Number) as [number, number, number, number, number, number];
	if (y < 1980) return [0, (1 << 5) | 1];
	if (y > 2107) return [(23 << 11) | (59 << 5) | 29, (127 << 9) | (12 << 5) | 31];
	return [(h << 11) | (mi << 5) | (s >> 1), ((y - 1980) << 9) | (mo << 5) | d];
}

function header(fields: Array<[number, 2 | 4]>, name: Uint8Array): Uint8Array {
	const size = fields.reduce((n, [, w]) => n + w, 0);
	const out = new Uint8Array(size + name.length);
	const view = new DataView(out.buffer);
	let at = 0;
	for (const [value, width] of fields) {
		if (width === 2) view.setUint16(at, value, true);
		else view.setUint32(at, value, true);
		at += width;
	}
	out.set(name, size);
	return out;
}

export function zipStream(entries: ZipEntry[]): ReadableStream<Uint8Array> {
	const central: Uint8Array[] = [];
	let offset = 0, next = 0;
	return new ReadableStream({
		async pull(controller) {
			while (next < entries.length) {
				const entry = entries[next++]!;
				const bytes = await entry.bytes();
				if (!bytes) continue;
				const name = new TextEncoder().encode(entry.name);
				const [time, date] = dos(entry.modified);
				const crc = crc32(bytes);
				// Version 2.0, UTF-8 names (bit 11), stored.
				const common: Array<[number, 2 | 4]> = [[20, 2], [0x0800, 2], [0, 2], [time, 2], [date, 2], [crc, 4], [bytes.length, 4], [bytes.length, 4], [name.length, 2]];
				const local = header([[0x04034b50, 4], ...common, [0, 2]], name);
				central.push(header([[0x02014b50, 4], [20, 2], ...common, [0, 2], [0, 2], [0, 2], [0, 2], [0, 4], [offset, 4]], name));
				controller.enqueue(local);
				controller.enqueue(bytes);
				offset += local.length + bytes.length;
				return;
			}
			const size = central.reduce((n, c) => n + c.length, 0);
			for (const c of central) controller.enqueue(c);
			controller.enqueue(header([[0x06054b50, 4], [0, 2], [0, 2], [central.length, 2], [central.length, 2], [size, 4], [offset, 4], [0, 2]], new Uint8Array()));
			controller.close();
		},
	});
}
