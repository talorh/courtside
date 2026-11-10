import { describe, expect, it } from "vitest";
// @ts-expect-error: a browser script (plain JS), tested here on its own.
import { onPhoneMinutes, statusText, uprightAdvice } from "../../public/golive-status.js";

const live = { live: true, tall: false, paused: null, minutes: 12, connected: true, trouble: "", progress: null };

describe("statusText (Go live's camera screen)", () => {
	it("before Go live: ready, or turn the phone sideways while the picture is upright, with the phone's own setting", () => {
		expect(statusText({ ...live, live: false })).toBe("Camera ready. Tap Go live during the warm-up.");
		expect(statusText({ ...live, live: false, tall: true, phone: "iphone" }))
			.toBe("Turn the phone sideways to go live. Already sideways? Turn off Portrait Orientation Lock: swipe down from the top-right corner and tap the padlock.");
		expect(statusText({ ...live, live: false, tall: true, phone: "android" }))
			.toBe("Turn the phone sideways to go live. Already sideways? Turn on Auto-rotate: swipe down from the top of the screen and tap Auto-rotate.");
		expect(statusText({ ...live, live: false, tall: true, phone: "other" })).toBe("Turn the phone sideways to go live.");
	});

	it("live: minutes, whether families are getting the picture, and what's been recorded and sent", () => {
		expect(statusText({ ...live, progress: { recordedBytes: 41_600_000, sentBytes: 39_200_000 } }))
			.toBe("● LIVE 12 min · Families can watch · 42 MB recorded, 39 MB sent");
		expect(statusText({ ...live, connected: false })).toBe("● LIVE 12 min · Reconnecting the live picture (the recording carries on)");
		expect(statusText({ ...live, tall: true })).toBe("● LIVE 12 min · Turn the phone back sideways · Families can watch");
	});

	it("a weak signal: once minutes of the game are only on the phone, it says so, so the page is kept open until Saved", () => {
		expect(statusText({ ...live, progress: { recordedBytes: 500_000_000, sentBytes: 300_000_000 } }))
			.toBe("● LIVE 12 min · Families can watch · 500 MB recorded, 300 MB sent · About 10 min of the game only on this phone so far: keep this page open after the game until Saved");
		expect(onPhoneMinutes({ waitingBytes: 495_000_000 })).toBe(25);
		expect(onPhoneMinutes({ waitingBytes: 10_000_000 })).toBe(0);
		expect(onPhoneMinutes(null)).toBe(0);
	});

	it("the camera stopped (a lock, a call, another app): it says so, and that Resume camera carries on, over a break too", () => {
		const said = '⏸ CAMERA STOPPED · Families see "Game break". Tap Resume camera to carry on.';
		expect(statusText({ ...live, cameraGone: true })).toBe(said);
		expect(statusText({ ...live, cameraGone: true, paused: "1:20" })).toBe(said);
	});

	it("a Resume camera that didn't work says why on the camera screen, with families still on Game break", () => {
		expect(statusText({ ...live, cameraGone: "The camera didn't start: a call or another app may still have it. Tap Resume camera again." }))
			.toBe(`⏸ CAMERA STOPPED · The camera didn't start: a call or another app may still have it. Tap Resume camera again. Families see "Game break" meanwhile.`);
	});

	it("tapped while upright, it says it goes live as soon as the phone is turned, or on a second tap", () => {
		expect(statusText({ ...live, live: false, tall: true, phone: "iphone", waiting: true }))
			.toBe("Turn the phone sideways: it goes live as soon as you do. Already sideways? Turn off Portrait Orientation Lock: swipe down from the top-right corner and tap the padlock. Or tap Go live again to go live as it is.");
		expect(statusText({ ...live, live: false, tall: true, phone: "other", waiting: true }))
			.toBe("Turn the phone sideways: it goes live as soon as you do. Or tap Go live again to go live as it is.");
		expect(statusText({ ...live, live: false, tall: false, phone: "iphone", waiting: true })).toBe("Camera ready. Tap Go live during the warm-up.");
	});

	it("the upright advice is the same words the first upright Go live tap gives", () => {
		expect(uprightAdvice("iphone")).toMatch(/Portrait Orientation Lock/);
		expect(uprightAdvice("android")).toMatch(/Auto-rotate/);
	});

	it("trouble replaces the MB line, and paused says how long and to Resume", () => {
		expect(statusText({ ...live, trouble: " · ⚠ No sound", progress: { recordedBytes: 1e6, sentBytes: 1e6 } })).toBe("● LIVE 12 min · Families can watch · ⚠ No sound");
		expect(statusText({ ...live, paused: "2:13" })).toBe('⏸ PAUSED 2:13 · Families see "Game break". Tap Resume before play starts.');
	});
});
