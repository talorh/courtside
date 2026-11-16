import { afterEach, expect, it, vi } from "vitest";

// The Documentation AI assistant (public/docs-ask.js), on a stand-in page.
const realFetch = globalThis.fetch, realTimeout = AbortSignal.timeout;
afterEach(() => {
	globalThis.fetch = realFetch;
	AbortSignal.timeout = realTimeout;
	vi.unstubAllGlobals();
	vi.resetModules();
});

/** The stand-in page, with the script loaded: `ask()` taps Ask; `out.shown` is what the answer box says. */
async function standIn() {
	let submit: ((e: { preventDefault(): void }) => Promise<void>) | undefined;
	const button = { disabled: false };
	const out = { hidden: true, shown: [] as string[], replaceChildren(...parts: Array<{ textContent: string }>) { this.shown = parts.map((p) => p.textContent); } };
	const elements: Record<string, object> = {
		"docs-ai": { addEventListener: (_: string, f: typeof submit) => { submit = f; }, querySelector: () => button },
		"docs-ai-q": { value: "How does Go live save a game?", focus() {} },
		"docs-ai-a": out,
	};
	vi.stubGlobal("document", { getElementById: (id: string) => elements[id] ?? null, createElement: () => ({}) });
	// @ts-expect-error: a browser script (plain JS), run here with a stand-in page.
	await import("../../public/docs-ask.js");
	return { button, out, ask: () => submit?.({ preventDefault() {} }) };
}

it("gives up on a stalled answer after 90 seconds, says it couldn't reach the assistant, and can be asked again", async () => {
	const asked: number[] = [], gaveUp = new AbortController();
	AbortSignal.timeout = (ms: number) => { asked.push(ms); return gaveUp.signal; };
	globalThis.fetch = ((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
		init.signal?.addEventListener("abort", () => reject(new DOMException("The operation timed out.", "TimeoutError")));
	})) as typeof fetch;
	const { button, out, ask } = await standIn();
	const asking = ask();
	expect([button.disabled, out.shown]).toEqual([true, ["Reading the documentation…"]]);
	gaveUp.abort();
	await asking;
	expect(asked).toEqual([90_000]);
	expect(out.shown).toEqual(["Couldn't reach the assistant. Check your connection and try again."]);
	expect(button.disabled).toBe(false);
});

it("says why the site refused a question (a day's questions used up, signed out), not that the connection failed", async () => {
	const refusals = [
		[429, "too_many_questions", "That's a lot of questions for one day. Try the search, or ask again tomorrow."],
		[401, "unauthenticated", "You've been signed out. Reload the page and sign in."],
	] as const;
	let next = 0;
	globalThis.fetch = (async () => {
		const [status, code, message] = refusals[next++]!;
		return new Response(JSON.stringify({ ok: false, error: { code, message } }), { status, headers: { "Content-Type": "application/json" } });
	}) as typeof fetch;
	const { button, out, ask } = await standIn();
	for (const [, , message] of refusals) {
		await ask();
		expect(out.shown).toEqual([message]);
		expect(button.disabled).toBe(false);
	}
});
