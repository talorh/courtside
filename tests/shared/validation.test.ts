import { describe, expect, it } from "vitest";
import { z } from "zod";
import { HttpError } from "../../src/app/errors.ts";
import { assertChanged } from "../../src/shared/d1.ts";
import { idParam, MAX_BODY_BYTES, parseForm, parseJson } from "../../src/shared/validation.ts";

const schema = z.object({ name: z.string().min(1) });
const post = (body: BodyInit) => new Request("https://x.test/", { method: "POST", body });
/** A body sent in 64 KB chunks up to `bytes`, as a page could with no Content-Length; `pulled()`: how much was read. */
function streamed(bytes: number, headers: Record<string, string>) {
	let sent = 0;
	const body = new ReadableStream({ pull(c) { if (sent >= bytes) return c.close(); sent += 65_536; c.enqueue(new Uint8Array(65_536).fill(32)); } });
	return { req: new Request("https://x.test/", { method: "POST", headers, body, duplex: "half" } as RequestInit), pulled: () => sent };
}

describe("validation", () => {
	it("parses a valid form", async () => {
		expect(await parseForm(post(new URLSearchParams({ name: "Jo" })), schema)).toEqual({ name: "Jo" });
	});
	it("throws a 400 HttpError naming the bad field", async () => {
		const err = await parseForm(post(new URLSearchParams({ name: "" })), schema).catch((e) => e);
		expect(err).toBeInstanceOf(HttpError);
		expect(err.status).toBe(400);
		expect(err.message).toMatch(/name/);
	});
	it("a form address sent something that isn't a form is a 400, not an error page", async () => {
		const json = new Request("https://x.test/", { method: "POST", body: "{}", headers: { "Content-Type": "application/json" } });
		await expect(parseForm(json, schema)).rejects.toMatchObject({ status: 400 });
	});
	it("rejects non-JSON bodies", async () => {
		await expect(parseJson(post("not json"), schema)).rejects.toMatchObject({ status: 400 });
	});
	it("parses JSON, with or without a Content-Length", async () => {
		expect(await parseJson(post(JSON.stringify({ name: "Jo" })), schema)).toEqual({ name: "Jo" });
		const sized = new Request("https://x.test/", { method: "POST", body: '{"name":"Jo"}', headers: { "Content-Length": "13" } });
		expect(await parseJson(sized, schema)).toEqual({ name: "Jo" });
	});
	it("refuses JSON bigger than any page sends (413) by its Content-Length, before reading any of it", async () => {
		const { req, pulled } = streamed(6_000_000, { "Content-Type": "application/json", "Content-Length": String(MAX_BODY_BYTES + 1) });
		await expect(parseJson(req, schema)).rejects.toMatchObject({ status: 413, code: "too_big" });
		expect(pulled()).toBeLessThanOrEqual(65_536);
	});
	it("with no Content-Length, or a wrong one, reads JSON only up to the cap, then refuses it (413)", async () => {
		for (const headers of [{}, { "Content-Length": "12" }, { "Content-Length": "lots" }] as Array<Record<string, string>>) {
			const { req, pulled } = streamed(6_000_000, { "Content-Type": "application/json", ...headers });
			await expect(parseJson(req, schema)).rejects.toMatchObject({ status: 413, code: "too_big" });
			expect(pulled()).toBeLessThan(MAX_BODY_BYTES + 4 * 65_536);
		}
	});
	it("still reads the biggest JSON a page sends: a long recording's Complete, every part's number and etag", async () => {
		const parts = Array.from({ length: 10_000 }, (_, i) => ({ partNumber: i + 1, etag: `"${"0123456789abcdef".repeat(2)}"` }));
		const list = z.object({ parts: z.array(z.object({ partNumber: z.number(), etag: z.string() })) });
		expect((await parseJson(post(JSON.stringify({ parts })), list)).parts).toHaveLength(10_000);
	});
	it("refuses a form bigger than any page sends (413), signed in or not, by its Content-Length or by counting", async () => {
		const sized = streamed(6_000_000, { "Content-Type": "application/x-www-form-urlencoded", "Content-Length": String(MAX_BODY_BYTES + 1) });
		await expect(parseForm(sized.req, schema)).rejects.toMatchObject({ status: 413, code: "too_big" });
		const counted = streamed(6_000_000, { "Content-Type": "application/x-www-form-urlencoded" });
		await expect(parseForm(counted.req, schema)).rejects.toMatchObject({ status: 413, code: "too_big" });
		expect(counted.pulled()).toBeLessThan(MAX_BODY_BYTES + 4 * 65_536);
	});
	it("parses ids or throws 404", () => {
		expect(idParam("12", "Game")).toBe(12);
		expect(() => idParam("abc", "Game")).toThrow(/Game not found/);
		expect(() => idParam("0", "Game")).toThrow(HttpError);
	});
	it("assertChanged throws unless exactly one row changed", () => {
		expect(() => assertChanged({ meta: { changes: 0 } } as unknown as D1Result, "member")).toThrow(/member/);
		expect(() => assertChanged({ meta: { changes: 1 } } as unknown as D1Result, "member")).not.toThrow();
	});
});
