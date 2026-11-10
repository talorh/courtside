import { afterEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error: a browser script (plain JS), tested here on its own.
import { mixer, soundForTaps } from "../../public/golive-mixer.js";

afterEach(() => vi.unstubAllGlobals());

/** A stand-in page: the canvas the mixer makes, with every drawing it's asked for, and a camera preview of a set size. */
function page(width: number, height: number) {
	const drawn: number[][] = [];
	const canvas = {
		width: 0, height: 0,
		getContext: () => ({ fillStyle: "", fillRect: () => {}, drawImage: (_v: unknown, ...at: number[]) => drawn.push(at) }),
		captureStream: () => ({ getVideoTracks: () => [] }),
	};
	let frame: (() => void) | null = null;
	const video = { videoWidth: width, videoHeight: height, requestVideoFrameCallback: (fn: () => void) => { frame = fn; return 1; }, cancelVideoFrameCallback: () => {} };
	vi.stubGlobal("document", { createElement: () => canvas });
	vi.stubGlobal("MediaStream", class { constructor(public tracks: unknown[]) {} });
	const node = { connect: () => {}, disconnect: () => {} };
	const sound = { createMediaStreamDestination: () => ({ stream: { getAudioTracks: () => [] } }), createMediaStreamSource: () => node };
	return { canvas, video, drawn, sound: { sound, wake: () => {} }, nextFrame: () => frame?.() };
}

describe("what Go live's recording records", () => {
	it("a sideways camera is recorded as it is", () => {
		const p = page(1280, 720);
		mixer(p.video, {}, p.sound);
		expect([p.canvas.width, p.canvas.height]).toEqual([1280, 720]);
		expect(p.drawn.at(-1)).toEqual([0, 0]);
	});
	it("an upright camera is still recorded sideways, fitted in the middle, so the picture is the right shape once the phone turns", () => {
		const p = page(720, 1280);
		mixer(p.video, {}, p.sound);
		expect([p.canvas.width, p.canvas.height]).toEqual([1280, 720]);
		expect(p.drawn.at(-1)).toEqual([437.5, 0, 405, 720]);
		p.video.videoWidth = 1280;
		p.video.videoHeight = 720;
		p.nextFrame();
		expect(p.drawn.at(-1)).toEqual([0, 0]);
	});
	it("a camera that isn't showing yet gets the usual size", () => {
		const p = page(0, 0);
		mixer(p.video, {}, p.sound);
		expect([p.canvas.width, p.canvas.height]).toEqual([1280, 720]);
	});
});

describe("the recording's sound", () => {
	/** The phone's sound, as the page uses it: `state` is the phone's to change, `change()` tells the page it has. */
	function phoneSound(state: string) {
		const made = { state, resumed: 0, change: () => {} };
		vi.stubGlobal("AudioContext", class {
			get state() { return made.state; }
			resume() { made.resumed++; return Promise.resolve(); }
			addEventListener(type: string, fn: () => void) { if (type === "statechange") made.change = fn; }
		});
		vi.stubGlobal("addEventListener", () => {});
		return made;
	}
	it("is started when it's made", () => {
		const phone = phoneSound("suspended");
		soundForTaps();
		expect(phone.resumed).toBe(1);
	});
	it("is started again as soon as the phone stops it (a call, a lock, the camera's own prompt), without waiting for a tap", () => {
		const phone = phoneSound("running");
		soundForTaps();
		phone.state = "interrupted";
		phone.change();
		expect(phone.resumed).toBe(1);
		phone.state = "running";
		phone.change();
		expect(phone.resumed).toBe(1);
	});
});
