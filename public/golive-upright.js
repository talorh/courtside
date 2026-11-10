// Go live: iPhone Safari labels its recording as turned, by how the phone was held when it started: a quarter turn
// (plays back in portrait, picture on its side) or a half turn (plays upside down). The picture itself is always the
// right way up, so the label is fixed in the file's header: the video track's turn (the tkhd matrix) is set back to
// none. Same size, so the upload's parts are unchanged.

const IDENTITY = [0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000];
const CONTAINERS = new Set(["moov", "trak"]);

/** Finds each track header (tkhd) in the boxes between start and end: [{ matrixAt, width, height }]. */
function trackHeaders(view, start, end, found = []) {
	for (let at = start; at + 8 <= end;) {
		const size = view.getUint32(at);
		const type = String.fromCharCode(...new Uint8Array(view.buffer, at + 4, 4));
		if (size < 8 || at + size > end) break;
		if (CONTAINERS.has(type)) trackHeaders(view, at + 8, at + size, found);
		if (type === "tkhd") {
			const matrixAt = at + 8 + 4 + (view.getUint8(at + 8) === 1 ? 32 : 20) + 16;
			found.push({ matrixAt, width: view.getUint32(matrixAt + 36) / 65536, height: view.getUint32(matrixAt + 40) / 65536 });
		}
		at += size;
	}
	return found;
}

/** The recording's first part, with a sideways (landscape) video track labelled as not turned. Anything unexpected: unchanged. */
export async function upright(part) {
	try {
		const head = new DataView(await part.slice(0, Math.min(part.size, 65536)).arrayBuffer());
		let changed = false;
		for (const t of trackHeaders(head, 0, head.byteLength)) {
			const turned = IDENTITY.some((v, i) => head.getInt32(t.matrixAt + i * 4) !== v);
			if (t.width <= t.height || !turned) continue;
			IDENTITY.forEach((v, i) => head.setInt32(t.matrixAt + i * 4, v));
			changed = true;
		}
		return changed ? new Blob([head.buffer, part.slice(head.byteLength)], { type: part.type }) : part;
	} catch (err) {
		console.warn(`upright: ${err}`);
		return part;
	}
}
