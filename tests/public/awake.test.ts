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
