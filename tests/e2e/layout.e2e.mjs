// Home's small buttons (Roster to Help) on a desktop screen and a phone (Notifications once ran
// out of its box on a computer): every button holds its words, Switch team at the top too, and the page never scrolls sideways.
import { homeManagerPage } from "./pages.mjs";

const spilling = (t) => t.page.evaluate(() => [...document.querySelectorAll(".homemore .btn, .brand")]
	.filter((b) => b.scrollWidth > b.clientWidth + 1).map((b) => b.textContent.trim()));
const sideways = (t) => t.page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
// Help, light or dark, and sign out stay on the team's name's line (the door went to a line of its own once).
const oneRow = (t) => t.page.evaluate(() => {
	const top = (s) => document.querySelector(s)?.getBoundingClientRect().top ?? -1;
	return [".helpbtn", ".signoutbtn"].every((s) => Math.abs(top(s) - top(".helpbtn")) < 2 && top(s) < top(".brand") + 30);
});

export const scenarios = [
	{
		name: "layout: Home's buttons hold their words on a phone and a desktop screen, Switch team too",
		phones: ["android", "iphone", "firefox"],
		async run(t) {
			t.harness.page("/", homeManagerPage);
			// A small Android (360 px), the phone itself, and two computer screens.
			for (const width of [360, null, 845, 1280]) {
				const where = width ? `${width} px wide` : "on the phone";
				if (width) await t.page.setViewportSize({ width, height: 800 });
				await t.page.goto(`${t.harness.url}/`);
				const out = await spilling(t);
				t.check(out.length === 0, `${where}: every button holds its words (spilling: ${out.join(", ")})`);
				t.check(!(await sideways(t)), `${where}: the page doesn't scroll sideways`);
				t.check(await oneRow(t), `${where}: Help, light or dark and sign out stay beside the team's name and Switch team`);
			}
		},
	},
];
