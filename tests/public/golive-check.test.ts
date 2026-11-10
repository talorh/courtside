import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
	vi.unstubAllGlobals();
	vi.resetModules();
});

type Check = { builtIntoApp: (ua: string, ios: boolean, webApp: boolean) => boolean };

const SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1";
// The site opened from the Home Screen, and a browser built into another app, can both lack "Safari/".
const NO_SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
const FACEBOOK = `${NO_SAFARI} [FBAN/FBIOS;FBAV/500.0.0]`;
const CHROME = "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36";
const WEBVIEW = "Mozilla/5.0 (Linux; Android 15; Pixel 9; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/142.0.0.0 Mobile Safari/537.36";

/** golive-check.js reads the browser as it loads (and webapp.js with it): a phone with nothing on the page. */
async function load(): Promise<Check> {
	vi.stubGlobal("navigator", { userAgent: SAFARI, maxTouchPoints: 5 });
	vi.stubGlobal("matchMedia", () => ({ matches: false }));
	vi.stubGlobal("window", { addEventListener: () => {} });
	vi.stubGlobal("document", { getElementById: () => null, documentElement: { classList: { add: () => {} } } });
	// @ts-expect-error: a browser script (plain JS), tested here on its own.
	return import("../../public/golive-check.js");
}

describe("Go live's check for a browser built into another app", () => {
	it("lets the site opened from the Home Screen stream on an iPhone, though its browser name lacks Safari's", async () => {
		const { builtIntoApp } = await load();
		expect(builtIntoApp(SAFARI, true, false)).toBe(false);
		expect(builtIntoApp(NO_SAFARI, true, true)).toBe(false);
		// The same name anywhere else is another app's browser, which often can't use the camera.
		expect(builtIntoApp(NO_SAFARI, true, false)).toBe(true);
	});
	it("still catches Facebook and the like (even added to the Home Screen) and Android's built-in browser", async () => {
		const { builtIntoApp } = await load();
		expect(builtIntoApp(FACEBOOK, true, true)).toBe(true);
		expect(builtIntoApp(WEBVIEW, false, false)).toBe(true);
		expect(builtIntoApp(CHROME, false, false)).toBe(false);
		expect(builtIntoApp(CHROME, false, true)).toBe(false);
	});
});
