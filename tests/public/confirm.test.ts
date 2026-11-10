import { afterEach, describe, expect, it, vi } from "vitest";

// "Are you sure" (public/confirm.js): Yes posts once, however many taps; and works again after Back.

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
	vi.resetModules();
});

async function open() {
	const button = { disabled: false };
	const form = { dataset: {} as Record<string, string>, on: {} as Record<string, (e: { preventDefault: () => void }) => void>,
		addEventListener(type: string, fn: (e: { preventDefault: () => void }) => void) { this.on[type] = fn; }, querySelectorAll: () => [button] };
	const shown: Array<(e: { persisted: boolean }) => void> = [];
	vi.stubGlobal("document", { querySelectorAll: (q: string) => (q === ".confirm form" ? [form] : []) });
	vi.stubGlobal("window", { addEventListener: (type: string, fn: (e: { persisted: boolean }) => void) => { if (type === "pageshow") shown.push(fn); } });
	vi.useFakeTimers();
	vi.resetModules();
	// @ts-expect-error: a browser script (plain JS), tested here on its own.
	await import("../../public/confirm.js");
	const submit = () => { const e = { preventDefault: vi.fn() }; form.on.submit!(e); vi.runAllTimers(); return e.preventDefault.mock.calls.length > 0; };
	return { form, button, submit, back: (persisted: boolean) => shown.forEach((fn) => fn({ persisted })) };
}

describe("the confirm question", () => {
	it("posts once, however many taps, greying out Yes", async () => {
		const page = await open();
		expect(page.submit()).toBe(false);
		expect(page.button.disabled).toBe(true);
		expect(page.submit()).toBe(true);
	});
	it("works again when Back brings the page from the browser's cache", async () => {
		const page = await open();
		page.submit();
		page.back(false);
		expect(page.button.disabled).toBe(true);
		page.back(true);
		expect([page.button.disabled, page.form.dataset.sent]).toEqual([false, undefined]);
		expect(page.submit()).toBe(false);
	});
});
