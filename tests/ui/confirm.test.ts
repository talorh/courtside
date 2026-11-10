import { describe, expect, it } from "vitest";
import { buildRouter } from "../../src/app/routes.ts";
import { confirmButton } from "../../src/ui/confirm.ts";
import { makeClient } from "../helpers/app.ts";
import { teamSnapshot } from "../helpers/two-teams.ts";
import { ROUTES } from "../isolation/route-table.ts";
import { twoTeams } from "../isolation/setup.ts";

/** Every delete and remove asks first (all of them). */
const DELETES = [
	"POST /fixture/:id/delete", "POST /fixture/:id/delete-all", "POST /videos/:id/delete", "POST /videos/:id/keep-first", "POST /removal-requests/:id/delete-video",
	"POST /clips/:id/delete", "POST /clip-removal-requests/:id/delete-clip", "POST /photos/:id/delete", "POST /photos/delete", "POST /photo-removal-requests/:id/delete-photo",
	"POST /members/:id/remove", "POST /players/:id/remove", "POST /roster/families/:id/remove", "POST /fixture/playhq/:id/remove", "POST /notes/:id/delete",
];

describe("are you sure", () => {
	it("is a Delete that opens the question, with Yes, delete it and Keep it", () => {
		const out = confirmButton({ action: "/photos/7/delete", label: "Delete photo", question: "Delete this photo?", consequence: "It can't be brought back." }).__html;
		expect(out).toBe('<details class="confirm"><summary class="btn quiet">Delete photo</summary><form method="post" action="/photos/7/delete" class="confirmpanel">'
			+ '<p><b>Delete this photo?</b> It can&#39;t be brought back.</p><input type="hidden" name="confirm" value="yes">'
			+ '<button class="btn danger">Yes, delete it</button> <button type="button" class="btn" data-keep>Keep it</button></form></details>');
	});

	it("is what every delete and remove route needs, and only those", () => {
		expect(buildRouter().list().filter((r) => r.confirm).map((r) => `${r.method} ${r.path}`).sort()).toEqual([...DELETES].sort());
	});

	it.each(DELETES)("%s does nothing without Yes, and its job with it", async (route) => {
		const { deps, a } = await twoTeams(true);
		const routeCase = ROUTES.find((r) => r.route === route)!;
		// Keep the first part is for a carried-on stream whose join gave up: the seeded video is made one.
		if (route === "POST /videos/:id/keep-first") {
			await deps.db.prepare("UPDATE videos SET status = 'processing', stream_uid = NULL, r2_key = 'originals/x/live.mp4', join_failed_at = '2026-10-15T00:00:00.000Z' WHERE team_id = ? AND id = ?").bind(a.team.id, a.videoId).run();
		}
		// Deleting a game on its own is for a game with no video (the seeded one has its video).
		const bare = (await deps.db.prepare("INSERT INTO games (team_id, starts_at, competition) VALUES (?, '2026-11-20T18:40', 'VJBL')").bind(a.team.id).run()).meta.last_row_id;
		const { path, init } = route === "POST /fixture/:id/delete" ? { path: `/fixture/${bare}/delete`, init: undefined } : routeCase.req(a, a);
		const client = makeClient(deps, { email: a.emails[routeCase.as ?? "manager"], team: a.team.id });
		const without = new URLSearchParams(init?.body as URLSearchParams);
		without.delete("confirm");
		const before = await teamSnapshot(deps.db, a.team.id);
		const refused = await client(path, { method: "POST", body: without });
		expect(refused.status).toBe(400);
		expect(await refused.text()).toContain("Tap Yes to confirm.");
		expect(await teamSnapshot(deps.db, a.team.id)).toBe(before);
		without.set("confirm", "yes");
		const done = await client(path, { method: "POST", body: without });
		expect(done.status, await done.clone().text()).toBe(303);
		expect(await teamSnapshot(deps.db, a.team.id)).not.toBe(before);
	});
});
