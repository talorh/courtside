import { crc32 as nodeCrc32 } from "node:zlib";
import { describe, expect, it } from "vitest";
import { crc32, zip } from "../../src/shared/zip.ts";
import { unzip } from "../helpers/unzip.ts";

describe("zip (stored entries, enough for an .xlsx)", () => {
	it("writes entries a zip reader finds, in order, with the right sizes and checksums", () => {
		const enc = new TextEncoder();
		const files = [{ name: "[Content_Types].xml", data: enc.encode("<Types/>") }, { name: "xl/worksheets/sheet1.xml", data: enc.encode("x".repeat(1000)) },
			{ name: "empty.txt", data: new Uint8Array() }];
		const entries = unzip(zip(files));
		expect([...entries.keys()]).toEqual(files.map((f) => f.name));
		for (const f of files) {
			expect(entries.get(f.name)!.data).toEqual(f.data);
			expect(entries.get(f.name)!.crc).toBe(nodeCrc32(f.data));
		}
	});
	it("works out CRC-32 the standard way", () => {
		expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
		expect(crc32(new Uint8Array())).toBe(0);
	});
});
