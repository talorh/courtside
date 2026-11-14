import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
	vi.unstubAllGlobals();
	vi.resetModules();
	vi.useRealTimers();
});

type Handler = (e?: unknown) => unknown;
interface Fake { on: Record<string, Handler>; dataset: Record<string, string>; disabled: boolean; textContent: string; value: string; scrollIntoView: ReturnType<typeof vi.fn>; [k: string]: unknown }

function fakeEl(extra: Record<string, unknown> = {}): Fake {
	const el: Fake = { on: {}, dataset: {}, disabled: false, textContent: "", value: "", scrollIntoView: vi.fn(), matches: () => true,
		addEventListener: (type: string, fn: Handler) => { el.on[type] = fn; }, querySelector: () => null, querySelectorAll: () => [], ...extra };
	return el;
}

/** The sign-in page's code step, as signin.js finds it. */
async function open() {
	vi.useFakeTimers();
	const submit = vi.fn();
	const form = fakeEl({ requestSubmit: submit });
	const code = fakeEl({ form });
	const email = fakeEl();
	const resend = fakeEl();
	const viewport = fakeEl();
	const win = fakeEl({ visualViewport: viewport });
	let active: Fake | null = null;
	vi.stubGlobal("document", {
		querySelector: (s: string) => (s === "[data-resend]" ? resend : s === "[data-code]" ? code : null),
		querySelectorAll: (s: string) => (s === ".signin form" ? [form] : s === ".signin input" ? [email, code] : []),
		get activeElement() { return active; },
	});
	vi.stubGlobal("window", win);
	// @ts-expect-error: a browser script (plain JS), tested here on its own.
	const mod = await import("../../public/signin.js");
	return { mod, form, submit, code, email, resend, viewport, win, focus: (el: Fake) => { active = el; el.on.focus!(); } };
}

// The sign-in page's script: the code field logs in by itself, and the keyboard never hides the field.
describe("the sign-in page's code field", () => {
	it("tidies what's typed or pasted to six digits with a space, and logs in by itself at six", async () => {
		const { mod, code, form, submit } = await open();
		expect(mod.tidyCode("Your code is 482 913.")).toBe("482 913");
		expect(mod.tidyCode("48")).toBe("48");
		expect(mod.tidyCode("4829137")).toBe("482 913");
		code.value = "4829";
		code.on.input!();
		expect([code.value, submit.mock.calls.length]).toEqual(["482 9", 0]);
		code.value = "482913";
		code.on.input!();
		expect([code.value, submit.mock.calls.length]).toEqual(["482 913", 1]);
		// Submitting marks the form sent (its listener), so a second input event doesn't post again.
		form.on.submit!({ preventDefault: () => {} });
		code.on.input!();
		expect(submit.mock.calls.length).toBe(1);
	});
	it("brings the field being typed in back into view once the keyboard is up", async () => {
		const { email, viewport, focus } = await open();
		focus(email);
		expect(email.scrollIntoView).not.toHaveBeenCalled();
		vi.advanceTimersByTime(400);
		expect(email.scrollIntoView).toHaveBeenCalledWith({ block: "center", behavior: "smooth" });
		viewport.on.resize!();
		expect(email.scrollIntoView).toHaveBeenCalledTimes(2);
	});
	it("Send a new code waits a minute, counting down", async () => {
		const { resend } = await open();
		expect([resend.disabled, resend.textContent]).toEqual([true, "Send a new code (ready in 60s)"]);
		vi.advanceTimersByTime(60_000);
		expect([resend.disabled, resend.textContent]).toEqual([false, "Send a new code"]);
	});
	it("Back to the page after its countdown ended: Send a new code works again, as the page's other buttons do", async () => {
		const { resend, form, win } = await open();
		vi.advanceTimersByTime(60_000);
		form.querySelectorAll = (s: string) => (s.includes(":not([data-resend])") ? [] : [resend]);
		resend.disabled = true; // tapped: the form's buttons are disabled as it goes
		win.on.pageshow!({ persisted: true });
		expect(resend.disabled).toBe(false);
	});
});
