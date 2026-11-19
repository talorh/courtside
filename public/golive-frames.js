// Go live: Safari can write a frame of its recording with a length below zero (stored as a number near 2^32) when its
// recorder is paused or stopped as the camera stops: that one frame reads as 82 days, and Stream refuses the whole
// video. Every piece the phone hands over passes through here first: in each fragment, a frame below zero (or a default
// length below zero, as Safari writes one when its frames share a length) takes a good length the track has, the size
// unchanged. A box split across two pieces waits for the rest; anything that can't be read goes on unchanged from there,
// so nothing recorded is lost.

const NEGATIVE = 0x80000000;
// More than this held back waiting for a box to end means the boxes can't be read after all: send everything on.
const MAX_HELD = 16 * 1024 * 1024;
const CONTAINERS = new Set(["moof", "traf"]);
const typeAt = (view, at) => String.fromCharCode(view.getUint8(at + 4), view.getUint8(at + 5), view.getUint8(at + 6), view.getUint8(at + 7));
const readable = (type) => /^[a-z0-9 ]{4}$/i.test(type);

const sane = (d) => d > 0 && d < NEGATIVE;

/** Each traf's tfhd default-length spot (or null) and its truns' frame-length spots, in the boxes between start and end. */
function tracks(view, start, end, found = []) {
	for (let at = start; at + 8 <= end;) {
		const size = view.getUint32(at), type = typeAt(view, at);
		if (size < 8 || at + size > end) break;
		if (CONTAINERS.has(type)) {
			if (type === "traf") found.push({ track: null, theDefault: null, spots: [] });
			tracks(view, at + 8, at + size, found);
		}
		const traf = found.at(-1);
		if (type === "tfhd" && traf) {
			const flags = view.getUint32(at + 8) & 0xffffff;
			traf.track = view.getUint32(at + 12);
			if (flags & 0x08) traf.theDefault = at + 16 + (flags & 0x01 ? 8 : 0) + (flags & 0x02 ? 4 : 0);
		}
		if (type === "trun" && traf) {
			const flags = view.getUint32(at + 8) & 0xffffff, count = view.getUint32(at + 12);
			const per = 4 * [0x100, 0x200, 0x400, 0x800].filter((f) => flags & f).length;
			const first = at + 16 + (flags & 0x01 ? 4 : 0) + (flags & 0x04 ? 4 : 0);
			if (flags & 0x100 && first + count * per <= at + size) for (let k = 0; k < count; k++) traf.spots.push(first + k * per);
		}
		at += size;
	}
	return found;
}

/** Puts right the moof between start and end, track by track: a default length below zero (or none at all) becomes the
 * shortest good length the fragment has for the track, else the track's last good default (`lastGood`, by track id,
 * kept across fragments), else 1; then each frame below zero takes the default, else that. */
function fixFragment(view, start, end, lastGood) {
	for (const t of tracks(view, start, end)) {
		const good = t.spots.map((p) => view.getUint32(p)).filter(sane);
		const shortest = good.length ? Math.min(...good) : lastGood.get(t.track) ?? 1;
		if (t.theDefault !== null && !sane(view.getUint32(t.theDefault))) view.setUint32(t.theDefault, shortest);
		if (t.theDefault !== null) lastGood.set(t.track, view.getUint32(t.theDefault));
		const length = t.theDefault !== null ? view.getUint32(t.theDefault) : shortest;
		for (const p of t.spots) if (view.getUint32(p) >= NEGATIVE) view.setUint32(p, length);
	}
}

/** Returns { push(piece) → Promise<Blob>, flush() → Blob }: push hands back the whole boxes so far, put right, and keeps
 * a box still arriving; flush hands back what's kept. One piece at a time, in order. */
export function frameFixer(type) {
	let held = new Blob([], { type });
	let off = false; // something couldn't be read: everything from here goes on unchanged
	const lastGood = new Map(); // each track's last good default length
	return {
		async push(piece) {
			const bytes = new Blob([held, piece], { type });
			if (off) { held = new Blob([], { type }); return bytes; }
			try {
				const view = new DataView(await bytes.arrayBuffer());
				let at = 0;
				while (at + 8 <= view.byteLength) {
					const size = view.getUint32(at), type4 = typeAt(view, at);
					// A 64-bit size, or one that runs to the end of the recording: from here it all goes on as it is.
					if (!readable(type4) || size < 8) { off = true; at = view.byteLength; break; }
					const end = at + size;
					if (end > view.byteLength) {
						if (view.byteLength - at > MAX_HELD) { off = true; at = view.byteLength; }
						break;
					}
					if (type4 === "moof") fixFragment(view, at + 8, end, lastGood);
					at = end;
				}
				held = new Blob([view.buffer.slice(at)], { type });
				return new Blob([view.buffer.slice(0, at)], { type });
			} catch (err) {
				console.warn(`frames: ${err}`);
				off = true;
				held = new Blob([], { type });
				return bytes;
			}
		},
		flush() {
			const rest = held;
			held = new Blob([], { type });
			return rest;
		},
	};
}
