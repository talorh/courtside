import { describe, expect, it } from "vitest";
import { withTeam } from "../../../src/app/deps.ts";
import type { Team } from "../../../src/features/teams/team.ts";
import { getVideo } from "../../../src/features/videos/videos-repository.ts";
import { runSync } from "../../../src/jobs/sync-videos.ts";
import { jsonBody, makeClient, MANAGER } from "../../helpers/app.ts";
import { createTestDeps, type TestDeps } from "../../helpers/fakes.ts";
import { seedGame } from "../../helpers/seed.ts";
import { addMember, addTeam } from "../../helpers/two-teams.ts";

// A second team's game night, as B14.3's first one will run (Fri 6 Nov 2026, 7:35pm), while B12.1 streams the same
// night: B14.3's team manager goes live (nobody's set to Watch and film yet), its families watch, the 5-minute job looks
// after both streams, and each team's video is saved as its own. local is UTC+11.
const B14_3: Team = { id: "b14.3-2026-2", code: "b14.3", name: "Saints U14 Boys 14.3", seasonStart: 2026, askName: "Danielle", status: "active", closedAt: null, deleteAfter: null };

async function twoTeamNight() {
	let now = new Date("2026-11-06T06:00:00Z"); // Fri 5pm
	const deps = createTestDeps();
	(deps as { now: () => Date }).now = () => now;
	await addTeam(deps.db, B14_3);
	await addMember(deps.db, B14_3.id, "danielle@x.com", "manager", "Danielle");
	await addMember(deps.db, B14_3.id, "fam14@x.com", "watcher");
	await addMember(deps.db, deps.team.id, "fam12@x.com", "watcher");
	const g12 = await seedGame(deps, { startsAt: "2026-11-06T18:30", roundLabel: "4", opponent: "Lakeside Rockets" });
	const g14 = await seedGame(withTeam(deps, B14_3) as TestDeps, { startsAt: "2026-11-06T19:35", roundLabel: "Round 1", opponent: "local 4", venue: "Springers Leisure Centre, Court 2" });
	const at = (melbourne: string) => { now = new Date(`${melbourne}+11:00`); };
	const cronUntil = async (from: string, to: string) => {
		for (let t = Date.parse(`2026-11-06T${from}+11:00`); t <= Date.parse(`2026-11-06T${to}+11:00`); t += 5 * 60_000) {
			now = new Date(t);
			await runSync(deps);
		}
	};
	const clients = {
		manager: makeClient(deps, { email: MANAGER, team: deps.team.id }),
		danielle: makeClient(deps, { email: "danielle@x.com", team: B14_3.id }),
		fam14: makeClient(deps, { email: "fam14@x.com", team: B14_3.id }),
		fam12: makeClient(deps, { email: "fam12@x.com", team: deps.team.id }),
	};
	const stream = (gameId: number) => deps.db.prepare("SELECT status FROM live_streams WHERE game_id = ?").bind(gameId).first<string>("status");
	return { deps, g12, g14, at, cronUntil, stream, ...clients };
}

const goLive = async (client: ReturnType<typeof makeClient>, gameId: number) =>
	((await (await client(`/api/live/${gameId}/browser`, jsonBody({ mimeType: "video/mp4" }))).json()) as { data: { videoId: number } }).data;

describe("a second team's game night, beside B12.1's", () => {
	it("B14.3's team manager goes live, its families watch, both streams stay up, and each video is saved to its own team", async () => {
		const { deps, g12, g14, at, cronUntil, stream, manager, danielle, fam14, fam12 } = await twoTeamNight();
		// Set up at the stadium: Go live shows each team its own game, and no one else's.
		at("2026-11-06T18:00:00");
		const page14 = await (await danielle("/live")).text();
		expect(page14).toContain("local 4");
		expect(page14).not.toContain("Lakeside Rockets");
		at("2026-11-06T18:30:00");
		const live12 = await goLive(manager, g12);
		at("2026-11-06T19:35:00");
		const live14 = await goLive(danielle, g14);
		// Each team's live input, named after its own team and carrying its id.
		const inputs = [...deps.live.inputs.values()];
		expect(inputs.map((i) => i.teamId).sort()).toEqual([B14_3.id, deps.team.id].sort());
		expect(inputs.find((i) => i.teamId === B14_3.id)!.name).toMatch(/^Saints B14\.3 · 2026-11-06/);
		for (const uid of deps.live.inputs.keys()) deps.live.connected.add(uid);
		await cronUntil("19:35:30", "20:30:30");
		expect([await stream(g12), await stream(g14)]).toEqual(["open", "open"]);
		// B14.3's families watch B14.3's game live; B12.1's see only their own.
		expect(await (await fam14(`/games/${g14}`)).text()).toContain("data-whep=");
		const home14 = await (await fam14("/")).text();
		expect(home14).toContain("LIVE NOW");
		expect(home14).toContain("local 4");
		expect(home14).not.toContain("Lakeside Rockets");
		expect(await (await fam12("/")).text()).not.toContain("local 4");
		expect((await fam12(`/games/${g14}`)).status).toBe(404);
		// The final buzzer: B14.3 stops and its recording is saved, while B12.1's stream carries on.
		at("2026-11-06T20:40:00");
		const key14 = [...deps.live.inputs.entries()].find(([, i]) => i.teamId === B14_3.id)![0];
		deps.live.connected.delete(key14);
		expect(((await (await danielle(`/api/live/${g14}/end`, jsonBody({}))).json()) as { data: unknown }).data).toEqual({ status: "ended" });
		const done = await danielle(`/api/uploads/${live14.videoId}/complete`, jsonBody({ parts: [1, 2, 3].map((n) => ({ partNumber: n, etag: `e${n}` })) }));
		expect(((await done.json()) as { data: unknown }).data).toEqual({ status: "processing" });
		expect([await stream(g12), await stream(g14)]).toEqual(["open", "saved"]);
		// Its video is B14.3's: its original under B14.3's folder, ready once Stream has it, watched by B14.3's families.
		const video14 = (await getVideo(deps.db, B14_3.id, live14.videoId))!;
		expect(video14.r2Key).toMatch(/^originals\/b14\.3-2026-2\//);
		expect(await getVideo(deps.db, deps.team.id, live14.videoId)).toBeNull();
		deps.stream.videos.set(video14.streamUid!, { readyToStream: true, state: "ready", errorReason: "", durationSeconds: 64 * 60 });
		await cronUntil("20:45:30", "21:00:30");
		expect(await getVideo(deps.db, B14_3.id, live14.videoId)).toMatchObject({ status: "ready", durationSeconds: 3840 });
		expect(await (await fam14(`/games/${g14}`)).text()).toContain(`/tok-${video14.streamUid}/iframe`);
		expect(await stream(g12)).toBe("open");
		expect(live12.videoId).not.toBe(live14.videoId);
	});
});
