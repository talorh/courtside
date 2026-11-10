import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error plain browser module, no types
import { watchPhone } from "../../public/golive-watch.js";

const track = () => ({ readyState: "live", muted: false, addEventListener: () => {}, removeEventListener: () => {} });
const media = { getVideoTracks: () => [track()], getAudioTracks: () => [track()] };

describe("Go live's watch on the phone: a recording that hands nothing over", () => {
	let posted: string[];
	beforeEach(() => {
		vi.useFakeTimers();
		posted = [];
		vi.stubGlobal("document", { visibilityState: "visible", addEventListener: () => {}, removeEventListener: () => {} });
		vi.stubGlobal("addEventListener", () => {});
		vi.stubGlobal("removeEventListener", () => {});
		vi.stubGlobal("navigator", { userAgent: "a phone" });
		vi.stubGlobal("fetch", async (_path: string, init: { body: string }) => {
			posted.push(...(JSON.parse(init.body) as { events: { what: string }[] }).events.map((e) => e.what));
			return new Response('{"ok":true,"data":{}}', { headers: { "Content-Type": "application/json" } });
		});
	});
	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});
	/** A stream whose recording has been quiet for `quiet()` ms; `said`: what the filmer was told, in order. */
	function watching(quiet: () => number, paused = false) {
		const said: string[] = [];
		const phone = watchPhone(media, 7, {
			live: () => ({ sent: async () => ({ audio: 10, video: 20 }) }), rec: { quietFor: quiet }, paused: () => paused,
			health: () => "recorder recording; sound interrupted", onCameraLost: () => {},
			onRecordingQuiet: () => said.push("quiet"), onRecordingBack: () => said.push("back"),
		});
		return { said, phone };
	}
	const logged = async () => { await vi.advanceTimersByTimeAsync(30_000); return posted; };

	it("tells the filmer once nothing has been recorded for 20 seconds, and only once while it lasts", async () => {
		const { said } = watching(() => 25_000);
		await vi.advanceTimersByTimeAsync(40_000);
		expect(said).toEqual(["quiet"]);
	});
	it("says nothing on a break", async () => {
		const { said } = watching(() => 600_000, true);
		await vi.advanceTimersByTimeAsync(40_000);
		expect(said).toEqual([]);
	});
	it("takes it back when the recording carries on by itself, and tells them again if it stops again", async () => {
		let quiet = 25_000;
		const { said } = watching(() => quiet);
		await vi.advanceTimersByTimeAsync(10_000);
		quiet = 2000;
		await vi.advanceTimersByTimeAsync(10_000);
		expect(said).toEqual(["quiet", "back"]);
		quiet = 31_000;
		await vi.advanceTimersByTimeAsync(10_000);
		expect(said).toEqual(["quiet", "back", "quiet"]);
		expect(await logged()).toContain("recording back");
	});
	it("a quiet check's line says what the recorder and the sound are doing, to explain it afterwards", async () => {
		watching(() => 12_000);
		expect(await logged()).toContain("check: 10 sound, 20 picture packets sent; recording quiet 12s; recorder recording; sound interrupted");
	});
	it("a check with the recording going says only the usual", async () => {
		watching(() => 1000);
		await vi.advanceTimersByTimeAsync(95_000); // the minute's check, then the next sending
		expect(posted.filter((what) => what.startsWith("check:"))).toEqual(["check: 10 sound, 20 picture packets sent; recording quiet 1s"]);
	});
});
