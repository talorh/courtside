import { describe, expect, it } from "vitest";
import { form, makeClient } from "../../helpers/app.ts";
import { createTestDeps } from "../../helpers/fakes.ts";
import { seedGame, seedVideo } from "../../helpers/seed.ts";
import { sheetRows } from "../../helpers/unzip.ts";

async function setup() {
	const deps = createTestDeps();
	for (const [email, name, role] of [["andrew@x.com", "Andrew", "coach"], ["ben@x.com", "Ben", "coach"], ["p@x.com", "Pat", "watcher"]]) {
		await deps.db.prepare("INSERT INTO members (team_id, email, name, role) VALUES (?, ?, ?, ?)").bind(deps.team.id, email, name, role).run();
	}
	const gameId = await seedGame(deps);
	await seedVideo(deps, { gameId, streamUid: "u1" });
	return { deps, gameId, andrew: makeClient(deps, "andrew@x.com"), ben: makeClient(deps, "ben@x.com"), watcher: makeClient(deps, "p@x.com"), admin: makeClient(deps) };
}

describe("coaches' notes", () => {
	it("coaches write and share notes, ordered by video time, clearly marked as coach-only", async () => {
		const { gameId, andrew, ben } = await setup();
		const res = await andrew(`/games/${gameId}/notes`, form({ at: "12:30", body: "Box out on free throws" }));
		expect(res.headers.get("Location")).toBe(`/games/${gameId}?done=note#notes`);
		await ben(`/games/${gameId}/notes`, form({ at: "2:05", body: "Press worked" }));
		await ben(`/games/${gameId}/notes`, form({ at: "", body: "Talk to the ref about travel calls" }));
		const page = await (await andrew(`/games/${gameId}`)).text();
		// The coach's clipboard: who can see it said plainly, Add a note first (no scrolling past the notes while
		// watching), then the notes; beside the video on a computer, so first in the side column.
		expect(page).toContain('<span class="cbonly">');
		expect(page).toContain("Coaches only</span>");
		expect(page).toContain("Nobody else sees these: not Watch only, Watch and film or team managers.");
		expect(page).toContain('placeholder="Box out or else…"');
		expect(page).toContain("Watching the video? Tap <b>Mark time</b> to use the moment it's up to. Or type a\ntime, like 3:42. For a note about the whole game, leave this blank.");
		expect(page.indexOf("Save note")).toBeLessThan(page.indexOf("Press worked"));
		expect(page.indexOf('<aside class="side">')).toBeLessThan(page.indexOf('id="notes"'));
		expect(page).toContain('<div class="watch coaching">');
		expect(page.indexOf("Press worked")).toBeLessThan(page.indexOf("Box out on free throws"));
		expect(page.indexOf("Box out on free throws")).toBeLessThan(page.indexOf("Talk to the ref"));
		expect(page).toContain('data-seek="750"');
		expect(page).toContain("<span class=\"small\">Ben</span>");
		expect(page).toContain('data-mark="note-at" hidden>Mark time</button>');
	});
	it("parents and admins (team managers) never see or write them", async () => {
		const { deps, gameId, andrew, watcher, admin } = await setup();
		await andrew(`/games/${gameId}/notes`, form({ at: "1:00", body: "Secret plan" }));
		for (const client of [watcher, admin]) {
			const page = await (await client(`/games/${gameId}`)).text();
			expect(page).not.toContain("Secret plan");
			expect(page).not.toContain("Coaches' notes");
		}
		expect((await admin(`/games/${gameId}/notes`, form({ body: "x" }))).status).toBe(403);
		expect((await admin("/notes/1/delete", form({ confirm: "yes" }))).status).toBe(403);
		expect((await watcher(`/games/${gameId}/notes`, form({ body: "x" }))).status).toBe(403);
		const count = await deps.db.prepare("SELECT count(*) AS n FROM coach_notes WHERE deleted_at IS NULL").first<number>("n");
		expect(count).toBe(1);
	});
	it("either coach can delete a note; bad times are refused", async () => {
		const { gameId, andrew, ben } = await setup();
		await andrew(`/games/${gameId}/notes`, form({ at: "1:00", body: "Delete me" }));
		expect((await ben(`/games/${gameId}/notes`, form({ at: "soon", body: "x" }))).status).toBe(400);
		expect((await ben("/notes/1/delete", form({ confirm: "yes" }))).headers.get("Location")).toBe(`/games/${gameId}?done=notedeleted#notes`);
		expect(await (await andrew(`/games/${gameId}`)).text()).not.toContain("Delete me");
		expect((await ben("/notes/1/delete", form({ confirm: "yes" }))).status).toBe(404);
	});
	it("a game's notes download for Excel, in video order, for coaches only", async () => {
		const { gameId, andrew, ben, watcher, admin } = await setup();
		await andrew(`/games/${gameId}/notes`, form({ at: "12:30", body: "Box out on free throws" }));
		await ben(`/games/${gameId}/notes`, form({ at: "", body: "Talk to the ref" }));
		await ben(`/games/${gameId}/notes`, form({ at: "2:05", body: "Press worked" }));
		const page = await (await andrew(`/games/${gameId}`)).text();
		expect(page).toContain(`<a class="btn cbexport" href="/games/${gameId}/notes.xlsx">Download for Excel</a>`);
		const res = await andrew(`/games/${gameId}/notes.xlsx`);
		expect(res.headers.get("Content-Type")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
		expect(res.headers.get("Content-Disposition")).toMatch(/^attachment; filename="saints-b12-1-[0-9-]+-[a-z0-9-]+-coaches-notes\.xlsx"$/);
		const rows = sheetRows(new Uint8Array(await res.arrayBuffer()));
		// The game first, its details under it, then the notes' table.
		expect(rows.slice(0, 5)).toEqual([
			[expect.stringMatching(/ vs /)], ["Saints B12.1 · 2026/27"], [expect.stringMatching(/^[A-Z][a-z]{2} \d{1,2} [A-Z][a-z]{2} 2026, /)],
			["Coaches' notes, for coaches only. Downloaded Thu 15 Oct 2026, 11:00am."], [],
		]);
		expect(rows[5]).toEqual(["Time", "Note", "Coach", "Added"]);
		expect(rows.slice(6).map((r) => r.slice(0, 3))).toEqual([["2:05", "Press worked", "Ben"], ["12:30", "Box out on free throws", "Andrew"], ["Whole game", "Talk to the ref", "Ben"]]);
		expect(rows[6]![3]).toMatch(/^[A-Z][a-z]{2} \d{1,2} [A-Z][a-z]{2} \d{4}, \d{1,2}:\d{2}(am|pm)$/);
		for (const client of [watcher, admin]) expect((await client(`/games/${gameId}/notes.xlsx`)).status).toBe(403);
	});
	it("offers no download while a game has no notes", async () => {
		const { gameId, andrew } = await setup();
		expect(await (await andrew(`/games/${gameId}`)).text()).not.toContain("notes.xlsx");
	});
});
