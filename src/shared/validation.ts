import type { z } from "zod";
import { badRequest, HttpError, notFound } from "../app/errors.ts";

/** The most a page sends in one form or JSON body (2 MB): well above the biggest, a fixture spreadsheet (300 KB and the
 * form round it), its preview's games (100,000 characters, form-encoded) or a long recording's Complete (10,000 parts'
 * numbers and etags, about 600 KB). The routes' own, smaller limits still give their own words. */
export const MAX_BODY_BYTES = 2_000_000;

export const bodyTooBig = () => new HttpError(413, "too_big", "That's too big to send. Choose a smaller file.");

/** The whole body, or `refuse()` once it's past `max`: a body sent in chunks has no Content-Length to check first, and
 * one that's wrong is no guide. */
export async function readUpTo(req: Request, max: number, refuse: () => HttpError = bodyTooBig): Promise<Uint8Array> {
	if (!req.body) return new Uint8Array();
	const reader = req.body.getReader();
	const chunks: Uint8Array[] = [];
	let size = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		size += value.byteLength;
		// No more is read, so no more arrives. Not cancelled: a copy's cancel waits for the original's, which nothing reads.
		if (size > max) throw refuse();
		chunks.push(value);
	}
	const bytes = new Uint8Array(size);
	chunks.reduce((at, c) => (bytes.set(c, at), at + c.byteLength), 0);
	return bytes;
}

/** A body read as `read` reads it, refused (413) by its Content-Length before any of it is read, or once more than the
 * cap has been; any other failure to read or parse it is `bad`'s 400. */
async function readCapped<T>(req: Request, read: (body: Response) => Promise<T>, bad: (err: unknown) => HttpError): Promise<T> {
	if (Number(req.headers.get("Content-Length") ?? 0) > MAX_BODY_BYTES) throw bodyTooBig();
	try {
		const bytes = await readUpTo(req, MAX_BODY_BYTES);
		return await read(new Response(bytes, { headers: { "Content-Type": req.headers.get("Content-Type") ?? "" } }));
	} catch (err) {
		if (err instanceof HttpError) throw err;
		throw bad(err);
	}
}

function parseWith<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
	const result = schema.safeParse(data);
	if (!result.success) {
		const detail = result.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ");
		throw badRequest(`Please check the form. ${detail}`);
	}
	return result.data;
}

/** `lists`: fields a form can send several times (ticked checkboxes), always read as an array. */
export async function parseForm<T extends z.ZodType>(req: Request, schema: T, lists: string[] = []): Promise<z.infer<T>> {
	const form = await readCapped(req, (body) => body.formData(), (err) => badRequest("Please send the form from the page.", err));
	const data: Record<string, string | string[]> = Object.fromEntries(lists.map((key) => [key, []]));
	for (const [key, value] of form) {
		if (typeof value !== "string") continue;
		const list = data[key];
		if (Array.isArray(list)) list.push(value);
		else data[key] = value;
	}
	return parseWith(schema, data);
}

/** A delete's "are you sure" (ui/confirm.ts): its form says confirm=yes, or nothing happens. Read from a copy, so the
 * handler still gets the form. */
export async function requireConfirm(req: Request): Promise<void> {
	const form = await req.clone().formData().catch(() => null);
	if (form?.get("confirm") !== "yes") throw badRequest("Tap Yes to confirm.");
}

export async function parseJson<T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T>> {
	const body: unknown = await readCapped(req, (b) => b.json(), (err) => badRequest("Request body must be JSON.", err));
	return parseWith(schema, body);
}

/** Route ids are positive integers; anything else is treated as a missing record. */
export function idParam(value: string | undefined, what: string): number {
	const id = Number(value);
	if (!Number.isInteger(id) || id <= 0) throw notFound(what);
	return id;
}

/** The message for the change just made (`?done=` in the address), or null: only the table's own keys count, so a name
 * every object has (constructor, toString) is no message. */
export function doneMessage<T>(messages: Record<string, T>, url: URL): T | null {
	const done = url.searchParams.get("done") ?? "";
	return Object.hasOwn(messages, done) ? messages[done] ?? null : null;
}
