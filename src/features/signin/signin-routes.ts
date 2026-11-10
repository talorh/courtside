// The sign-in's own pages, answered before anyone is signed in: /signin (the email, then the code),
// /signout, and /signin/whoami (the maintenance Worker asks it who a request is). Everything else needs a session.
import { z } from "zod";
import type { AppDeps } from "../../app/deps.ts";
import { sitePath } from "../../app/landing.ts";
import { htmlResponse, jsonError, jsonOk, redirect } from "../../app/respond.ts";
import { currentSession, clearedSessionCookie, endRequestSession, sessionCookie } from "../../auth/session.ts";
import { recordSignInEvent } from "../../auth/sign-in-codes-repository.ts";
import { maskEmail, requestCode, verifyCode } from "../../auth/sign-in-service.ts";
import { deviceLabel } from "../../shared/device.ts";
import { logProblem } from "../admin/problem-log.ts";
import { parseForm } from "../../shared/validation.ts";
import { signedOutPage, signInPage, type SignInMessage, signOutPage } from "./views/signin-page.ts";

const emailForm = z.object({ email: z.string().trim().max(254).default(""), next: z.string().max(2000).default("/") });
// The Turnstile widget's token (views/signin-page.ts), on the forms that send a code.
const askForm = emailForm.extend({ "cf-turnstile-response": z.string().max(4096).default("") });
const codeForm = emailForm.extend({ code: z.string().trim().max(10).default("") });

/** Where the person came from (Cloudflare's header), for the limits; the whole request's IP, never a header a page sets. */
const ipOf = (req: Request) => req.headers.get("CF-Connecting-IP") ?? "";

/** The sign-in page for a path someone wanted while signed out. */
export const signInPath = (url: URL) => `/signin?next=${encodeURIComponent(url.pathname + url.search)}`;

const page = (deps: AppDeps, step: "email" | "code", email: string, next: string, message: SignInMessage | null, status = 200) =>
	htmlResponse(signInPage({ step, email, next: sitePath(next), message, siteKey: deps.config.turnstileSiteKey }), status);

async function sendCode(req: Request, url: URL, deps: AppDeps): Promise<Response> {
	const { email, next, "cf-turnstile-response": token } = await parseForm(req, askForm);
	// A person, not a script, before any email goes. Cloudflare not answering mustn't stop everyone signing in: then the
	// limits (auth/sign-in-limits.ts) are what hold, and it's logged.
	const check = await deps.turnstile.verify(token, ipOf(req), url.hostname);
	if (check.result === "failed") {
		console.log(JSON.stringify({ event: "signin_refused", teamId: null, email: maskEmail(email), why: "turnstile", detail: check.detail }));
		await recordSignInEvent(deps.db, { kind: "robot", email: email.trim().toLowerCase(), ip: ipOf(req), at: deps.now().toISOString(), device: deps.device });
		return page(deps, "email", email, next, "robot", 400);
	}
	if (check.result === "unreachable") {
		console.warn(JSON.stringify({ event: "turnstile_unreachable", teamId: null, detail: check.detail }));
		await logProblem(deps, { kind: "site_problem", teamId: null, who: email.trim().toLowerCase(), what: "The sign-in page's robot check (Turnstile) didn't answer, so only the limits held", detail: check.detail });
	}
	let result: Awaited<ReturnType<typeof requestCode>>;
	try {
		result = await requestCode(deps, email, ipOf(req));
	} catch (err) {
		// The email didn't go (Email Sending down, say): logged with the cause, and the page says to try again.
		console.error(JSON.stringify({ event: "signin_email_failed", teamId: null, error: String(err) }));
		await logProblem(deps, { kind: "email_failed", teamId: null, who: email.trim().toLowerCase(), what: "A sign-in code's email didn't send", error: err });
		return page(deps, "email", email, next, "notSent", 502);
	}
	if (result === "sent") return page(deps, "code", email.trim().toLowerCase(), next, null);
	// An unknown address is an ordinary answer (200); over a limit is 429, as the zone's own limits answer.
	return page(deps, "email", email, next, result === "unknown" ? "unknown" : "limited", result === "unknown" ? 200 : 429);
}

async function checkCode(req: Request, deps: AppDeps): Promise<Response> {
	const { email, next, code } = await parseForm(req, codeForm);
	const result = await verifyCode(deps, email, code, ipOf(req), deviceLabel(req.headers.get("User-Agent")));
	if (result === "wrong") return page(deps, "code", email, next, "wrong", 400);
	if (result === "expired") return page(deps, "code", email, next, "expired", 400);
	if (result === "limited") return page(deps, "code", email, next, "wrongLimited", 429);
	if (result === "held") return page(deps, "code", email, next, "wrongHeld", 429);
	const res = redirect(sitePath(next), 303);
	res.headers.append("Set-Cookie", sessionCookie(result.token));
	return res;
}

async function signOut(req: Request, deps: AppDeps): Promise<Response> {
	await endRequestSession(deps.db, req, deps.now());
	// The door's script (public/signout.js) stays on its page and shows Signed out itself; a plain form gets the page.
	const res = req.headers.get("Accept")?.includes("application/json") ? jsonOk({ signedOut: true }) : htmlResponse(signedOutPage());
	res.headers.append("Set-Cookie", clearedSessionCookie());
	return res;
}

/** The pages that need no sign-in; null for any other address. The same-origin check on posts has already run. */
export async function signInRoutes(req: Request, url: URL, deps: AppDeps): Promise<Response | null> {
	const get = req.method === "GET" || req.method === "HEAD", post = req.method === "POST";
	switch (url.pathname) {
		case "/signin":
			if (get) {
				// Already signed in: straight on to the page they wanted, not a second code.
				if (await currentSession(deps.db, req, deps.now())) return redirect(sitePath(url.searchParams.get("next")), 303);
				return page(deps, "email", "", url.searchParams.get("next") ?? "/", null);
			}
			return post ? sendCode(req, url, deps) : null;
		case "/signin/code": return post ? checkCode(req, deps) : null;
		case "/signout": return post ? signOut(req, deps) : get ? htmlResponse(signOutPage()) : null;
		case "/signin/whoami": {
			if (!get) return null;
			const session = await currentSession(deps.db, req, deps.now());
			return session ? jsonOk({ email: session.email.toLowerCase() }) : jsonError(401, "unauthenticated", "Not signed in.");
		}
		default: return null;
	}
}
