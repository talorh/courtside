import { describe, expect, it } from "vitest";
import { recordSignInEvent } from "../../../src/auth/sign-in-codes-repository.ts";
import { makeClient } from "../../helpers/app.ts";
import { createTestDeps } from "../../helpers/fakes.ts";

// The Log's filters are in the address: a name every object has (constructor, toString) is no show or event, so the
// Log shows everything rather than nothing.
describe("the admin Log's filters from the address", () => {
	it.each(["show=all", "show=constructor", "event=constructor", "event=toString", "show=__proto__", "event=hasOwnProperty"])("treats ?%s as no filter", async (query) => {
		const deps = createTestDeps();
		await recordSignInEvent(deps.db, { kind: "signed_in", email: "kd@x.com", ip: "203.0.113.9", at: deps.now().toISOString() });
		const res = await makeClient(deps)(`/admin/log?${query}`);
		expect(res.status).toBe(200);
		expect(await res.text()).toContain("kd@x.com");
	});
});
