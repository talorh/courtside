import { afterEach, expect, it } from "vitest";

const g = globalThis as Record<string, unknown>;
const real = { document: g.document, window: g.window, location: g.location, HTMLDetailsElement: g.HTMLDetailsElement }, realFetch = globalThis.fetch;
afterEach(() => {
	Object.assign(globalThis, real);
	globalThis.fetch = realFetch;
});

it("Ask sends the question with the page's team (X-Courtside-Team)", async () => {
	let submit: ((e: { preventDefault(): void }) => Promise<void>) | undefined;
	const el = (o: object = {}) => ({ addEventListener: (_: string, f: typeof submit) => { submit = f; }, querySelector: () => el(), focus() {}, ...o });
	const elements: Record<string, object> = { ask: el(), "ask-q": el({ value: "When is the next game?" }), "ask-a": el({ hidden: true, textContent: "" }) };
	Object.assign(globalThis, {
		document: { documentElement: { dataset: { team: "g14.5-2026" } }, getElementById: (id: string) => elements[id] ?? null },
		window: { addEventListener() {} },
		location: { hash: "" },
		HTMLDetailsElement: class {},
	});
	const sent: RequestInit[] = [];
	globalThis.fetch = (async (_url: string, init: RequestInit) => {
		sent.push(init);
		return new Response(JSON.stringify({ ok: true, data: { answer: "Friday." } }));
	}) as typeof fetch;
	// @ts-expect-error: a browser script (plain JS), run here with a stand-in page.
	await import("../../public/ask.js");
	await submit?.({ preventDefault() {} });
	expect(new Headers(sent[0]?.headers).get("X-Courtside-Team")).toBe("g14.5-2026");
	expect((elements["ask-a"] as { textContent: string }).textContent).toBe("Friday.");
});
