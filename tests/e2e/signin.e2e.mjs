// The sign-in page (the site's own sign-in): the email, then the code from the email,
// on a phone. The harness plays the site: a known email gets the code step, 482 913 is the code, anything else is wrong.
import { signInCodePage, signInEmailPage, startPage } from "./pages.mjs";

const EMAIL = "family@example.com", CODE = "482913";
// Cloudflare's Turnstile script, stood in (no outside calls here): each widget gets its token field, filled a moment
// later, as the real one does once it's sure a person is there. A tap before then waits for it (signin.js).
const TURNSTILE_STAND_IN = `window.turnstile = { reset() {} };
for (const el of document.querySelectorAll(".cf-turnstile")) {
	const input = Object.assign(document.createElement("input"), { type: "hidden", name: "cf-turnstile-response" });
	el.append(input);
	setTimeout(() => { input.value = "e2e-token"; }, 800);
}`;
const sideways = (t) => t.page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);

export const scenarios = [
	{
		name: "sign in: the email, then the code (a wrong one says so), then the page they wanted; Send a new code waits a minute",
		phones: ["android", "iphone", "firefox"],
		async run(t) {
			await t.page.route("https://challenges.cloudflare.com/turnstile/v0/api.js", (route) => route.fulfill({ contentType: "text/javascript", body: TURNSTILE_STAND_IN }));
			const tokens = [];
			t.harness.page("/signin", signInEmailPage);
			t.harness.page("/", startPage);
			t.harness.answer("POST /signin", ({ text }) => {
				tokens.push(new URLSearchParams(text).get("cf-turnstile-response"));
				return { status: 200, html: signInCodePage(new URLSearchParams(text).get("email")) };
			});
			t.harness.answer("POST /signin/code", ({ text }) => {
				const form = new URLSearchParams(text);
				return form.get("code").replace(/\s/g, "") === CODE ? { status: 303, location: "/" } : { status: 400, html: signInCodePage(form.get("email"), "wrong") };
			});
			await t.page.goto(`${t.harness.url}/signin?next=%2F`);
			t.check((await t.text("h1")) === "Log in to Courtside", "the sign-in heading");
			t.check(!(await sideways(t)), "the sign-in page doesn't scroll sideways");
			await t.page.fill('input[name="email"]', EMAIL);
			await t.tap('form[action="/signin"] button.primary');
			await t.until(() => t.visible('input[name="code"]'), "the code step");
			t.check(tokens.length === 1 && tokens[0] === "e2e-token", `the code was asked for once, with Turnstile's token, waited for (sent ${JSON.stringify(tokens)})`);
			t.check(await t.page.locator('form[action="/signin"] .cf-turnstile').count() === 1, "Send a new code has its own Turnstile widget");
			t.check((await t.page.locator(".signin .pad p").first().textContent()).includes(`We've sent a code to ${EMAIL}`), "the code step names the email");
			t.check((await t.text("[data-resend]")).startsWith("Send a new code (ready in"), `Send a new code waits a minute (read "${await t.text("[data-resend]")}")`);
			t.check(await t.page.locator("[data-resend]").isDisabled(), "Send a new code is disabled while it waits");
			t.check(!(await sideways(t)), "the code step doesn't scroll sideways");
			// Six digits log in by themselves (signin.js), no tap: as a code pasted or filled in from the email would.
			await t.page.fill('input[name="code"]', "000000");
			await t.until(async () => (await t.text(".note.warn").catch(() => "")).includes("That code isn't right"), "the wrong-code note");
			t.check(await t.visible('input[name="code"]'), "the code field is back for another go");
			await t.page.fill('input[name="code"]', "482 913");
			await t.until(async () => new URL(t.page.url()).pathname === "/" && (await t.text("h1")) === "Home", "Home after the right code");
		},
	},
];
