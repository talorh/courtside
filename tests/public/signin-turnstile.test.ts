import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
	vi.unstubAllGlobals();
	vi.resetModules();
	vi.useRealTimers();
});

// The sign-in page's Turnstile widget (platform/turnstile.ts), as signin.js handles it: Cloudflare's script loaded where
// there's a widget, and a form that waits for the widget's token before it posts.

type Handler = (e?: unknown) => unknown;

/** The email step: its form with the widget (and, once Turnstile makes one, the token's field), and its button. */
async function open(o: { widgetScript?: boolean } = {}) {
	vi.useFakeTimers();
	const on: Record<string, Handler> = {};
	const token = { value: "" };
	const widget = {};
	const button = { disabled: false };
	const dataset: Record<string, string> = {};
	const form = {
		dataset, addEventListener: (type: string, fn: Handler) => { on[type] = fn; },
		querySelector: (s: string) => (s === ".cf-turnstile" ? widget : s === '[name="cf-turnstile-response"]' ? token : null),
		querySelectorAll: () => [button], requestSubmit: vi.fn(),
	};
	const added: Array<{ src: string; async: boolean }> = [];
	const reset = vi.fn();
	vi.stubGlobal("document", {
		querySelector: (s: string) => (s === ".cf-turnstile" ? widget : null),
		querySelectorAll: (s: string) => (s === ".signin form" ? [form] : s === ".cf-turnstile" ? [widget] : []),
		createElement: () => ({ src: "", async: false }),
		head: { append: (el: { src: string; async: boolean }) => added.push(el) },
	});
	const win: Record<string, unknown> = { addEventListener: (type: string, fn: Handler) => { on[`window:${type}`] = fn; } };
	if (o.widgetScript !== false) win.turnstile = { reset };
	vi.stubGlobal("window", win);
	// @ts-expect-error: a browser script (plain JS), tested here on its own.
	const mod = await import("../../public/signin.js");
	const submit = () => { const e = { preventDefault: vi.fn() }; on.submit!(e); return e.preventDefault.mock.calls.length > 0; };
	return { mod, form, token, button, added, reset, submit, pageshow: () => on["window:pageshow"]!({ persisted: true }) };
}

describe("Turnstile on the sign-in page", () => {
	it("loads Cloudflare's script (a plain script, async) where there's a widget", async () => {
		const { added, mod } = await open();
		expect(added).toEqual([{ src: mod.TURNSTILE_SRC, async: true }]);
		expect(mod.TURNSTILE_SRC).toBe("https://challenges.cloudflare.com/turnstile/v0/api.js");
	});
	it("a tap before the token is ready waits, then posts by itself once it's there, once", async () => {
		const { form, token, button, submit } = await open();
		expect(submit()).toBe(true);
		expect(button.disabled).toBe(true);
		vi.advanceTimersByTime(1000);
		expect(form.requestSubmit).not.toHaveBeenCalled();
		token.value = "tok";
		vi.advanceTimersByTime(200);
		expect(form.requestSubmit).toHaveBeenCalledTimes(1);
		// requestSubmit's own submit: now it goes, and it's marked sent.
		expect(submit()).toBe(false);
		expect(form.dataset.sent).toBe("1");
	});
	it("posts straight away once the token is there", async () => {
		const { form, token, submit } = await open();
		token.value = "tok";
		expect(submit()).toBe(false);
		expect(form.requestSubmit).not.toHaveBeenCalled();
	});
	it("posts anyway after 20 seconds with no token, and straight away if the widget's script never loaded", async () => {
		const waited = await open();
		expect(waited.submit()).toBe(true);
		vi.advanceTimersByTime(waited.mod.CHECK_WAIT_MS + 200);
		expect(waited.form.requestSubmit).toHaveBeenCalledTimes(1);
		expect(waited.submit()).toBe(false);
		vi.unstubAllGlobals();
		vi.resetModules();
		const blocked = await open({ widgetScript: false });
		expect(blocked.submit()).toBe(false);
	});
	it("Back to the page from the browser's cache: each widget makes a new token (one is good once)", async () => {
		const { reset, pageshow } = await open();
		pageshow();
		expect(reset).toHaveBeenCalledTimes(1);
	});
});
