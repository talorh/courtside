// The Home Screen app's launch (a spinner rather than a white screen): /?app answers
// the spinner straight away, which opens Home in its own place. The spinner carries its own look, so it's right even
// when the site's stylesheet hasn't arrived.
import { startPage } from "./pages.mjs";

export const scenarios = [
	{
		name: "launch: the app opens on the spinner, then Home in its place, and Back doesn't go back to the spinner",
		phones: ["android", "iphone", "firefox"],
		async run(t) {
			t.harness.page("/", startPage);
			await t.page.goto(`${t.harness.url}/?app`);
			await t.until(async () => new URL(t.page.url()).search === "" && (await t.text("h1")) === "Home", "Home in the spinner's place");
			t.check((await t.text(".brand")).includes("Saints B12.1"), "the team's name in the top bar");
			await t.page.goBack().catch(() => {});
			t.check(!t.page.url().includes("?app"), `Back doesn't return to the spinner (at ${t.page.url()})`);
		},
	},
	{
		name: "launch: the spinner looks right with no stylesheet: club green, a small club's mark, the name, the ball",
		phones: ["android", "iphone", "firefox"],
		async run(t) {
			t.harness.page("/", startPage);
			// The stylesheet never arrives, and the spinner stays (landing.js would open Home in its place).
			await t.page.route("**/app.css", (route) => route.abort());
			await t.page.route("**/landing.js", (route) => route.abort());
			await t.page.goto(`${t.harness.url}/?app`);
			const look = await t.page.evaluate(() => {
				const css = (s) => getComputedStyle(document.querySelector(s));
				return { bg: css("body").backgroundImage, mark: document.querySelector(".launchmark").getBoundingClientRect().width,
					name: css(".launchname").textTransform, ball: css(".launchball").width };
			});
			t.check(look.bg.includes("gradient"), `the club green behind it (${look.bg})`);
			t.check(look.mark > 0 && look.mark <= 150, `the club's mark is small (${look.mark} px)`);
			t.check(look.name === "uppercase", `the name in capitals (${look.name})`);
			t.check(look.ball === "96px", `the ball is its own size (${look.ball})`);
		},
	},
];
