import { describe, expect, it } from "vitest";
import { newStorageCache, STORAGE_CACHE_MS, withCachedStorage } from "../../src/platform/storage-cache.ts";
import { FakeLive } from "../helpers/fakes.ts";

describe("cached Stream storage", () => {
	it("reuses one answer for ten minutes, then asks Stream again", async () => {
		const live = new FakeLive();
		let t = Date.parse("2026-10-17T00:00:00Z");
		const cached = withCachedStorage(live, newStorageCache(), () => new Date(t));
		expect(await cached.storage()).toEqual({ usedMinutes: 65, limitMinutes: 1100 });
		live.usage = { usedMinutes: 900, limitMinutes: 1100 };
		t += STORAGE_CACHE_MS - 1;
		expect((await cached.storage()).usedMinutes).toBe(65);
		t += 1;
		expect((await cached.storage()).usedMinutes).toBe(900);
	});

	it("doesn't keep a failure, and leaves the other live calls alone", async () => {
		const live = new FakeLive();
		const cached = withCachedStorage(live, newStorageCache(), () => new Date());
		live.down = true;
		await expect(cached.storage()).rejects.toThrow("(503)");
		live.down = false;
		expect((await cached.storage()).usedMinutes).toBe(65);
		expect(await cached.isConnected("nope")).toBe(false);
	});
});
