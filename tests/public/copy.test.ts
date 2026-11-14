import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
	vi.unstubAllGlobals();
	vi.resetModules();
	vi.useRealTimers();
});

describe("a Copy button", () => {
	it("goes back to its own name after a second tap close behind the first, not to Copied", async () => {
		vi.useFakeTimers();
		let click = async () => {};
		const button = { dataset: { copy: "msg" }, textContent: "Copy message", addEventListener: (_: string, fn: () => Promise<void>) => { click = fn; } };
		vi.stubGlobal("document", { querySelectorAll: () => [button], getElementById: () => ({ value: "Game on Friday" }) });
		vi.stubGlobal("navigator", { clipboard: { writeText: async () => {} } });
		// @ts-expect-error: a browser script (plain JS), tested here on its own.
		await import("../../public/copy.js");
		await click();
		expect(button.textContent).toBe("Copied");
		await vi.advanceTimersByTimeAsync(1000);
		await click();
		await vi.advanceTimersByTimeAsync(5000);
		expect(button.textContent).toBe("Copy message");
	});
});
