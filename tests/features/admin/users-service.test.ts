import { describe, expect, it } from "vitest";
import { loadViewer } from "../../../src/auth/viewer.ts";
import { addToTeam, lockPerson, removeFromTeam, unlockPerson } from "../../../src/features/admin/users-service.ts";
import { MANAGER } from "../../helpers/app.ts";
import { createTestDeps } from "../../helpers/fakes.ts";
import { addMember, addTeam, G14_5 } from "../../helpers/two-teams.ts";

// What a site admin does from the Users page: lock someone (no sign-in, no team, every device signed out), unlock them,
// take them off a team (never a team's last team manager), and add someone to a team; each a line in the Log.

async function setup() {
	const deps = createTestDeps(new Date("2026-11-19T00:00:00Z"));
	await addTeam(deps.db);
	const steph = await addMember(deps.db, deps.team.id, "steph@example.com", "watcher", "Steph's mum");
	await addMember(deps.db, G14_5.id, "steph@example.com", "filmer", "Steph's mum");
	const boss = await addMember(deps.db, G14_5.id, "boss@example.com", "manager", "Boss");
	await deps.db.prepare("INSERT INTO sessions (id, email, created_at, expires_at) VALUES ('s1', 'steph@example.com', '2026-11-18T00:00:00Z', '2026-12-18T00:00:00Z')").run();
	return { deps, steph, boss };
}
const log = async (deps: ReturnType<typeof createTestDeps>) =>
	(await deps.db.prepare("SELECT admin_email, team_id, action, detail FROM admin_log ORDER BY id").all()).results;

describe("the Users page's actions", () => {
	it("locks someone out of every team at once: no sign-in, every device signed out, and a line in the Log", async () => {
		const { deps } = await setup();
		await lockPerson(deps, MANAGER, " Steph@Example.com ");
		expect((await loadViewer(deps.db, "steph@example.com", deps.now())).memberships).toEqual([]);
		expect(await deps.db.prepare("SELECT ended_at FROM sessions WHERE id = 's1'").first("ended_at")).toBe("2026-11-19T00:00:00.000Z");
		expect(await log(deps)).toEqual([{ admin_email: MANAGER, team_id: null, action: "user_locked", detail: "steph@example.com" }]);
		await expect(lockPerson(deps, MANAGER, "steph@example.com")).rejects.toThrow("steph@example.com is locked already.");
		await unlockPerson(deps, MANAGER, "steph@example.com");
		expect((await loadViewer(deps.db, "steph@example.com", deps.now())).memberships).toHaveLength(2);
		expect((await log(deps)).at(-1)).toMatchObject({ action: "user_unlocked", detail: "steph@example.com" });
		await expect(unlockPerson(deps, MANAGER, "steph@example.com")).rejects.toThrow("isn't locked");
	});

	it("never locks yourself, a site admin, or someone on no team", async () => {
		const { deps } = await setup();
		await expect(lockPerson(deps, MANAGER, MANAGER)).rejects.toThrow("You can't lock yourself.");
		await deps.db.prepare("INSERT INTO admins (email, added_by, added_at) VALUES ('boss@example.com', 'x', 'x')").run();
		await expect(lockPerson(deps, MANAGER, "boss@example.com")).rejects.toThrow("boss@example.com is a site admin: remove them as an admin first.");
		await expect(lockPerson(deps, MANAGER, "nobody@example.com")).rejects.toThrow("Person not found");
		expect(await log(deps)).toEqual([]);
	});

	it("takes someone off one team, keeping their others; never a team's last team manager", async () => {
		const { deps, steph, boss } = await setup();
		await expect(removeFromTeam(deps, MANAGER, G14_5.id, boss)).rejects.toThrow("Boss (boss@example.com) is the team's last team manager: make someone else team manager first.");
		await removeFromTeam(deps, MANAGER, deps.team.id, steph);
		expect((await loadViewer(deps.db, "steph@example.com", deps.now())).memberships.map((m) => m.team.id)).toEqual([G14_5.id]);
		expect(await log(deps)).toEqual([{ admin_email: MANAGER, team_id: deps.team.id, action: "member_removed", detail: "Steph's mum (steph@example.com), watch only" }]);
		await expect(removeFromTeam(deps, MANAGER, G14_5.id, steph)).rejects.toThrow("Person not found");
	});

	it("adds someone to a running team with a role, and refuses a team whose season is over", async () => {
		const { deps } = await setup();
		await addToTeam(deps, MANAGER, { email: "Magic@Example.com", name: "Magic", teamId: G14_5.id, role: "coach" });
		expect((await loadViewer(deps.db, "magic@example.com", deps.now())).memberships.map((m) => [m.team.id, m.member.role])).toEqual([[G14_5.id, "coach"]]);
		expect(await log(deps)).toEqual([{ admin_email: MANAGER, team_id: G14_5.id, action: "member_added", detail: "Magic (magic@example.com) as coach" }]);
		// Already there just as asked (a second tap) is done; as anything else, refused.
		expect(await addToTeam(deps, MANAGER, { email: "magic@example.com", name: "", teamId: G14_5.id, role: "coach" })).toEqual({ locked: false });
		await expect(addToTeam(deps, MANAGER, { email: "magic@example.com", name: "", teamId: G14_5.id, role: "watcher" })).rejects.toThrow("already on the list");
		expect(await log(deps)).toHaveLength(1);
		// Adding someone locked keeps them locked, and says so.
		await lockPerson(deps, MANAGER, "steph@example.com");
		await deps.db.prepare("UPDATE members SET removed_at = 'x' WHERE email = 'steph@example.com' AND team_id = ?").bind(G14_5.id).run();
		expect(await addToTeam(deps, MANAGER, { email: "steph@example.com", name: "", teamId: G14_5.id, role: "coach" })).toEqual({ locked: true });
		expect(await addToTeam(deps, MANAGER, { email: "bird@example.com", name: "", teamId: G14_5.id, role: "coach" })).toEqual({ locked: false });
		await deps.db.prepare("UPDATE teams SET status = 'closed' WHERE id = ?").bind(G14_5.id).run();
		await expect(addToTeam(deps, MANAGER, { email: "bird@example.com", name: "", teamId: G14_5.id, role: "watcher" })).rejects.toThrow("That team's season is over");
		await expect(addToTeam(deps, MANAGER, { email: "bird@example.com", name: "", teamId: "nope", role: "watcher" })).rejects.toThrow("Team not found");
	});
});
