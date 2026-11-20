import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
	vi.unstubAllGlobals();
	vi.resetModules();
});

/** A page with the screen's wake lock, granted only when the test says (as a phone answers a little later). */
function page() {
	const listeners = new Map<string, () => void>();
	vi.stubGlobal("document", {
		visibilityState: "visible", documentElement: { classList: { toggle: () => {} } },
		addEventListener: (type: string, fn: () => void) => listeners.set(type, fn), removeEventListener: () => {},
	});
	const asked: Array<(lock: unknown) => void> = [], locks: Array<{ released: boolean }> = [];
	vi.stubGlobal("navigator", {
		wakeLock: {
			request: () => new Promise((resolve) => asked.push(() => {
				const lock = { released: false, addEventListener: () => {}, release: async () => { lock.released = true; } };
				locks.push(lock);
				resolve(lock);
			})),
		},
	});
	return { tap: () => listeners.get("pointerdown")!(), asked, locks };
}

describe("keeping the screen on", () => {
	it("asks for one lock at a time, so a tap while the phone is answering doesn't leave a second lock held", async () => {
		const p = page();
		// @ts-expect-error: a browser script (plain JS), tested here on its own.
		const { keepAwake } = await import("../../public/awake.js");
		const awake = keepAwake();
		p.tap();
		p.tap();
		expect(p.asked).toHaveLength(1);
		p.asked[0]!(null);
		await Promise.resolve();
		awake.release();
		await Promise.resolve();
		expect(p.locks.every((l) => l.released)).toBe(true);
	});
	it("lets go of a lock that comes after it was released", async () => {
		const p = page();
		// @ts-expect-error: a browser script (plain JS), tested here on its own.
		const { keepAwake } = await import("../../public/awake.js");
		const awake = keepAwake();
		awake.release();
		p.asked[0]!(null);
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(p.locks).toHaveLength(1);
		expect(p.locks[0]!.released).toBe(true);
	});
});

describe("the screen kept on from the tap that opens a picker", () => {
	/** A page whose html.busy is noted, and a picker button whose listeners the test fires. */
	function picker() {
		const html = { busy: false };
		vi.stubGlobal("document", {
			visibilityState: "visible", addEventListener: () => {}, removeEventListener: () => {},
			documentElement: { classList: { toggle: (_name: string, on: boolean) => { html.busy = on; } } },
		});
		vi.stubGlobal("navigator", {});
		const on = new Map<string, () => void>();
		const button = { addEventListener: (type: string, fn: () => void) => on.set(type, fn) };
		return { html, button, fire: (type: string) => on.get(type)?.() };
	}

	it("a touch that turns into a scroll lets the screen go again, so pull to refresh isn't blocked by a picker never opened", async () => {
		const p = picker();
		// @ts-expect-error: a browser script (plain JS), tested here on its own.
		const { awakeOnTap } = await import("../../public/awake.js");
		awakeOnTap(p.button, () => true);
		p.fire("pointerdown");
		expect(p.html.busy).toBe(true);
		p.fire("pointercancel");
		expect(p.html.busy).toBe(false);
	});

	it("held from the tap until the job's done, and a stray cancelled touch meanwhile doesn't let go of it", async () => {
		const p = picker();
		// @ts-expect-error: a browser script (plain JS), tested here on its own.
		const { awakeOnTap } = await import("../../public/awake.js");
		let idle = true;
		const screen = awakeOnTap(p.button, () => idle);
		p.fire("pointerdown");
		screen.hold();
		idle = false;
		p.fire("pointercancel");
		expect(p.html.busy).toBe(true);
		screen.release();
		expect(p.html.busy).toBe(false);
	});
});
