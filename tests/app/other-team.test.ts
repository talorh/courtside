import { describe, expect, it } from "vitest";
import { form, makeClient, MANAGER } from "../helpers/app.ts";
import { B12_1, createTestDeps } from "../helpers/fakes.ts";
import { addMember, addTeam, G14_5, seedTeam } from "../helpers/two-teams.ts";

/** B12.1 and G14.5, one of everything each; both@x.com is in both, p@x.com only in B12.1. */
async function setup() {
	const deps = createTestDeps();
	await addTeam(deps.db);
	await seedTeam(deps, B12_1, "b");
	const g = await seedTeam(deps, G14_5, "g");
	await addMember(deps.db, B12_1.id, "both@x.com", "filmer");
	await addMember(deps.db, G14_5.id, "both@x.com", "watcher");
	await addMember(deps.db, B12_1.id, "p@x.com", "watcher");
	return { deps, g };
}

describe("a link to another of your teams' things", () => {
	it("offers to switch to that team and open it, for someone in both teams", async () => {
		const { deps, g } = await setup();
		const res = await makeClient(deps, "both@x.com")(`/games/${g.gameId}`);
		expect(res.status).toBe(200);
		const page = await res.text();
		expect(page).toContain("This game is in Saints G14.5");
		expect(page).toContain(`<form method="post" action="/teams/switch"><input type="hidden" name="team" value="${G14_5.id}"><input type="hidden" name="next" value="/games/${g.gameId}">`);
		expect(page).toContain("Switch to Saints G14.5");
		// Nothing of the other team's but its name: no opponent, no venue.
		for (const secret of g.secrets) expect(page).not.toContain(secret);
	});

	it("does the same for its downloads and photos, and an admin gets the offer for any team", async () => {
		const { deps, g } = await setup();
		for (const [path, what] of [[`/videos/${g.videoId}/download/hd`, "video"], [`/clips/${g.clipId}/download`, "clip"], [`/photos/${g.photoId}`, "photo"], [`/photos/${g.photoId}/download`, "photo"]]) {
			for (const who of ["both@x.com", MANAGER]) {
				expect(await (await makeClient(deps, who)(path ?? "")).text(), `${who} ${path}`).toContain(`This ${what} is in Saints G14.5`);
			}
		}
	});

	it("answers a page script's download link with the same words in JSON", async () => {
		const { deps, g } = await setup();
		for (const path of [`/api/videos/${g.videoId}/download/hd`, `/api/clips/${g.clipId}/download`]) {
			const res = await makeClient(deps, "both@x.com")(path);
			expect(res.status).toBe(409);
			expect(await res.json()).toMatchObject({ ok: false, error: { code: "other_team" } });
		}
	});

	it("is the usual not found for someone only in this team, so nothing says it exists", async () => {
		const { deps, g } = await setup();
		for (const path of [`/games/${g.gameId}`, `/photos/${g.photoId}`, `/videos/${g.videoId}/download/hd`, `/api/clips/${g.clipId}/download`]) {
			const res = await makeClient(deps, "p@x.com")(path);
			expect(res.status, path).toBe(404);
			expect(await res.text()).not.toContain("G14.5");
		}
	});

	it("is not found for a deleted game, and for a write with another team's id (writes never switch)", async () => {
		const { deps, g } = await setup();
		await deps.db.prepare("UPDATE games SET deleted_at = '2026-10-28T00:00:00.000Z' WHERE id = ?").bind(g.gameId).run();
		expect((await makeClient(deps, "both@x.com")(`/games/${g.gameId}`)).status).toBe(404);
		const res = await makeClient(deps, "both@x.com")(`/photos/${g.photoId}/removal-requests`, form({ reason: "x" }));
		expect(res.status).toBe(404);
		expect(await deps.db.prepare("SELECT COUNT(*) AS n FROM photo_removal_requests WHERE team_id = ? AND member_id <> ?").bind(G14_5.id, g.members.watcher).first("n")).toBe(0);
	});
});
