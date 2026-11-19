import { describe, expect, it } from "vitest";
import { requestCode, verifyCode } from "../../../src/auth/sign-in-service.ts";
import { loadViewer } from "../../../src/auth/viewer.ts";
import { lockPerson, unlockPerson } from "../../../src/features/admin/users-service.ts";
import { requestAccess } from "../../../src/features/signin/access-service.ts";
import { makeClient, MANAGER } from "../../helpers/app.ts";
import { createTestDeps, type TestDeps } from "../../helpers/fakes.ts";
import { addMember } from "../../helpers/two-teams.ts";

// A locked person gets nothing anywhere: no page with a live session, no session from a code sent as they were being
// locked, no admin, no Request access ticket; and their codes go when they're locked.

const STEPH = "steph@example.com";
async function setup(): Promise<TestDeps> {
	const deps = createTestDeps(new Date("2026-11-19T00:00:00Z"));
	await addMember(deps.db, deps.team.id, STEPH, "watcher", "Steph's mum");
	return deps;
}
const code = (deps: TestDeps) => /code is (\d{3}) (\d{3})/.exec(deps.email.sent.at(-1)?.subject ?? "")!.slice(1).join("");

describe("a locked person", () => {
	it("has every code waiting voided, and no session from a code sent just before the lock", async () => {
		const deps = await setup();
		await requestCode(deps, STEPH, "1.2.3.4");
		const sent = code(deps);
		await lockPerson(deps, MANAGER, STEPH);
		expect(await deps.db.prepare("SELECT COUNT(*) AS n FROM sign_in_codes WHERE email = ? AND voided_at IS NULL").bind(STEPH).first("n")).toBe(0);
		// A code that slipped through as the lock landed signs nobody in.
		await deps.db.prepare("UPDATE sign_in_codes SET voided_at = NULL WHERE email = ?").bind(STEPH).run();
		expect(await verifyCode(deps, STEPH, sent, "1.2.3.4", "x")).toBe("expired");
		expect(await deps.db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE email = ?").bind(STEPH).first("n")).toBe(0);
	});

	it("opens nothing even with a session still live, and is no admin while locked", async () => {
		const deps = await setup();
		await lockPerson(deps, MANAGER, STEPH);
		expect((await makeClient(deps, STEPH)("/")).status).not.toBe(200);
		await deps.db.prepare("INSERT INTO admins (email, added_by, added_at) VALUES (?, 'x', 'x')").bind(STEPH).run();
		expect(await loadViewer(deps.db, STEPH, deps.now())).toEqual({ email: STEPH, isAdmin: false, memberships: [] });
		expect((await makeClient(deps, STEPH)("/admin")).status).toBe(404);
	});

	it("gets the same answer from Request access as anyone, and no ticket", async () => {
		const deps = await setup();
		await lockPerson(deps, MANAGER, STEPH);
		expect(await requestAccess(deps, { name: "Steph's mum", team: "B12.1", email: STEPH, "cf-turnstile-response": "ok" }, "1.2.3.4")).toBe("sent");
		expect(await deps.db.prepare("SELECT COUNT(*) AS n FROM support_requests").first("n")).toBe(0);
		await unlockPerson(deps, MANAGER, STEPH);
		expect(await requestAccess(deps, { name: "Steph's mum", team: "B12.1", email: STEPH, "cf-turnstile-response": "ok" }, "1.2.3.4")).toBe("onList");
	});
});
