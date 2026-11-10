/**
 * A failure with a user-safe message and an HTTP status. Anything else becomes a 500. (Its fields are written out, not
 * `constructor(readonly …)`, so the browser suite can load the pages that use it with Node's type stripping.)
 */
export class HttpError extends Error {
	readonly status: number;
	readonly code: string;
	constructor(status: number, code: string, message: string, options?: { cause?: unknown }) {
		super(message, options);
		this.name = "HttpError";
		this.status = status;
		this.code = code;
	}
}

export const badRequest = (message: string, cause?: unknown) => new HttpError(400, "bad_request", message, { cause });
export const unauthenticated = (message: string, cause?: unknown) => new HttpError(401, "unauthenticated", message, { cause });
export const forbidden = (message = "You don't have access to this page.") => new HttpError(403, "forbidden", message);
export const notFound = (what: string) => new HttpError(404, "not_found", `${what} not found.`);
export const conflict = (message: string) => new HttpError(409, "conflict", message);
