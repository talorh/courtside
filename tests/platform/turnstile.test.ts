import { describe, expect, it, vi } from "vitest";
import { createTurnstile, TURNSTILE_ACTION } from "../../src/platform/turnstile.ts";

// Cloudflare Turnstile: the sign-in page's widget gives a token, and the Worker asks Cloudflare
// whether it's good before a code is sent. Cloudflare not answering mustn't stop families signing in.

const answering = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status }));
const good = { success: true, hostname: "saints.example", action: TURNSTILE_ACTION, "error-codes": [] };

describe("checking a Turnstile token", () => {
	it("asks Cloudflare with the secret, the token and the person's IP address, and a good answer for this site is ok", async () => {
		const fetch = answering(good);
		expect(await createTurnstile({ secret: "sek", fetch }).verify("tok", "1.2.3.4", "saints.example")).toEqual({ result: "ok", detail: "" });
		const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
		expect(init.method).toBe("POST");
		expect(Object.fromEntries(init.body as URLSearchParams)).toEqual({ secret: "sek", response: "tok", remoteip: "1.2.3.4" });
		expect(init.signal).toBeInstanceOf(AbortSignal);
	});
	it("fails a missing token without asking, and a token Cloudflare says no to, saying why", async () => {
		const fetch = answering({ success: false, "error-codes": ["timeout-or-duplicate"] });
		const turnstile = createTurnstile({ secret: "sek", fetch });
		expect(await turnstile.verify("", "1.2.3.4", "saints.example")).toEqual({ result: "failed", detail: "no token" });
		expect(fetch).not.toHaveBeenCalled();
		expect(await turnstile.verify("tok", "1.2.3.4", "saints.example")).toEqual({ result: "failed", detail: "timeout-or-duplicate" });
	});
	it("fails a good token made for another page or another site", async () => {
		expect((await createTurnstile({ secret: "s", fetch: answering({ ...good, action: "other" }) }).verify("t", "", "saints.example")).result).toBe("failed");
		expect((await createTurnstile({ secret: "s", fetch: answering({ ...good, hostname: "evil.test" }) }).verify("t", "", "saints.example")).result).toBe("failed");
	});
	it("on this computer (localhost), Cloudflare's test keys pass whatever host they name", async () => {
		const fetch = answering({ ...good, hostname: "example.com" });
		expect((await createTurnstile({ secret: "s", fetch }).verify("t", "", "localhost")).result).toBe("ok");
	});
	it("is unreachable, not failed, when Cloudflare doesn't answer, answers with an error, or has its own trouble", async () => {
		const down = vi.fn(async () => { throw new TypeError("network"); });
		expect(await createTurnstile({ secret: "s", fetch: down }).verify("t", "", "saints.example")).toEqual({ result: "unreachable", detail: "TypeError: network" });
		expect(await createTurnstile({ secret: "s", fetch: answering({}, 503) }).verify("t", "", "saints.example")).toEqual({ result: "unreachable", detail: "HTTP 503" });
		const garbled = vi.fn(async () => new Response("<html>", { status: 200 }));
		expect((await createTurnstile({ secret: "s", fetch: garbled }).verify("t", "", "saints.example")).result).toBe("unreachable");
		const internal = answering({ success: false, "error-codes": ["internal-error"] });
		expect((await createTurnstile({ secret: "s", fetch: internal }).verify("t", "", "saints.example")).result).toBe("unreachable");
	});
});
