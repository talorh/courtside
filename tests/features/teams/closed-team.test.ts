// A closed season is read-only: watching, downloads, removal requests and the team
// manager's deletions still work; nothing new can be added.
import { describe, expect, it } from "vitest";
import { ROLES } from "../../../src/auth/permissions.ts";
import { buildRouter } from "../../../src/app/routes.ts";
import { makeClient } from "../../helpers/app.ts";
import { B12_1 } from "../../helpers/fakes.ts";
import { addMember, addTeam, G14_5, teamSnapshot } from "../../helpers/two-teams.ts";
import { opens, ROUTES } from "../../isolation/route-table.ts";
import { twoTeams } from "../../isolation/setup.ts";

/** The writes a closed team still takes: asking for removals and deciding them, the team manager's deletes, a member's
 * own favourites and Hide scores, Ask, cancelling an upload, asking the site's admins for help, and letting someone
 * who asked for too many codes sign in (a closed team's people still sign in for its videos). Every other write is
 * refused. */
const ALLOWED = [
	"POST /videos/:id/removal-requests", "POST /clips/:id/removal-requests", "POST /photos/:id/removal-requests",
	"POST /removal-requests/:id/keep", "POST /clip-removal-requests/:id/keep", "POST /photo-removal-requests/:id/keep",
	"POST /games/:id/favourite", "POST /clips/:id/favourite", "POST /me/scores", "POST /api/ask", "POST /api/uploads/:id/abort", "POST /support", "POST /support/:id/reply",
	"POST /members/:id/sign-in",
	// The end-of-season pack's HD copies: it's for after the season, before the footage goes.
	"POST /season-pack/hd",
	// Every delete and remove (they ask first).
	"POST /fixture/:id/delete", "POST /fixture/:id/delete-all", "POST /videos/:id/delete", "POST /videos/:id/keep-first", "POST /removal-requests/:id/delete-video",
	"POST /clips/:id/delete", "POST /clip-removal-requests/:id/delete-clip", "POST /photos/:id/delete", "POST /photos/delete", "POST /photo-removal-requests/:id/delete-photo",
	"POST /members/:id/remove", "POST /players/:id/remove", "POST /roster/families/:id/remove", "POST /fixture/playhq/:id/remove", "POST /notes/:id/delete",
];

async function closedB12() {
	const t = await twoTeams(true);
	await t.deps.db.prepare("UPDATE teams SET status = 'closed', closed_at = '2026-10-14T00:00:00.000Z', delete_after = '2027-12-31T13:00:00.000Z' WHERE id = ?").bind(B12_1.id).run();
	return t;
}

describe("a closed season", () => {
	it("takes only the writes listed here (a new write route must be classified)", () => {
		const allowed = buildRouter().list().filter((r) => r.method === "POST" && r.closedTeams).map((r) => `${r.method} ${r.path}`);
		expect(allowed.sort()).toEqual([...ALLOWED].sort());
	});

	it.each(ROUTES.filter((r) => r.route.startsWith("POST ")).map((r, i) => [`${r.route} (${i})`, r] as const))("%s: refused with nothing changed, or allowed", async (_name, route) => {
		const { deps, a } = await closedB12();
		const client = makeClient(deps, { email: a.emails[route.as ?? "manager"], team: a.team.id });
		const before = await teamSnapshot(deps.db, a.team.id);
		const { path, init } = route.req(a, a);
		const res = await client(path, init);
		if (ALLOWED.includes(route.route)) {
			// Its own answer (a team manager deletes rather than asks, say), never the season being over.
			expect((await res.text()).replaceAll("&#39;", "'"), route.route).not.toContain("season is over");
		} else {
			expect(res.status, route.route).toBe(409);
			expect((await res.text()).replaceAll("&#39;", "'")).toContain("Saints B12.1's season is over, so its site is read-only.");
			expect(await teamSnapshot(deps.db, a.team.id), route.route).toBe(before);
		}
	});

	it("says so on every page, with until when its videos and photos stay, and offers someone's current team", async () => {
		const { deps, a } = await closedB12();
		await addTeam(deps.db, { ...G14_5, id: "b12.1-2027", code: "b12.1", seasonStart: 2027 });
		await addMember(deps.db, "b12.1-2027", a.emails.watcher, "watcher");
		for (const role of ROLES) {
			const client = makeClient(deps, { email: a.emails[role], team: a.team.id });
			for (const route of ROUTES.filter((r) => r.route.startsWith("GET ") && opens(role, r, buildRouter().list().find((x) => `${x.method} ${x.path}` === r.route)!.minRole))) {
				const res = await client(route.req(a, a).path);
				if (!res.headers.get("Content-Type")?.startsWith("text/html")) continue;
				const page = (await res.text()).replaceAll("&#39;", "'");
				expect(page, `${role} ${route.route}`).toContain("Saints B12.1's 2026/27 season is over.</b> Its videos and photos stay until 31 Dec 2027, then they're deleted.");
				expect(page.includes("Go to Saints B12.1 (2027/28)"), `${role} ${route.route}`).toBe(role === "watcher");
				// The controls that add (Help still explains them in words).
				const adds = ['action="/api/photos"', 'id="photo-files"', 'class="clipmaker"', 'action="/fixture"', 'action="/roster/generate"', 'action="/members"',
					'action="/players"', 'action="/roster/duties"', 'action="/roster/families"', 'class="big up"', 'class="big live"', ">Go live again<",
					'class="btn primary bigpick" href="/upload"', 'class="btn livebtn bigpick" href="/live"'];
				for (const add of adds) expect(page, `${role} ${route.route} offers ${add}`).not.toContain(add);
			}
		}
	});

	it("doesn't set up a live stream or fill the roster when their pages open; downloads still work", async () => {
		const { deps, a } = await closedB12();
		const manager = makeClient(deps, { email: a.emails.manager, team: a.team.id });
		await deps.db.prepare("INSERT INTO games (team_id, starts_at, competition) VALUES (?, '2026-10-16T18:40', 'VJBL')").bind(a.team.id).run();
		await deps.db.prepare("INSERT INTO roster_families (team_id, surname) VALUES (?, 'Smith'), (?, 'Lee'), (?, 'Brown'), (?, 'Patel')").bind(a.team.id, a.team.id, a.team.id, a.team.id).run();
		await deps.db.prepare("INSERT INTO roster_slots (team_id, week, duty, position, game_id, family_id) VALUES (?, '2026-10-05', 'lollies', 1, ?, ?)").bind(a.team.id, a.gameId, a.familyId).run();
		// Everything but Last seen, which every request records.
		const rows = async () => (await teamSnapshot(deps.db, a.team.id)).replace(/"last_seen_at":("[^"]*"|null)/g, '"last_seen_at":0');
		const before = await rows();
		expect(await (await manager("/live")).text()).toContain("season is over");
		await manager("/roster");
		expect(deps.live.inputs.size).toBe(0);
		expect(await rows()).toBe(before);
		const download = await manager(`/videos/${a.videoId}/download/hd`);
		expect(download.status).toBe(302);
	});
});
