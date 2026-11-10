// A request that failed: signed out goes to the sign-in page; anything else gets its error page (or JSON for a page
// script). A server error (5xx) is counted for Platform's alert and is a problem in the admin Log, with who was asking
// and from which device, after the response has gone.
import { clearedSessionCookie } from "../auth/session.ts";
import { logProblem } from "../features/admin/problem-log.ts";
import { countServerError } from "../features/admin/server-errors-repository.ts";
import { signInPath } from "../features/signin/signin-routes.ts";
import { errorPage } from "../ui/status-pages.ts";
import { afterwards, type AppDeps } from "./deps.ts";
import { HttpError } from "./errors.ts";
import type { Found } from "./handle-request.ts";
import { htmlResponse, jsonError, redirect } from "./respond.ts";

export async function failedResponse(req: Request, url: URL, deps: AppDeps, err: unknown, found: Found): Promise<Response> {
	const api = url.pathname.startsWith("/api/");
	// Signed out (no session, or one that's over): a page goes to the sign-in page, which comes back here after the
	// code; a page script's call gets 401 JSON, which it shows as its own sign-in note.
	if (!api && err instanceof HttpError && err.status === 401 && (req.method === "GET" || req.method === "HEAD")) {
		found.setCookies = [clearedSessionCookie()];
		return redirect(signInPath(url), 303);
	}
	const response = errorResponse(err, api, found.teamId);
	if (response.status >= 500) {
		await afterwards(deps, countServerError(deps.db, deps.now()).catch((e: unknown) => console.error(JSON.stringify({ event: "server_error_count_failed", teamId: found.teamId, error: String(e) }))));
		await afterwards(deps, logProblem(deps, {
			kind: "server_error", teamId: found.teamId, who: found.email ?? "", what: `${req.method} ${url.pathname} failed (${response.status})`, error: err,
		}));
	}
	return response;
}

function errorResponse(err: unknown, isApi: boolean, teamId: string | null): Response {
	const known = err instanceof HttpError;
	if (!known || err.status >= 500) {
		console.error(JSON.stringify({ event: "request_error", teamId, error: String(err), stack: err instanceof Error ? err.stack : undefined }));
	}
	const status = known ? err.status : 500;
	const message = known ? err.message : "Something went wrong. Please try again.";
	return isApi ? jsonError(status, known ? err.code : "internal", message) : htmlResponse(errorPage(status, message), status);
}
