/** Reads back a zip's stored (uncompressed) entries from its central directory, checking each local header agrees. */
export function unzip(bytes: Uint8Array): Map<string, { data: Uint8Array; crc: number }> {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const end = bytes.length - 22;
	if (view.getUint32(end, true) !== 0x06054b50) throw new Error("No end of central directory");
	const entries = new Map<string, { data: Uint8Array; crc: number }>();
	let at = view.getUint32(end + 16, true);
	for (let i = 0; i < view.getUint16(end + 10, true); i++) {
		if (view.getUint32(at, true) !== 0x02014b50) throw new Error("Bad central directory header");
		const crc = view.getUint32(at + 16, true), size = view.getUint32(at + 20, true), nameLength = view.getUint16(at + 28, true);
		const offset = view.getUint32(at + 42, true);
		const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLength));
		if (view.getUint16(at + 10, true) !== 0 || view.getUint32(offset, true) !== 0x04034b50 || view.getUint32(offset + 14, true) !== crc) {
			throw new Error(`Bad local header for ${name}`);
		}
		const start = offset + 30 + view.getUint16(offset + 26, true) + view.getUint16(offset + 28, true);
		entries.set(name, { data: bytes.subarray(start, start + size), crc });
		at += 46 + nameLength + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
	}
	return entries;
}

/** A sheet's rows as text, from an .xlsx's first worksheet. */
export function sheetRows(xlsx: Uint8Array): string[][] {
	const xml = new TextDecoder().decode(unzip(xlsx).get("xl/worksheets/sheet1.xml")!.data);
	const unescape = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
	return [...xml.matchAll(/<row r="\d+">([\s\S]*?)<\/row>/g)].map((r) => [...r[1]!.matchAll(/<t xml:space="preserve">([\s\S]*?)<\/t>/g)].map((c) => unescape(c[1]!)));
}

/** A worksheet's rows (`n`, from 1) as Excel holds them: text as text, numbers as numbers, each with its cell's style. */
export function sheetCells(xlsx: Uint8Array, n = 1): Array<Array<{ v: string | number; s: number }>> {
	const xml = new TextDecoder().decode(unzip(xlsx).get(`xl/worksheets/sheet${n}.xml`)!.data);
	const unescape = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
	return [...xml.matchAll(/<row r="\d+">([\s\S]*?)<\/row>/g)].map((r) => [...r[1]!.matchAll(/<c r="[A-Z]+\d+"( t="inlineStr")? s="(\d+)">(?:<is><t xml:space="preserve">([\s\S]*?)<\/t><\/is>|<v>([^<]*)<\/v>)<\/c>/g)]
		.map((c) => ({ v: c[1] ? unescape(c[3]!) : Number(c[4]), s: Number(c[2]) })));
}
