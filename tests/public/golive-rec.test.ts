import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeIndexedDb } from "../helpers/fake-indexeddb.ts";
// @ts-expect-error plain browser module, no types
import { record } from "../../public/golive-rec.js";

// The phone's recorder, as far as the page uses it: the test hands over the pieces itself.
class FakeRecorder {
	static made: FakeRecorder;
	state = "inactive";
	asked = 0;
	ondataavailable: ((e: { data: Blob }) => void) | null = null;
	constructor() { FakeRecorder.made = this; }
	addEventListener() {}
	start() { this.state = "recording"; }
	pause() { this.state = "paused"; }
	resume() { this.state = "recording"; }
	stop() { this.state = "inactive"; }
	requestData() { this.asked++; this.hand(0); }
	hand(bytes: number) { this.ondataavailable?.({ data: new Blob([new Uint8Array(bytes)]) }); }
}

describe("Go live's recording: how long since the phone handed any over", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.stubGlobal("MediaRecorder", FakeRecorder);
		vi.stubGlobal("indexedDB", fakeIndexedDb());
	});
	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});
	const start = async () => {
		const rec = record({}, { videoId: 41, partSize: 8_000_000, mime: "video/mp4", gameId: 7 }, { onProgress: () => {}, hint: () => {}, onFatal: () => {} });
		await vi.advanceTimersByTimeAsync(0); // the phone's storage opens
		return { rec, phone: FakeRecorder.made };
	};

	it("starts again with each piece of recording", async () => {
		const { rec, phone } = await start();
		vi.advanceTimersByTime(2000);
		expect(rec.quietFor()).toBe(2000);
		phone.hand(500);
		expect(rec.quietFor()).toBe(0);
	});
	it("an empty piece isn't recording: a recorder that answers with nothing is still quiet", async () => {
		const { rec, phone } = await start();
		vi.advanceTimersByTime(24_000);
		expect(phone.asked).toBeGreaterThan(0); // it was asked for what it has, and handed over nothing each time
		expect(rec.quietFor()).toBe(24_000);
	});
	it("a break isn't quiet: the count starts again when the recording carries on", async () => {
		const { rec, phone } = await start();
		phone.hand(500);
		rec.pause("break");
		vi.advanceTimersByTime(600_000);
		rec.resume("break");
		expect(rec.quietFor()).toBe(0);
		vi.advanceTimersByTime(3000);
		expect(rec.quietFor()).toBe(3000);
	});
	it("still held by something else, it hasn't carried on", async () => {
		const { rec, phone } = await start();
		rec.pause("break");
		rec.pause("away");
		vi.advanceTimersByTime(60_000);
		rec.resume("away");
		expect(phone.state).toBe("paused");
		expect(rec.quietFor()).toBe(60_000);
	});
	it("says what the phone's recorder is doing", async () => {
		const { rec } = await start();
		expect(rec.state()).toBe("recording");
		rec.pause("break");
		expect(rec.state()).toBe("paused");
	});
});
