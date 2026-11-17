// Cloudflare Turnstile: the sign-in page's check that a person, not a script, is asking for a
// code. The page's widget gives a token (public/signin.js); the Worker asks Cloudflare whether it's good before any code
// is sent. Each site has its own widget and secret (the club's domain, and staging's address).

const VERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
/** The widget's action on the sign-in page (views/signin-page.ts): a token made for anything else isn't taken. */
export const TURNSTILE_ACTION = "signin";
const TIMEOUT_MS = 10_000;
/** The longest token Cloudflare makes. */
const MAX_TOKEN = 2048;

/** "failed": not a person; a token that's missing, longer than Cloudflare makes, already used or too old; or a question
 * Cloudflare refused (a 4xx other than 429). "unreachable": Cloudflare didn't answer in time, answered with a 5xx or a
 * 429 (it's limiting its own service), sent something that isn't JSON, or said internal-error. Then the sign-in's own
 * limits are what hold, rather than nobody being able to sign in. */
export type TurnstileResult = "ok" | "failed" | "unreachable";
export interface TurnstileCheck { result: TurnstileResult; detail: string }

export interface TurnstilePort {
	/** `hostname`: the address the page was on, which the token must have been made on (any, on localhost). */
	verify(token: string, ip: string, hostname: string): Promise<TurnstileCheck>;
}

interface Answer { success?: boolean; hostname?: string; action?: string; "error-codes"?: string[] }

export function createTurnstile(o: { secret: string; fetch?: typeof fetch }): TurnstilePort {
	const call = o.fetch ?? fetch;
	const unreachable = (detail: string): TurnstileCheck => ({ result: "unreachable", detail });
	const failed = (detail: string): TurnstileCheck => ({ result: "failed", detail });
	return {
		async verify(token, ip, hostname) {
			if (!token) return failed("no token");
			if (token.length > MAX_TOKEN) return failed(`a token over ${MAX_TOKEN} characters`);
			let res: Response;
			try {
				res = await call(VERIFY, { method: "POST", body: new URLSearchParams({ secret: o.secret, response: token, remoteip: ip }), signal: AbortSignal.timeout(TIMEOUT_MS) });
			} catch (err) {
				return unreachable(String(err));
			}
			// A 4xx is Cloudflare refusing what was sent, so the token isn't taken; only its own trouble lets the sign-in go on.
			if (res.status >= 400 && res.status < 500 && res.status !== 429) return failed(`HTTP ${res.status}`);
			if (!res.ok) return unreachable(`HTTP ${res.status}`);
			const answer = await res.json().catch(() => null) as Answer | null;
			if (!answer) return unreachable("an answer that wasn't JSON");
			const codes = answer["error-codes"] ?? [];
			if (codes.includes("internal-error")) return unreachable("internal-error");
			if (!answer.success) return failed(codes.join(", ") || "not a person");
			if (answer.action !== TURNSTILE_ACTION) return failed(`made for "${answer.action ?? ""}"`);
			if (hostname !== "localhost" && answer.hostname !== hostname) return failed(`made on ${answer.hostname ?? "another site"}`);
			return { result: "ok", detail: "" };
		},
	};
}
