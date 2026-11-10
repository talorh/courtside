// A zip file with its entries stored as they are (no compression): all an .xlsx needs (xlsx.ts), with nothing to add
// to the Worker. Times are left at 1 Jan 1980; nothing reads them.

const CRC_TABLE = (() => {
	const table = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		table[n] = c >>> 0;
	}
	return table;
})();

/** CRC-32, as zip files check their entries with. */
export function crc32(data: Uint8Array): number {
	let c = 0xffffffff;
	for (const byte of data) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

const DOS_DATE = 0x21; // 1 Jan 1980
const UTF8_NAMES = 0x0800;

/** The entries, in order, as one zip file. */
export function zip(files: Array<{ name: string; data: Uint8Array }>): Uint8Array {
	const chunks: Uint8Array[] = [], directory: Uint8Array[] = [];
	let offset = 0;
	for (const file of files) {
		const name = new TextEncoder().encode(file.name), crc = crc32(file.data), size = file.data.length;
		const local = new DataView(new ArrayBuffer(30));
		local.setUint32(0, 0x04034b50, true);
		local.setUint16(4, 20, true);
		local.setUint16(6, UTF8_NAMES, true);
		local.setUint16(12, DOS_DATE, true);
		local.setUint32(14, crc, true);
		local.setUint32(18, size, true);
		local.setUint32(22, size, true);
		local.setUint16(26, name.length, true);
		chunks.push(new Uint8Array(local.buffer), name, file.data);
		const entry = new DataView(new ArrayBuffer(46));
		entry.setUint32(0, 0x02014b50, true);
		entry.setUint16(4, 20, true);
		entry.setUint16(6, 20, true);
		entry.setUint16(8, UTF8_NAMES, true);
		entry.setUint16(14, DOS_DATE, true);
		entry.setUint32(16, crc, true);
		entry.setUint32(20, size, true);
		entry.setUint32(24, size, true);
		entry.setUint16(28, name.length, true);
		entry.setUint32(42, offset, true);
		directory.push(new Uint8Array(entry.buffer), name);
		offset += 30 + name.length + size;
	}
	const directorySize = directory.reduce((n, part) => n + part.length, 0);
	const end = new DataView(new ArrayBuffer(22));
	end.setUint32(0, 0x06054b50, true);
	end.setUint16(8, files.length, true);
	end.setUint16(10, files.length, true);
	end.setUint32(12, directorySize, true);
	end.setUint32(16, offset, true);
	const parts = [...chunks, ...directory, new Uint8Array(end.buffer)];
	const out = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
	parts.reduce((at, part) => (out.set(part, at), at + part.length), 0);
	return out;
}
