import { describe, expect, it } from "vitest";
import { buildAdminRouter } from "../../../src/features/admin/admin-routes.ts";
import { form, makeClient, MANAGER } from "../../helpers/app.ts";
import { createTestDeps } from "../../helpers/fakes.ts";
import { addMember, addTeam, G14_5 } from "../../helpers/two-teams.ts";

// The admin area's own pages (its router also has /changelog, the old address, which only redirects), and its old
// addresses that only redirect now (Insights' old /admin/insights, and Alerts' when it was Support's second tab).
const ROUTES = buildAdminRouter().list().filter((r) => r.path.startsWith("/admin"));
const REDIRECTS = ["/admin/insights", "/admin/support/alerts"];
// A route's :id: a support ticket's number on the desk, else a team's id.
const withId = (path: string) => path.replace(":id", path.startsWith("/admin/support/") ? "1" : G14_5.id);
const ADMIN_GETS = ROUTES.filter((r) => r.method === "GET" && !REDIRECTS.includes(r.path)).map((r) => withId(r.path));
// Downloads (a report for Excel, a list as CSV) are files, not pages in the layout.
const isFile = (path: string) => /\.(xlsx|csv)$/.test(path);
const ADMIN_PAGES = ADMIN_GETS.filter((p) => !isFile(p)), ADMIN_FILES = ADMIN_GETS.filter(isFile);
const ADMIN_POSTS = ROUTES.filter((r) => r.method === "POST").map((r) => withId(r.path));

async function people() {
	const deps = createTestDeps();
	await addTeam(deps.db);
	await addMember(deps.db, deps.team.id, "manager@x.com", "manager");
	await addMember(deps.db, deps.team.id, "p@x.com", "watcher");
	await deps.db.prepare(`INSERT INTO support_requests (source, alert_kind, title, topic, message, created_at, updated_at)
		VALUES ('site', 'images', 'Photos are near Images'' 100,000', 'platform', 'x', '2026-10-14T00:00:00.000Z', '2026-10-14T00:00:00.000Z')`).run();
	return deps;
}

describe("the admin area", () => {
	it("is not found for anyone but an admin, page or post, with no hint it exists", async () => {
		const deps = await people();
		for (const email of ["manager@x.com", "p@x.com", "nobody@x.com"]) {
			for (const path of ["/admin", ...ADMIN_GETS, ...REDIRECTS]) {
				const res = await makeClient(deps, email)(path);
				expect(res.status, `${email} ${path}`).toBe(404);
				expect(await res.text()).not.toMatch(/admin/i);
			}
			for (const path of ADMIN_POSTS) {
				const res = await makeClient(deps, email)(path, form({ confirm: "yes", code: "g14.6", season: "2026", managerName: "X", managerEmail: "x@x.com", when: "due", confirmCode: "g14.5" }));
				expect(res.status, `${email} POST ${path}`).toBe(404);
			}
		}
		expect(await deps.db.prepare("SELECT status, code FROM teams WHERE id = ?").bind(G14_5.id).first()).toEqual({ status: "active", code: "g14.5" });
		expect(await deps.db.prepare("SELECT COUNT(*) AS n FROM admin_log").first("n")).toBe(0);
	});

	it("gives an admin every page, in the admin layout", async () => {
		const deps = await people();
		for (const path of ["/admin", ...ADMIN_PAGES]) {
			const res = await makeClient(deps)(path);
			expect(res.status, path).toBe(200);
			const page = await res.text();
			expect(page).toContain('<meta name="robots" content="noindex,nofollow">');
			expect(page).toContain("<b>Courtside</b><small>Site admin</small>");
			for (const link of ["Insights", "Teams", "Support", "Platform", "Admins", "Changelog", "Log", "Documentation"]) expect(page, `${path} ${link}`).toMatch(new RegExp(`<a href="/admin[^"]*"[^>]*>(?:(?!</a>).)*<span>${link}</span>`, "s"));
			expect(page, `${path}: no team name in the sidebar`).not.toContain("teampill");
		}
		expect(ADMIN_FILES.length).toBeGreaterThan(0);
		for (const path of ADMIN_FILES) {
			const res = await makeClient(deps)(path);
			expect(res.status, path).toBe(200);
			expect(res.headers.get("Content-Disposition"), path).toMatch(/^attachment; filename="site-/);
		}
	});

	it("refuses a cross-site post as everywhere", async () => {
		const deps = await people();
		const res = await makeClient(deps)("/admin/teams", { ...form({ code: "g14.6" }), headers: { Origin: "https://evil.test" } });
		expect(res.status).toBe(403);
	});

	it("shows Admin in a team's small links to admins only", async () => {
		const deps = await people();
		expect(await (await makeClient(deps, MANAGER)("/help")).text()).toMatch(/<a href="\/admin"><svg[^]*?<\/svg>Admin<\/a>/);
		expect(await (await makeClient(deps, "manager@x.com")("/help")).text()).not.toContain('href="/admin"');
	});

	it("is where an admin on no team's list lands", async () => {
		const deps = await people();
		await deps.db.prepare("UPDATE members SET removed_at = '2026-10-28T00:00:00.000Z' WHERE email = ?").bind(MANAGER).run();
		const home = await makeClient(deps, { team: null })("/");
		expect([home.status, home.headers.get("Location")]).toEqual([302, "/admin"]);
		const admin = await makeClient(deps, { team: null })("/admin");
		expect(admin.status).toBe(200);
		expect(await admin.text()).not.toContain("Choose a team");
	});

	it("puts a team cookie that's no use right, as a team's pages do", async () => {
		const deps = await people();
		const res = await makeClient(deps, { adminTeam: "b99.9-2026" })("/admin");
		expect(res.headers.getSetCookie()).toContain("admin_team=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0");
		expect(await res.text()).not.toContain("teampill");
	});
});
