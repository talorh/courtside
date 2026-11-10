import type { z } from "zod";
import { badRequest, notFound } from "../app/errors.ts";

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
	let form: FormData;
	try {
		form = await req.formData();
	} catch (err) {
		throw badRequest("Please send the form from the page.", err);
	}
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
	let body: unknown;
	try {
		body = await req.json();
	} catch (err) {
		throw badRequest("Request body must be JSON.", err);
	}
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
