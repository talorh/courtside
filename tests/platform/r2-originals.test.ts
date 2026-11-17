// Listing a prefix in R2 (platform/r2-originals.ts): R2 answers a page at a time, and a page can be short while more
// remain, so the list follows R2's cursor until R2 says it's done.
import { describe, expect, it } from "vitest";
import { createR2Originals } from "../../src/platform/r2-originals.ts";
import { FakeR2Bucket } from "../helpers/fake-r2-bucket.ts";

describe("listing a prefix in R2", () => {
	it("follows every truncated page to the end, in key order, with each object's custom metadata", async () => {
		const bucket = new FakeR2Bucket(2);
		for (const day of ["05", "01", "03", "02", "04"]) bucket.add(`backups/d1/2026-11-${day}.sql`, { sha256: day });
		bucket.add("originals/b12.1-2026/u1/game.mov");
		const listed = await createR2Originals(bucket.asBinding()).list("backups/d1/");
		expect(listed.map((o) => o.key)).toEqual(["01", "02", "03", "04", "05"].map((d) => `backups/d1/2026-11-${d}.sql`));
		expect(listed[0]).toEqual({ key: "backups/d1/2026-11-01.sql", size: 1, uploaded: "2026-10-14T00:00:00.000Z", custom: { sha256: "01" } });
		expect(bucket.lists).toEqual([
			{ prefix: "backups/d1/", include: ["customMetadata"] },
			{ prefix: "backups/d1/", include: ["customMetadata"], cursor: "2" },
			{ prefix: "backups/d1/", include: ["customMetadata"], cursor: "4" },
		]);
	});

	it("doesn't stop at a short page R2 says is truncated", async () => {
		const bucket = new FakeR2Bucket(1);
		for (const n of [1, 2, 3]) bucket.add(`originals/g14.5-2026/u${n}/stray.mov`);
		expect((await createR2Originals(bucket.asBinding()).list("originals/g14.5-2026/"))).toHaveLength(3);
		expect(bucket.lists).toHaveLength(3);
	});

	it("an empty prefix is one call and nothing", async () => {
		const bucket = new FakeR2Bucket();
		expect(await createR2Originals(bucket.asBinding()).list("originals/none/")).toEqual([]);
		expect(bucket.lists).toHaveLength(1);
	});
});
