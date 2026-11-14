import { describe, expect, it } from "vitest";
import { familiesForm, form, makeClient } from "../../helpers/app.ts";
import { createTestDeps } from "../../helpers/fakes.ts";
import { seedGame } from "../../helpers/seed.ts";

// A family that films every game (or does the extra duty every game) is set once, in the team's Duties. A team manager
// looking for it finds the way from the top of the Roster and from a week's Change, and the choice says what it does.

async function rostered() {
	const deps = createTestDeps();
	await deps.db.prepare("INSERT INTO members (team_id, email, role) VALUES (?, 'c@x.com', 'coach')").bind(deps.team.id).run();
	await seedGame(deps, { startsAt: "2026-10-16T18:40", opponent: "Knox" });
	const sam = makeClient(deps);
	await sam("/roster/families", familiesForm("Smith\nLee"));
	await sam("/roster/generate", form({}));
	return { deps, sam };
}

describe("one family on a duty every week, easy to find", () => {
	it("points the team manager to the team's duties from the top of the Roster, and nobody else", async () => {
		const { deps, sam } = await rostered();
		const page = (await (await sam("/roster")).text()).replaceAll("&#39;", "'");
		expect(page).toContain('<p class="small"><a href="#duties">Team duties</a>: switch lollies or video off, or give one to the same family every week (a parent who films every game, say).</p>');
		expect(page.indexOf('href="#duties"')).toBeLessThan(page.indexOf('class="duty-weeks"'));
		expect(await (await makeClient(deps, "c@x.com")("/roster")).text()).not.toContain('href="#duties"');
	});

	it("says who films, and each family's choice in words", async () => {
		const { sam } = await rostered();
		const page = await (await sam("/roster")).text();
		expect(page).toContain('<label>Who films<select name="videoFamily"><option value="">Shared out fairly</option>');
		expect(page).toContain(">The Lee family, every week</option>");
		expect(page).toContain('<label>Who does it<select name="lolliesFamily">');
	});

	it("tells a week's Change where to set a family for every week", async () => {
		const { sam } = await rostered();
		const page = await (await sam("/roster")).text();
		expect(page).toContain('Same family every week? Set it once in <a href="#duties">Team duties</a>.');
	});
});
