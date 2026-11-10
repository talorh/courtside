import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { makeClient, MANAGER } from "../../helpers/app.ts";
import { createTestDeps, type TestDeps } from "../../helpers/fakes.ts";

// Every section, in the navigation's order, and its address.
const SECTIONS = [
	["Insights", "/admin"], ["Teams", "/admin/teams"], ["Support", "/admin/support"],
	["Platform", "/admin/platform"], ["Costs", "/admin/costs"], ["Admins", "/admin/admins"], ["Changelog", "/admin/changelog"], ["Log", "/admin/log"],
] as const;

/** The navigation's link to `href`, its icon, label and any count, as one string. */
const navLink = (page: string, href: string) => new RegExp(`<a href="${href}"(?: aria-current="page")?>(?:(?!</a>).)*</a>`, "s").exec(page)?.[0] ?? "";

async function ask(deps: TestDeps) {
	await deps.db.prepare(`INSERT INTO support_requests (team_id, member_id, topic, message, contact, created_at)
		SELECT team_id, id, 'other', 'Help', 'x', '2026-10-28T00:00:00.000Z' FROM members WHERE email = ?`).bind(MANAGER).run();
}
const alert = (deps: TestDeps, kind: string, level: string) => deps.db
	.prepare("INSERT INTO platform_alerts (kind, level, detail, checked_at) VALUES (?, ?, 'x', '2026-10-28T00:00:00.000Z')").bind(kind, level).run();

describe("the admin area's frame (a landing page, Insights first, more modern)", () => {
	it("lands on Insights, with its own stylesheet and every section in the navigation, the one you're on marked", async () => {
		const page = await (await makeClient(createTestDeps())("/admin")).text();
		expect(page).toContain('<body class="admin">');
		expect(page).toContain('<link rel="stylesheet" href="/admin.css">');
		expect(page).toContain('<script type="module" src="/admin.js"></script>');
		expect(page).toContain("<h1>Insights</h1>");
		const order = SECTIONS.map(([label, href]) => {
			const link = navLink(page, href);
			expect(link, label).toContain(`<span>${label}</span>`);
			return page.indexOf(link);
		});
		expect(order).toEqual([...order].sort((a, b) => a - b));
		expect(navLink(page, "/admin")).toContain('aria-current="page"');
		expect(page.match(/aria-current="page"/g)).toHaveLength(1);
	});

	it("has Teams at its own address, and sends Insights' old one to the landing page", async () => {
		const client = makeClient(createTestDeps());
		const teams = await (await client("/admin/teams")).text();
		expect(teams).toContain("<h1>Teams</h1>");
		expect(navLink(teams, "/admin/teams")).toContain('aria-current="page"');
		const old = await client("/admin/insights");
		expect([old.status, old.headers.get("Location")]).toEqual([302, "/admin"]);
	});

	it("counts tickets needing an answer beside Support, and alerts that aren't ok beside Insights, red when one is urgent", async () => {
		const deps = createTestDeps();
		const quiet = await (await makeClient(deps)("/admin/log")).text();
		expect(quiet).not.toContain('class="count');
		await ask(deps);
		await alert(deps, "images", "warn");
		await alert(deps, "stream_storage", "ok");
		const page = await (await makeClient(deps)("/admin/log")).text();
		expect(navLink(page, "/admin/support")).toContain('<span class="count" title="1 waiting for an answer" aria-hidden="true">1</span><span class="sr">, 1 waiting for an answer</span>');
		expect(navLink(page, "/admin/platform")).not.toContain('class="count');
		expect(navLink(page, "/admin/support")).not.toContain('title="1 alert"');
		expect(navLink(page, "/admin")).toContain('<span class="count" title="1 alert" aria-hidden="true">1</span>');
		await alert(deps, "daily_job", "urgent");
		expect(navLink(await (await makeClient(deps)("/admin/log")).text(), "/admin")).toContain('<span class="count urgent" title="2 alerts, one urgent" aria-hidden="true">2</span>');
	});

	it("keeps light or dark and sign out, with no team name (not needed)", async () => {
		const page = await (await makeClient(createTestDeps())("/admin")).text();
		expect(page).not.toContain("teampill");
		expect(page).not.toContain("Saints B12.1</a>");
		expect(page).toContain('id="theme-toggle"');
		expect(page).toContain('href="/signout" data-signout');
	});

	it("can be switched to the phone's view on a computer and back, as a team's pages can (the choice is per device)", async () => {
		const page = await (await makeClient(createTestDeps())("/admin/log")).text();
		expect(page).toContain('<script src="/theme.js"></script><script src="/view.js"></script>');
		expect(page).toContain('<button class="viewswitch" type="button" data-view-to="mobile">Switch to mobile view</button>');
		expect(page).toContain('<button class="viewswitch" type="button" data-view-to="desktop">Switch to desktop view</button>');
		// The sidebar applies only while the phone's view isn't chosen.
		const css = readFileSync("public/admin.css", "utf8");
		const desktop = css.slice(css.indexOf("@media (min-width:1024px){"), css.indexOf("/* A page's head"));
		for (const rule of desktop.split("\n").slice(1, -2).filter((l) => l.includes("{") && !l.trim().startsWith("/*"))) {
			expect(rule.trim(), rule).toMatch(/^html:not\(\[data-view="mobile"\]\) |^html\[data-view="mobile"\] /);
		}
	});
});
