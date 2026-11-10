import { describe, expect, it } from "vitest";
import { z } from "zod";
import { HttpError } from "../../src/app/errors.ts";
import { assertChanged } from "../../src/shared/d1.ts";
import { idParam, parseForm, parseJson } from "../../src/shared/validation.ts";

const schema = z.object({ name: z.string().min(1) });
const post = (body: BodyInit) => new Request("https://x.test/", { method: "POST", body });

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
