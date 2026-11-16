import { describe, expect, it } from "vitest";
import { insertSiteTicket } from "../../src/features/admin/support-desk-repository.ts";
import { makeClient } from "../helpers/app.ts";
import { createTestDeps } from "../helpers/fakes.ts";

// A page's message after a change comes from ?done= in its address: a name every object has (constructor, toString)
// is no message. Each page opens as itself (200), so its message is looked up.
const PAGES = ["/fixture", "/photos", "/manage", "/roster", "/support", "/admin/teams", "/admin/admins", "/admin/platform", "/admin/support/1"];
describe("?done= messages", () => {
	it.each(PAGES.flatMap((p) => ["constructor", "toString", "__proto__"].map((d) => [p, d])))("%s?done=%s shows no message", async (path, done) => {
		const deps = createTestDeps();
		await insertSiteTicket(deps.db, { alertKind: "test", title: "A ticket", message: "Something to look at.", nowIso: deps.now().toISOString() });
		const res = await makeClient(deps)(`${path}?done=${done}`);
		expect(res.status).toBe(200);
		expect(await res.text()).not.toMatch(/native code|\[object Object\]|function Object|undefined/);
	});
});
