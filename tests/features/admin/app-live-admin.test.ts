import { describe, expect, it } from "vitest";
import { form, jsonBody, makeClient } from "../../helpers/app.ts";
import { appGame } from "../../helpers/app-game.ts";

// A game streamed from an external app (RTMPS), where the admin area counts or shows live streams: the Log's Right now,
// and Insights' line on where videos came from.

describe("an external app's stream in the admin area", () => {
	it("the Log's Right now shows it once the app has streamed, as a camera stream is once Go live starts", async () => {
		const { deps, gameId, sam, choose } = await appGame();
		const inProgress = async () => {
			const page = await (await makeClient(deps)("/admin/log")).text();
			return page.slice(page.indexOf("rightnow"), page.indexOf("Which lines"));
		};
		await choose();
		expect(await inProgress()).not.toContain("Northside 2");
		deps.live.appConnectedTo.add("live-1");
		await sam(`/api/live/${gameId}/app-status`, jsonBody({}));
		expect(await inProgress()).toContain("Northside 2");
		await sam(`/live/${gameId}/app-stop`, form({ confirm: "yes" }));
		expect(await inProgress()).toContain("Northside 2");
	});
	it("Insights says how many live streams came from an external app, and nothing more when none did", async () => {
		const { deps, gameId } = await appGame();
		const lines = async () => (await (await makeClient(deps)("/admin")).text()).replaceAll("&#39;", "'");
		const run = (sql: string, ...args: unknown[]) => deps.db.prepare(sql).bind(...args).run();
		const video = (await run(`INSERT INTO videos (team_id, game_id, status, stream_uid, duration_seconds, delete_after, created_at)
			VALUES (?, ?, 'ready', 'rec-1', 2400, '2027-12-31T13:00:00.000Z', '2026-10-15T09:00:00.000Z')`, deps.team.id, gameId)).meta.last_row_id;
		await run("INSERT INTO live_streams (team_id, game_id, live_input_uid, status, created_at, recording_video_id) VALUES (?, ?, 'in-1', 'saved', '2026-10-15T07:40:00.000Z', ?)", deps.team.id, gameId, video);
		expect(await lines()).toContain("1 of 1 video came from a live stream; the rest were recorded and uploaded.");
		await run("UPDATE live_streams SET source = 'app'");
		expect(await lines()).toContain("1 of 1 video came from a live stream (1 from an external app); the rest were recorded and uploaded.");
	});
});
