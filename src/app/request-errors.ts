// A request that failed: signed out goes to the sign-in page; anything else gets its error page (or JSON for a page
// script). A server error (5xx) is counted for Platform's alert and is a problem in the admin Log, with who was asking
// and from which device, after the response has gone. In the Worker's logs, a server error is a request_error line and
// a refusal (403, 409 and the like) a request_refused one, each saying what was asked, by which member and its Ray ID,
// which the error page shows as a reference to quote.
import { clearedSessionCookie } from "../auth/session.ts";
import { logProblem } from "../features/admin/problem-log.ts";
import { countServerError } from "../features/admin/server-errors-repository.ts";
import { signInPath } from "../features/signin/signin-routes.ts";
import { errorPage } from "../ui/status-pages.ts";
import { afterwards, type AppDeps } from "./deps.ts";
import { HttpError } from "./errors.ts";
import type { Found } from "./handle-request.ts";
import { htmlResponse, jsonError, redirect } from "./respond.ts";

/** Page scripts' calls outside /api/: the admin Documentation's AI assistant (public/docs-ask.js) shows why from JSON. */
const SCRIPT_CALLS = new Set(["/admin/docs/ask"]);

export async function failedResponse(req: Request, url: URL, deps: AppDeps, err: unknown, found: Found): Promise<Response> {
	const api = url.pathname.startsWith("/api/") || SCRIPT_CALLS.has(url.pathname);
	// Signed out (no session, or one that's over): a page goes to the sign-in page, which comes back here after the
	// code; a page script's call gets 401 JSON, which it shows as its own sign-in note.
	if (!api && err instanceof HttpError && err.status === 401 && (req.method === "GET" || req.method === "HEAD")) {
		found.setCookies = [clearedSessionCookie()];
		return redirect(signInPath(url), 303);
	}
	const ray = req.headers.get("cf-ray")?.split("-")[0] || null;
	logFailure(err, { teamId: found.teamId, memberId: found.memberId ?? null, method: req.method, path: url.pathname, ray }, found.email !== null);
	const response = errorResponse(err, api, ray);
	if (response.status >= 500) {
		await afterwards(deps, countServerError(deps.db, deps.now()).catch((e: unknown) => console.error(JSON.stringify({ event: "server_error_count_failed", teamId: found.teamId, error: String(e) }))));
		await afterwards(deps, logProblem(deps, {
			kind: "server_error", teamId: found.teamId, who: found.email ?? "", what: `${req.method} ${url.pathname} failed (${response.status})`, error: err,
		}));
	}
	return response;
}

interface Asked { teamId: string | null; memberId: number | null; method: string; path: string; ray: string | null }

function logFailure(err: unknown, asked: Asked, signedIn: boolean): void {
	const known = err instanceof HttpError;
	if (!known || err.status >= 500) {
		const cause = err instanceof Error && err.cause !== undefined ? String(err.cause) : undefined;
		console.error(JSON.stringify({
			event: "request_error", teamId: asked.teamId, memberId: asked.memberId, method: asked.method, path: asked.path, ray: asked.ray, status: known ? err.status : 500, code: known ? err.code : "internal", error: String(err), cause,
			stack: err instanceof Error ? err.stack : undefined,
		}));
		return;
	}
	// Signed out, a plain not found, and anything refused before the sign-in's looked at (a bot's post) are everyday:
	// only a signed-in person's other refusals are worth a line. Never the message: some name a person.
	if (!signedIn || err.status === 401 || (err.status === 404 && (asked.method === "GET" || asked.method === "HEAD"))) return;
	console.warn(JSON.stringify({ event: "request_refused", teamId: asked.teamId, memberId: asked.memberId, method: asked.method, path: asked.path, ray: asked.ray, status: err.status, code: err.code }));
}

function errorResponse(err: unknown, isApi: boolean, ray: string | null): Response {
	const known = err instanceof HttpError;
	const status = known ? err.status : 500;
	const message = known ? err.message : "Something went wrong. Please try again.";
	return isApi ? jsonError(status, known ? err.code : "internal", message) : htmlResponse(errorPage(status, message, ray), status);
}
