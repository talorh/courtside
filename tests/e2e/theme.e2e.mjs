// Light or dark: the site starts dark, whatever the phone's own setting, and a switch to light (or back) is kept on that
// phone from then on.
import { homeManagerPage, signInEmailPage } from "./pages.mjs";

const theme = (t) => t.page.evaluate(() => ({ set: document.documentElement.dataset.theme ?? null, bg: getComputedStyle(document.body).backgroundColor }));
// A dark page's background is dark: each of its red, green and blue under 80.
const dark = (bg) => (bg.match(/\d+/g) ?? []).slice(0, 3).every((n) => Number(n) < 80);

export const scenarios = [
	{
		name: "theme: the site starts dark on a phone set to light, and a switch to light is kept",
		phones: ["android", "iphone", "firefox"],
		context: { colorScheme: "light" },
		async run(t) {
			t.harness.page("/", homeManagerPage);
			t.harness.page("/signin", signInEmailPage);
			// Cloudflare's human check isn't reachable here, and isn't what's tested: a stand-in.
			await t.page.route("https://challenges.cloudflare.com/**", (route) => route.fulfill({ contentType: "text/javascript", body: "window.turnstile = { reset() {} };" }));
			await t.page.goto(`${t.harness.url}/signin`);
			const signIn = await theme(t);
			// The sign-in page is club green either way; its boxes and buttons follow the theme.
			t.check(signIn.set === "dark", `the sign-in page starts dark (${JSON.stringify(signIn)})`);
			await t.page.goto(`${t.harness.url}/`);
			const first = await theme(t);
			t.check(first.set === "dark" && dark(first.bg), `Home is dark at first (${JSON.stringify(first)})`);
			await t.page.click("#theme-toggle");
			await t.until(async () => (await theme(t)).set === "light", "the switch to turn it light");
			await t.page.reload();
			const after = await theme(t);
			t.check(after.set === "light" && !dark(after.bg), `light is kept after a reload (${JSON.stringify(after)})`);
			await t.page.click("#theme-toggle");
			await t.page.reload();
			t.check((await theme(t)).set === "dark", "and dark again, once switched back");
		},
	},
];
