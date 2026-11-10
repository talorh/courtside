import { describe, expect, it } from "vitest";
import { makeClient } from "../helpers/app.ts";
import { createTestDeps } from "../helpers/fakes.ts";

// A page's message after a change comes from ?done= in its address: a name every object has (constructor, toString)
// is no message.
const PAGES = ["/fixture", "/photos", "/members", "/roster", "/support", "/admin/teams", "/admin/admins", "/admin/platform", "/admin/support/1"];
describe("?done= messages", () => {
	it.each(PAGES.flatMap((p) => ["constructor", "toString", "__proto__"].map((d) => [p, d])))("%s?done=%s shows no message", async (path, done) => {
		const deps = createTestDeps();
		const res = await makeClient(deps)(`${path}?done=${done}`);
		expect(res.status).toBeLessThan(500);
		expect(await res.text()).not.toMatch(/native code|\[object Object\]|function Object|undefined/);
	});
});
