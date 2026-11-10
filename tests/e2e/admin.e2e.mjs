// View as: an admin tries a team as Watch only from the admin area's Teams page (its More menu), sees what Watch only sees,
// and Stop puts them back as its team manager.
import { adminHome, adminTeamsPage } from "./pages.mjs";

const members = (t) => t.page.locator('a[href="/manage"]').count();

export const scenarios = [
	{
		name: "view as: an admin picks Watch only, sees that Home, taps Stop, and is back as team manager",
		phones: ["android", "iphone", "firefox"],
		async run(t) {
			let viewing = null;
			t.harness.page("/admin/teams", adminTeamsPage);
			t.harness.page("/", () => adminHome(viewing));
			t.harness.answer("POST /view-as", ({ text }) => { viewing = new URLSearchParams(text).get("role"); return { status: 303, location: "/" }; });
			t.harness.answer("POST /view-as/stop", () => { viewing = null; return { status: 303, location: "/" }; });
			await t.page.goto(`${t.harness.url}/admin/teams`);
			// View as is in the team's More menu (the admin area overhauled).
			await t.tap("details.rowmenu summary");
			await t.page.selectOption(".viewas select", "watcher");
			await t.tap(".viewas button");
			await t.until(async () => (await t.page.locator(".adminstrip").count()) > 0 && (await t.text(".adminstrip")).startsWith("Viewing Saints B12.1 as Watch only."), "Watch only's Home, saying so");
			t.check((await members(t)) === 0, "no Manage team link for Watch only");
			await t.tap(".adminstrip button");
			await t.until(async () => (await t.page.locator(".adminstrip").count()) === 0 && (await members(t)) > 0, "Home as team manager again");
			const sent = t.harness.calls("POST /view-as").map((c) => c.route);
			t.check(sent.join(",") === "POST /view-as,POST /view-as/stop", `View as, then Stop (sent ${sent.join(", ")})`);
		},
	},
];
