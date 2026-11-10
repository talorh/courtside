import { describe, expect, it, vi } from "vitest";
import { makeClient } from "../helpers/app.ts";
import { createTestDeps } from "../helpers/fakes.ts";

describe("the alert at the top of a team manager's pages", () => {
	it("never shows video storage, whatever Stream says, and doesn't ask Stream (the admins are emailed instead)", async () => {
		const deps = createTestDeps();
		deps.live.usage = { usedMinutes: 100, limitMinutes: 100 };
		const storage = vi.spyOn(deps.live, "storage");
		for (const path of ["/", "/games", "/fixture"]) {
			const page = await (await makeClient(deps)(path)).text();
			expect(page).not.toContain("Video storage");
			expect(page).not.toContain("<!--alerts-->");
		}
		expect(storage).not.toHaveBeenCalled();
	});

	it("still says when a PlayHQ fixture couldn't be read, to team managers only", async () => {
		const deps = createTestDeps();
		await deps.db.prepare("INSERT INTO playhq_fixtures (team_id, competition, playhq_team_id, url, name, last_error) VALUES (?, 'VJBL', 'abc12345', 'https://www.playhq.com/x', 'Saints U12', 'PlayHQ said 503')").bind(deps.team.id).run();
		await deps.db.prepare("INSERT INTO members (team_id, email, name, role) VALUES (?, 'c@x.com', 'Coach', 'coach')").bind(deps.team.id).run();
		expect(await (await makeClient(deps)("/games")).text()).toContain("<b>PlayHQ couldn't be read</b> for Saints U12");
		expect(await (await makeClient(deps, "c@x.com")("/games")).text()).not.toContain("PlayHQ couldn");
	});
});
