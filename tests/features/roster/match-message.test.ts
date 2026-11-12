import { describe, expect, it } from "vitest";
import type { Game } from "../../../src/features/games/games-repository.ts";
import { CLUB } from "../../../src/club.ts";
import { longDate, matchMessage, uniformLine } from "../../../src/features/roster/match-message.ts";
import type { Slot } from "../../../src/features/roster/roster-plan.ts";
import { findActiveMemberByEmail } from "../../../src/features/members/members-repository.ts";
import { messagePage } from "../../../src/features/roster/views/message-page.ts";
import { familiesForm, form, makeClient } from "../../helpers/app.ts";
import { createTestDeps } from "../../helpers/fakes.ts";
import { seedGame } from "../../helpers/seed.ts";

const game = (o: Partial<Game>): Game => ({
	id: 1, teamId: "t", startsAt: "2026-10-23T18:30", competition: "Practice match", roundLabel: "", opponent: "Northside 2",
	venue: "Saints Stadium Court 1", noVideo: false, playhqGone: false, fromPlayhq: false, liveStream: true, ...o, phase: o.phase ?? null,
});
const week = "2026-10-19";
const slots: Slot[] = [
	{ week, duty: "scoring", position: 2, gameId: 1, familyId: 3 }, { week, duty: "scoring", position: 1, gameId: 1, familyId: 2 },
	{ week, duty: "lollies", position: 1, gameId: 1, familyId: 4 }, { week, duty: "video", position: 1, gameId: 1, familyId: 8 },
];
const names = new Map([[2, "Appleby"], [3, "Birchwood"], [4, "Cresswell"], [8, "Rivers"]]);

describe("match day message", () => {
	it("a message too long for a WhatsApp link is copied instead", async () => {
		const deps = createTestDeps();
		const member = (await findActiveMemberByEmail(deps.db, deps.team.id, "sam@saints.example"))!;
		const frame = { team: deps.team, member, viewer: { email: member.email, isAdmin: true, memberships: [] }, viewAs: null };
		const page = (text: string) => messagePage({ frame, week, uniform: "Navy", text }).__html;
		expect(page("Hi Team.")).toMatch(/<a class="btn" href="https:\/\/wa\.me\/\?text=Hi%20Team\." target="_blank" rel="noopener" data-wa>Open WhatsApp<\/a>/);
		expect(page("Hi Team.")).toContain("<span data-wa-long hidden>");
		// Too long: the link is hidden until the message is cut down to fit (public/match-message.js).
		const long = page("🏀 Opponent: Lakeside\n".repeat(120));
		expect(long).toMatch(/data-wa hidden>Open WhatsApp<\/a>/);
		expect(long).toContain("<span data-wa-fits hidden>");
		expect(long).toContain("too long to open in WhatsApp straight from here");
	});
	it("can be changed in the box before it's copied or sent", async () => {
		const deps = createTestDeps();
		const member = (await findActiveMemberByEmail(deps.db, deps.team.id, "sam@saints.example"))!;
		const frame = { team: deps.team, member, viewer: { email: member.email, isAdmin: true, memberships: [] }, viewAs: null };
		const html = messagePage({ frame, week, uniform: "Navy", text: "Hi Team." }).__html;
		expect(html).toContain('<textarea id="match-message" class="msgbox" rows="22">Hi Team.</textarea>');
		expect(html).not.toContain("readonly");
		expect(html).toContain('<script type="module" src="/match-message.js"></script>');
		expect(html).toContain("Change anything in the message before you copy or send it. Update message starts it again from the roster.");
	});
	it("is laid out like a team's WhatsApp match-day message", () => {
		expect(longDate("2026-10-23T18:30")).toBe("Friday 23 October, 6:30pm");
		expect(matchMessage({ game: game({}), slots, names, video: true, uniform: "White" })).toBe(`Hi Team.

Please see below match day details.

Opponent: Northside 2
Saints Stadium Court 1
Friday 23 October, 6:30pm

Please arrive 30 mins before start time.

White uniform, pack Navy just in case.

💻 Scorers: Appleby, Birchwood
🍬 Lollies: Cresswell
🎥 Video: Rivers (live stream it from https://saints.example)`);
	});
	it("says TBC for what isn't known, and leaves out video for a game that isn't filmed and the extra duty on a Scorers only week", () => {
		const text = matchMessage({ game: game({ startsAt: "2026-11-08T13:20", opponent: "TBC", venue: "", noVideo: true }), slots, names, video: true, extra: false, uniform: "Navy" });
		expect(text).toContain("Opponent: TBC\nVenue TBC\nSunday 8 November, 1:20pm");
		expect(text).toContain("\n\nNavy uniform, pack White just in case.\n\n");
		expect(text.endsWith("💻 Scorers: Appleby, Birchwood")).toBe(true);
	});
	it("tells the family on video to record and upload a game that isn't live streamed", () => {
		expect(matchMessage({ game: game({ liveStream: false }), slots, names, video: true, uniform: "Navy" })).toContain("🎥 Video: Rivers (record it, then upload it to https://saints.example)");
	});
	it("names the club's uniforms: the other packed as the clash uniform, or just the one for a club with a reversible singlet", async () => {
		expect(uniformLine("Navy")).toBe("Navy uniform, pack White just in case.");
		const three = [...CLUB.uniforms];
		CLUB.uniforms = ["Navy", "White", "Gold"];
		expect(uniformLine("White")).toBe("White uniform, pack Navy or Gold just in case.");
		CLUB.uniforms = ["Reversible singlet"];
		expect(uniformLine("Reversible singlet")).toBe("Uniform: Reversible singlet.");
		expect(matchMessage({ game: game({}), slots, names, video: true, uniform: "Reversible singlet" })).toContain("\n\nUniform: Reversible singlet.\n\n");
		const deps = createTestDeps();
		const member = (await findActiveMemberByEmail(deps.db, deps.team.id, "sam@saints.example"))!;
		const frame = { team: deps.team, member, viewer: { email: member.email, isAdmin: true, memberships: [] }, viewAs: null };
		const one = messagePage({ frame, week, uniform: "Reversible singlet", text: "Hi Team." }).__html;
		expect(one).not.toContain("<legend>Uniform</legend>");
		expect(one).toContain('<div class="row-actions"><button class="btn">Update message</button></div>');
		CLUB.uniforms = three;
	});
	it("team manager gets it from each week, uniform chosen each time (the other always packed, no checkbox), with copy and WhatsApp buttons", async () => {
		const deps = createTestDeps();
		await deps.db.prepare("INSERT INTO members (team_id, email, name, role) VALUES (?, 'c@x.com', 'Coach', 'coach')").bind(deps.team.id).run();
		await seedGame(deps, { startsAt: "2026-10-23T18:30", competition: "Practice match", roundLabel: "", opponent: "Northside 2", venue: "Saints Stadium Court 1" });
		const manager = makeClient(deps);
		await manager("/roster/families", familiesForm("Appleby\nBirchwood\nCresswell\nRivers"));
		await manager("/roster/generate", form({}));
		expect(await (await manager("/roster")).text()).toContain('<div class="duty-admin"><a class="btn quiet" href="/roster/week/2026-10-19/message">WhatsApp message</a>');
		const first = await (await manager("/roster/week/2026-10-19/message")).text();
		expect(first).toContain("Navy uniform, pack White just in case.");
		expect(first).toContain('<fieldset class="choice"><legend>Uniform</legend><label><input type="radio" name="uniform" value="Navy" checked> Navy</label><label><input type="radio" name="uniform" value="White"> White</label></fieldset>');
		expect(first).not.toContain('type="checkbox"');
		const page = await (await manager("/roster/week/2026-10-19/message?uniform=White")).text();
		expect(page).toContain("White uniform, pack Navy just in case.\n\n");
		expect(page).toContain('data-copy="match-message"');
		expect(page).toContain('href="https://wa.me/?text=Hi%20Team.%0A%0APlease%20see%20below');
		expect((await makeClient(deps, "c@x.com")("/roster/week/2026-10-19/message")).status).toBe(403);
		expect((await manager("/roster/week/2026-10-26/message")).status).toBe(404);
	});
});
