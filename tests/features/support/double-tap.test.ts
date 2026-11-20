import { afterEach, describe, expect, it, vi } from "vitest";
import { form, makeClient } from "../../helpers/app.ts";
import { createTestDeps, type TestDeps } from "../../helpers/fakes.ts";
import { addMember, addTeam, G14_5 } from "../../helpers/two-teams.ts";

// A second tap sends the same form again, often before the first has answered. The same thing from the same person
// within a minute answers as done, as the first did, and adds no second ticket, reply, email or Log line.

afterEach(() => vi.restoreAllMocks());

const JANE = "jane@example.com";
const ASK = { topic: "videos", message: "A parent's upload stops at 80% every time.", contact: JANE };
const MINUTE = 60_000;

async function setup() {
	const deps = createTestDeps();
	await addTeam(deps.db, G14_5);
	await addMember(deps.db, G14_5.id, JANE, "manager", "Jane Citizen");
	return deps;
}
const jane = (deps: TestDeps) => makeClient(deps, { email: JANE, team: G14_5.id });
const later = (deps: TestDeps, ms: number) => { const at = new Date(deps.now().getTime() + ms); deps.now = () => at; };
const count = async (deps: TestDeps, sql: string) => deps.db.prepare(`SELECT COUNT(*) AS n FROM ${sql}`).first<number>("n");
const twice = async (send: () => Promise<Response>) => (await Promise.all([send(), send()])).map((r) => [r.status, r.headers.get("Location")]);

describe("a double tap", () => {
	it("on Support's Send makes one ticket and one email, and both taps land on it", async () => {
		const deps = await setup();
		expect(await twice(() => jane(deps)("/support", form(ASK)))).toEqual([[303, "/support/1?done=sent"], [303, "/support/1?done=sent"]]);
		expect(await jane(deps)("/support", form(ASK)).then((r) => r.headers.get("Location"))).toBe("/support/1?done=sent");
		expect(await count(deps, "support_requests")).toBe(1);
		expect(deps.email.sent).toHaveLength(1);
		// The same words a minute later, or different words, are a new ticket.
		await jane(deps)("/support", form({ ...ASK, message: "And another thing." }));
		later(deps, MINUTE);
		await jane(deps)("/support", form(ASK));
		expect(await count(deps, "support_requests")).toBe(3);
	});

	it("on a team manager's reply saves it and emails it once", async () => {
		const deps = await setup();
		await jane(deps)("/support", form(ASK));
		deps.email.sent.length = 0;
		expect(await twice(() => jane(deps)("/support/1/reply", form({ body: "It's on Wi-Fi." })))).toEqual([[303, "/support/1?done=replied"], [303, "/support/1?done=replied"]]);
		expect(await count(deps, "support_messages WHERE kind = 'reply'")).toBe(1);
		expect(deps.email.sent).toHaveLength(1);
	});

	it("on an admin's reply saves it, emails it and logs it once", async () => {
		const deps = await setup();
		await jane(deps)("/support", form(ASK));
		deps.email.sent.length = 0;
		const reply = () => makeClient(deps)("/admin/support/1/message", form({ body: "Is it on Wi-Fi?", then: "resolve" }));
		expect(await twice(reply)).toEqual([[303, "/admin/support/1?done=sent"], [303, "/admin/support/1?done=sent"]]);
		expect(await count(deps, "support_messages WHERE kind = 'reply'")).toBe(1);
		expect(deps.email.sent).toHaveLength(1);
		expect(await count(deps, "admin_log WHERE action IN ('support_replied', 'support_status')")).toBe(2);
		// A note isn't a reply: the same words as a note are saved too, once.
		await makeClient(deps)("/admin/support/1/message", form({ body: "Is it on Wi-Fi?", then: "note" }));
		await makeClient(deps)("/admin/support/1/message", form({ body: "Is it on Wi-Fi?", then: "note" }));
		expect(await count(deps, "support_messages WHERE kind = 'note'")).toBe(1);
	});

	it("a reply, then the same words with Reply and resolve: sent once, and the ticket is resolved", async () => {
		const deps = await setup();
		await jane(deps)("/support", form(ASK));
		deps.email.sent.length = 0;
		await makeClient(deps)("/admin/support/1/message", form({ body: "All sorted now.", then: "reply" }));
		await makeClient(deps)("/admin/support/1/message", form({ body: "All sorted now.", then: "resolve" }));
		expect(await count(deps, "support_messages WHERE kind = 'reply'")).toBe(1);
		expect(deps.email.sent).toHaveLength(1);
		expect(await count(deps, "support_requests WHERE id = 1 AND status = 'resolved'")).toBe(1);
		expect(await count(deps, "admin_log WHERE action = 'support_status'")).toBe(1);
	});

	it("on Email it again sends the welcome once, and it can be sent again a minute later", async () => {
		const deps = await setup();
		const again = () => makeClient(deps)(`/admin/teams/${G14_5.id}/welcome`, form({}));
		const sent = `/admin/teams/${G14_5.id}/welcome?emailed=sent`;
		expect(await twice(again)).toEqual([[303, sent], [303, sent]]);
		expect(deps.email.sent).toHaveLength(1);
		later(deps, MINUTE);
		await again();
		expect(deps.email.sent).toHaveLength(2);
	});

	it("on Add a person adds them once, logs it once, and both taps say added", async () => {
		const deps = createTestDeps();
		const add = () => makeClient(deps)("/members", form({ email: "sam@x.com", name: "Sam", role: "filmer" }));
		expect(await twice(add)).toEqual([[303, "/manage?done=added#people"], [303, "/manage?done=added#people"]]);
		expect(await count(deps, "members WHERE email = 'sam@x.com'")).toBe(1);
		expect(await count(deps, "admin_log WHERE action = 'member_added'")).toBe(1);
		// Someone already there with another role is still refused: Add a person never changes anyone.
		const other = await makeClient(deps)("/members", form({ email: "sam@x.com", name: "Sam", role: "coach" }));
		expect(other.status).toBe(409);
	});

	it("on the Users page's Add someone adds them once, and both taps say added", async () => {
		const deps = await setup();
		const add = () => makeClient(deps)("/admin/users", form({ email: "magic@example.com", name: "Magic", team: G14_5.id, role: "coach" }));
		expect(await twice(add)).toEqual([[303, "/admin/users?done=added"], [303, "/admin/users?done=added"]]);
		expect(await count(deps, "admin_log WHERE action = 'member_added'")).toBe(1);
	});
});
