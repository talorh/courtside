// Help (as easy to use as possible): searching narrows the questions, and a heading goes with its
// questions, so a team manager isn't left with a page of empty headings; clearing it shows everything again.
import { helpManagerPage } from "./pages.mjs";

/** The page's headings a person can see, in order (a question's own headings, inside its answer, aren't these). */
const headings = (t) => t.page.evaluate(() => [...document.querySelectorAll(".helppage h2, .helppage h3.faqsub")]
	.filter((h) => h.checkVisibility()).map((h) => h.textContent.trim()));

export const scenarios = [
	{
		name: "help: a search shows only the headings with a question that matches; clearing it shows them all again",
		phones: ["android", "iphone", "firefox"],
		async run(t) {
			t.harness.page("/help", helpManagerPage);
			await t.page.goto(`${t.harness.url}/help`);
			await t.page.fill("#help-search", "download photo");
			const shown = ["Ask Virtual Sam", "Running your team", "People", "Videos", "End of the season", "Contact support", "For everyone on the team", "Watching", "Photos"];
			await t.until(async () => (await headings(t)).join("|") === shown.join("|"), `only these headings: ${shown.join(", ")} (saw ${(await headings(t)).join(", ")})`);
			// A part's name goes too when nothing in it matches: AirPlay is only in watching, for everyone.
			await t.page.fill("#help-search", "airplay");
			const families = ["Ask Virtual Sam", "Contact support", "For everyone on the team", "Watching"];
			await t.until(async () => (await headings(t)).join("|") === families.join("|"), `only these headings: ${families.join(", ")} (saw ${(await headings(t)).join(", ")})`);
			// A plural finds the same questions as its singular.
			await t.page.fill("#help-search", "photos");
			await t.page.fill("#help-search", "airplays");
			await t.until(async () => (await headings(t)).join("|") === families.join("|"), `a plural finds its singular (saw ${(await headings(t)).join(", ")})`);
			await t.page.fill("#help-search", "");
			await t.until(async () => (await headings(t)).includes("Players"), "every heading back once the search is cleared");
		},
	},
	{
		name: "help on a computer: laid out as the Documentation, one section at a time from the contents, with its questions down the right",
		phones: ["android"],
		context: { viewport: { width: 1600, height: 900 }, hasTouch: false, isMobile: false, deviceScaleFactor: 1 },
		async run(t) {
			t.harness.page("/help", helpManagerPage);
			await t.page.goto(`${t.harness.url}/help`);
			const sections = await t.page.locator("#helptoc-list a").count();
			t.check(sections > 8 && await t.visible(".helptoc"), `the contents down the left (${sections} sections)`);
			// A team manager's two parts, each named once in the contents, Contact support ending the first.
			const toc = await t.page.locator("#helptoc-list li").evaluateAll((lis) => lis.map((l) => (l.className === "tocpart" ? `# ${l.textContent}` : l.textContent.replace(/^\d+\.\s*/, ""))));
			const parts = toc.filter((x) => x.startsWith("# "));
			t.check(parts.join("|") === "# Running your team|# For everyone on the team", `the two parts named once each (saw ${parts.join(", ")})`);
			t.check(toc.indexOf("Contact support") === toc.indexOf("Removal requests") + 1 && toc.indexOf("Contact support") < toc.indexOf("# For everyone on the team"),
				`Contact support ends Running your team (saw ${toc.join(", ")})`);
			const partNames = await t.page.locator(".partname").evaluateAll((els) => els.filter((e) => e.checkVisibility()).length);
			t.check(partNames === 0, `the parts' names in the contents, not over the section (${partNames} showing)`);
			const shown = () => t.page.evaluate(() => [...document.querySelectorAll(".hp")].filter((el) => el.checkVisibility()).map((el) => el.dataset.page));
			const first = new Set(await shown());
			t.check(first.size === 1 && first.has("0"), `only the first section showing (saw sections ${[...first]})`);
			t.check(!(await t.visible("#help-search")), "the page's own search box is the one down the left");
			await t.page.locator("#helptoc-list a").nth(2).click();
			await t.until(async () => { const now = new Set(await shown()); return now.size === 1 && now.has("2"); }, "the third section alone once it's chosen");
			const current = await t.text("#helptoc-list a[aria-current]");
			t.check(current.startsWith("3."), `the contents marking it (marked "${current}")`);
			const marked = await t.page.getAttribute("#helptoc-list a[aria-current]", "aria-current");
			t.check(marked === "true", `marked for a screen reader too (aria-current="${marked}")`);
			const questions = await t.page.locator("#help-outline a").count();
			t.check(questions >= 2 && await t.visible(".helpoutline"), `On this page listing its questions (${questions})`);
			t.check(await t.visible(".help-pn .prev") && await t.visible(".help-pn .next"), "cards to the sections either side");
			await t.page.fill("#helptoc-q", "download photo");
			await t.until(async () => new Set(await shown()).size > 1, "a search showing matching questions from every section");
			await t.page.fill("#helptoc-q", "");
			await t.until(async () => new Set(await shown()).size === 1, "back to one section once the search is cleared");
		},
	},
	{
		name: "help on a phone: just as it was, every section on the page and none of the computer's contents",
		phones: ["android", "iphone", "firefox"],
		async run(t) {
			t.harness.page("/help", helpManagerPage);
			await t.page.goto(`${t.harness.url}/help`);
			t.check(!(await t.visible(".helptoc")) && !(await t.visible(".helpoutline")) && !(await t.visible(".help-pn")), "no contents, On this page or neighbouring sections");
			const hidden = await t.page.evaluate(() => [...document.querySelectorAll("details.faq")].filter((q) => !q.checkVisibility()).length);
			t.check(hidden === 0, `every question on the page (${hidden} hidden)`);
			t.check(await t.visible("#help-search"), "the page's own search box");
		},
	},
];
