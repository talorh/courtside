import { afterEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error: a browser script (plain JS), tested here on its own.
import { tapAgain } from "../../public/tap-again.js";

afterEach(() => { vi.useRealTimers(); });

describe("a button that asks for a second tap (Cancel upload)", () => {
	it("the first tap asks, a second within 8 seconds means it, and left alone it goes back to its name", () => {
		vi.useFakeTimers();
		const button = { textContent: "Cancel upload" };
		const cancel = tapAgain(button, "Tap again to cancel the upload");
		expect(cancel.sure()).toBe(false);
		expect(button.textContent).toBe("Tap again to cancel the upload");
		vi.advanceTimersByTime(8000);
		expect(button.textContent).toBe("Cancel upload");
		expect(cancel.sure()).toBe(false);
		expect(cancel.sure()).toBe(true);
	});
	it("a wait left over from an earlier upload doesn't undo a newer first tap", () => {
		vi.useFakeTimers();
		const button = { textContent: "Cancel upload" };
		const cancel = tapAgain(button, "Tap again to cancel the upload");
		cancel.sure();
		// That upload finishes before a second tap; the next starts, and its Cancel is tapped once 5 seconds after the first tap.
		cancel.reset();
		vi.advanceTimersByTime(5000);
		expect(cancel.sure()).toBe(false);
		// 8 seconds after the earlier upload's first tap: the newer tap still stands.
		vi.advanceTimersByTime(3500);
		expect(button.textContent).toBe("Tap again to cancel the upload");
		expect(cancel.sure()).toBe(true);
	});
});
