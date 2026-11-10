import { describe, expect, it } from "vitest";
import { form, jsonBody, makeClient } from "../../helpers/app.ts";
import { appGame } from "../../helpers/app-game.ts";
import { seedVideo } from "../../helpers/seed.ts";

// A game streamed from an external app over RTMPS (an AI tracking camera's own app, say), in place of Go live's camera:
// choosing it on Go live, its card with the server and stream key, going back to the camera, and who can do what.

describe("choosing an external app for a game", () => {
	it("a game is streamed from the phone's camera unless someone chooses the app", async () => {
		const { deps, gameId, sam, row } = await appGame();
		await sam(`/live?game=${gameId}`);
		expect(await row()).toMatchObject({ source: "camera", status: "open" });
		expect(deps.live.together.size).toBe(0);
	});
	it("Go live keeps the camera's card and its Start camera button, with a smaller green button under it for an external app; no key is shown until it's tapped", async () => {
		const { deps, gameId, page, row } = await appGame();
		const before = await page();
		expect(before).toContain('class="appcard weblive"');
		expect(before).toContain('<button class="btn livebtn bigpick" type="button" data-act="camera" hidden>Start camera</button>');
		expect(before).toMatch(new RegExp(`</section><form method="post" action="/live/${gameId}/app" class="useapp">(<input type="hidden" name="_team"[^>]*>)?<button class="btn primary">Use an external app instead</button>`));
		expect(before).toContain('Only for an AI tracking camera whose own app does the filming, like XbotGo\'s at the time of writing. <a href="/help#ai-cameras">Which cameras work</a>');
		expect(before).not.toContain("key-live");
		expect(before).not.toContain("golive-app.js");
		expect(await row()).toMatchObject({ source: "camera" });
		expect(deps.live.together.size).toBe(0);
	});
	it("choosing it sets the game to the app, keeps a dropped stream in one recording, and shows the server and key to copy in the camera's place", async () => {
		const { deps, gameId, choose, page, row } = await appGame();
		const res = await choose();
		expect(res.status).toBe(303);
		expect(res.headers.get("Location")).toBe(`/live?game=${gameId}`);
		expect(await row()).toMatchObject({ source: "app", status: "open", last_live_at: null });
		expect(deps.live.together.get("live-1")).toBe(600);
		const html = await page();
		expect(html).toContain('value="rtmps://live.cloudflare.com:443/live/"');
		expect(html).toContain('value="key-live-1"');
		expect(html).toContain('value="rtmps://live.cloudflare.com:443/live/key-live-1"');
		expect(html).toContain('data-copy="app-server"');
		expect(html).toContain(`data-app-game="${gameId}"`);
		expect(html).toContain('<script type="module" src="/golive-app.js"></script>');
		expect(html).not.toContain('src="/golive.js"');
		expect(html).not.toContain('class="appcard weblive"');
		expect(html).toContain("Waiting for the external app");
		// What RTMPS is, in a line.
		expect(html).toContain('<p class="small"><b>RTMPS</b> is the standard way a camera app sends a live stream to a website. The app needs two things from here: a server address and a stream key.</p>');
		expect(html).toContain(`action="/live/${gameId}/app-stop"`);
		expect(html).toContain('<button class="btn danger">Yes, end game</button> <button type="button" class="btn" data-keep>Keep streaming</button>');
		// The way back to the camera is a button beside End game, and there's no green button now.
		expect(html).toContain('<div class="appacts"><details class="confirm"><summary class="btn danger">End game</summary>');
		expect(html).toMatch(new RegExp(`<form method="post" action="/live/${gameId}/camera" data-app-back>(<input type="hidden" name="_team"[^>]*>)?<button class="btn">Use this phone's camera instead</button></form></div>`));
		expect(html).not.toContain('class="useapp"');
		expect(html).toContain('More help: <a href="/help#ai-cameras">Filming with an AI tracking camera</a> in Help.');
		// The game picker is still there, to film another game.
		expect(html).toContain(`<option value="${gameId}" selected>`);
		// Choosing it again changes nothing.
		expect((await choose()).status).toBe(303);
		expect(deps.live.inputs.size).toBe(1);
	});
	it("Go live for an app game asks Stream once whether the app is sending", async () => {
		const { deps, choose, page } = await appGame();
		await choose();
		deps.live.appConnectedTo.add("live-1");
		let asked = 0;
		const ask = deps.live.appConnected.bind(deps.live);
		deps.live.appConnected = async (uid: string) => { asked++; return ask(uid); };
		expect(await page()).toContain("Live.");
		expect(asked).toBe(1);
	});
	it("is for people who film: a Watch only parent can't open the page, choose it or see the key", async () => {
		const { deps, gameId, choose } = await appGame();
		await choose();
		const fam = makeClient(deps, "fam@x.com");
		expect((await fam(`/live?game=${gameId}`)).status).toBe(403);
		expect((await fam(`/live/${gameId}/app`, form({}))).status).toBe(403);
		expect((await fam(`/api/live/${gameId}/app-status`, jsonBody({}))).status).toBe(403);
	});
	it("refuses a game that's No video, set to be recorded, already played, or that has its video", async () => {
		const { deps, gameId, choose, later } = await appGame();
		const refused = async (why: string) => {
			const res = await choose();
			expect(res.status, why).toBe(409);
			expect(await res.text(), why).toContain(why);
		};
		await deps.db.prepare("UPDATE games SET live_stream = 0 WHERE id = ?").bind(gameId).run();
		await refused("set to be recorded, not live streamed");
		await deps.db.prepare("UPDATE games SET live_stream = 1, no_video_at = '2026-10-14T00:00:00Z' WHERE id = ?").bind(gameId).run();
		await refused("set to No video");
		await deps.db.prepare("UPDATE games SET no_video_at = NULL WHERE id = ?").bind(gameId).run();
		const videoId = await seedVideo(deps, { gameId, streamUid: "u1" });
		await refused("already has its video");
		await deps.db.prepare("DELETE FROM videos WHERE id = ?").bind(videoId).run();
		later(24 * 60);
		await refused("has been played");
	});
	it("a game being filmed from a phone can't be switched to the app, and an app game can't be filmed from Go live", async () => {
		const filming = await appGame();
		await filming.sam(`/api/live/${filming.gameId}/browser`, jsonBody({ mimeType: "video/mp4" }));
		const res = await filming.choose();
		expect(res.status).toBe(409);
		expect(await res.text()).toContain("already being filmed from a phone");
		expect(await filming.row()).toMatchObject({ source: "camera" });

		const app = await appGame();
		await app.choose();
		const start = await app.sam(`/api/live/${app.gameId}/browser`, jsonBody({ mimeType: "video/mp4" }));
		expect(start.status).toBe(409);
		expect(((await start.json()) as { error: { message: string } }).error.message).toContain("set to stream from an external app");
		expect(await app.deps.db.prepare("SELECT COUNT(*) AS n FROM videos").first<number>("n")).toBe(0);
	});
	it("goes back to the phone's camera until the app has streamed, and not while it's sending", async () => {
		const { deps, gameId, sam, choose, row } = await appGame();
		await choose();
		deps.live.appConnectedTo.add("live-1");
		const busy = await sam(`/live/${gameId}/camera`, form({}));
		expect(busy.status).toBe(409);
		expect(await busy.text()).toContain("Stop it in the app first");
		deps.live.appConnectedTo.clear();
		const back = await sam(`/live/${gameId}/camera`, form({}));
		expect(back.headers.get("Location")).toBe(`/live?game=${gameId}`);
		expect(await row()).toMatchObject({ source: "camera", status: "open" });
		expect(await (await sam(`/live?game=${gameId}`)).text()).toContain('class="appcard weblive"');
		// Once it has streamed, it's the app's game.
		await choose();
		deps.live.appConnectedTo.add("live-1");
		await sam(`/api/live/${gameId}/app-status`, jsonBody({}));
		deps.live.appConnectedTo.clear();
		const late = await sam(`/live/${gameId}/camera`, form({}));
		expect(late.status).toBe(409);
		expect(await late.text()).toContain("has been streamed from the external app");
	});
	it("the admin Log says who set a game to an external app, who set it back, and who stopped its stream", async () => {
		const { deps, gameId, sam, choose } = await appGame();
		await choose();
		await choose();
		await sam(`/live/${gameId}/camera`, form({}));
		await choose();
		await sam(`/live/${gameId}/app-stop`, form({ confirm: "yes" }));
		const log = (await deps.db.prepare("SELECT admin_email, action, detail FROM admin_log ORDER BY id").all<{ admin_email: string; action: string; detail: string }>()).results;
		const game = "Round 9 · vs Northside 2, Thu 15 Oct";
		expect(log).toEqual([
			{ admin_email: "sam@x.com", action: "live_app_chosen", detail: game },
			{ admin_email: "sam@x.com", action: "live_app_camera", detail: game },
			{ admin_email: "sam@x.com", action: "live_app_chosen", detail: game },
			{ admin_email: "sam@x.com", action: "live_app_stopped", detail: game },
		]);
		const page = (await (await makeClient(deps)("/admin/log?show=videos")).text()).replaceAll("&#39;", "'");
		expect(page).toContain(`set Saints B12.1's game ${game} to stream from an external app`);
		expect(page).toContain(`set Saints B12.1's game ${game} back to the phone's camera`);
		expect(page).toContain(`ended the external app's stream of Saints B12.1's game ${game}`);
		expect(page).toContain("External app chosen");
	});
	it("never logs the stream key", async () => {
		const { choose, page } = await appGame();
		const lines: string[] = [];
		const log = console.log;
		console.log = (...args: unknown[]) => { lines.push(args.join(" ")); };
		try {
			await choose();
			await page();
		} finally {
			console.log = log;
		}
		expect(lines.join("\n")).toContain('"event":"live_app_chosen"');
		expect(lines.join("\n")).not.toContain("key-live-1");
	});
});
