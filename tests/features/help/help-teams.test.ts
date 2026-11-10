import { describe, expect, it } from "vitest";
import { makeClient } from "../../helpers/app.ts";
import { createTestDeps } from "../../helpers/fakes.ts";
import { addMember, addTeam, G14_5 } from "../../helpers/two-teams.ts";

describe("Help, for any team", () => {
	it("reads right for a team with no name to ask: no Sam, no B12.1, no boys or girls, its own season", async () => {
		const deps = createTestDeps();
		const team = { ...G14_5, id: "g14.5-2027", seasonStart: 2027 };
		await addTeam(deps.db, team);
		await addMember(deps.db, team.id, "jane@x.com", "manager", "Jane");
		await addMember(deps.db, team.id, "sam@x.com", "filmer", "Sam");
		await deps.db.prepare("INSERT INTO roster_duties (team_id, lollies, video, updated_at) VALUES (?, 0, 1, '2026-10-15T00:00:00.000Z')").bind(team.id).run();
		const help = async (email: string) => (await makeClient(deps, { email, team: team.id })("/help")).text();
		const page = await help("sam@x.com");
		for (const word of ["Sam", "B12.1", "U12", "Sunday", "AirDrop it to", "boys", "girls", "your son", "your daughter", "Chris", "lollies"]) expect(page, word).not.toMatch(new RegExp(`\\b${word}\\b`));
		expect(page).toContain('<h2 id="ask-h">Ask Virtual Team Manager</h2>');
		expect(page).toContain("If in doubt, ask your team manager.");
		expect(page).toContain("that's <b>31 December 2028</b>");
		expect(page).toContain("<summary>The roster: game day duties</summary>");
		expect(page).toContain("The site's admins can also open any team, to help when something goes wrong.");
		expect(page).toContain("Tap <b>Switch team</b>, under the team's name at the top left.");
		expect(page).toContain("Still stuck? Ask your team manager.");
		// Its team manager's own questions name no other team either.
		const jane = await help("jane@x.com");
		for (const word of ["Sam", "B12.1", "U12", "Sunday", "AirDrop it to", "boys", "girls", "your son", "Chris", "lollies"]) expect(jane, word).not.toMatch(new RegExp(`\\b${word}\\b`));
		expect(jane).toContain("choose your team's game day duties");
	});

	it("says game day duties whatever a team's extra duty is called, and leaves out video duty when a team doesn't film", async () => {
		const deps = createTestDeps();
		await addTeam(deps.db, G14_5);
		await addMember(deps.db, G14_5.id, "jane@x.com", "manager", "Jane");
		await deps.db.prepare("INSERT INTO roster_duties (team_id, lollies, lollies_label, video, updated_at) VALUES (?, 1, 'Oranges', 0, '2026-10-15T00:00:00.000Z')").bind(G14_5.id).run();
		const page = await (await makeClient(deps, { email: "jane@x.com", team: G14_5.id })("/help")).text();
		expect(page).toContain("<summary>The roster: game day duties</summary>");
		expect(page).not.toContain("Oranges");
		expect(page).not.toContain("No filming?");
	});
	it("starts the filming question with how the team films: shared out, one family every week, or nobody rostered", async () => {
		const deps = createTestDeps();
		await addTeam(deps.db, G14_5);
		await addMember(deps.db, G14_5.id, "jane@x.com", "manager", "Jane");
		const bruce = (await deps.db.prepare("INSERT INTO roster_families (team_id, surname) VALUES (?, 'Bruce')").bind(G14_5.id).run()).meta.last_row_id;
		await deps.db.prepare("INSERT INTO roster_duties (team_id, lollies, video, video_family_id, updated_at) VALUES (?, 1, 1, ?, '2026-10-15T00:00:00.000Z')").bind(G14_5.id, bruce).run();
		const help = async () => (await makeClient(deps, { email: "jane@x.com", team: G14_5.id })("/help")).text();
		const one = await help();
		expect(one).toContain('<summary>On video duty this week? Start here</summary><div class="faqbody">\n<p>One family films every game: the <a href="/roster">Roster</a> says which.');
		expect(one).not.toContain("a family takes a turn filming");
		await deps.db.prepare("UPDATE roster_duties SET video = 0, video_family_id = NULL WHERE team_id = ?").bind(G14_5.id).run();
		const none = await help();
		expect(none).toContain(`<summary>Filming a game? Start here</summary><div class="faqbody">\n<p>Your team doesn't roster anyone to film, but anyone set to Watch and film can still record or stream a game.`);
		expect(none).not.toContain("a family takes a turn filming");
		expect(none).not.toContain("your turn on video duty");
		expect(none).not.toContain("<h3>On video duty</h3>");
	});
});
