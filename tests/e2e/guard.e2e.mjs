// The guard on every write: a page from before an update, or for a team the person has
// left, gets "reload" from the site; the maintenance page answers the API with when it'll be back. Each page says so in
// the site's words and stops, rather than trying again or showing a generic error.
import { GAME_ID, photosPage } from "./pages.mjs";
import { SEL } from "./helpers.mjs";

const ALL = ["android", "iphone", "firefox"];
const RELOAD = "The site has been updated. Reload the page to carry on.";
const MAINTENANCE = "We're upgrading the site. Back by 11:30am.";
const refusal = (code, message, status = 409) => ({ status, json: { ok: false, error: { code, message } } });

/** A small photo the browser draws, as a JPEG file for the picker. */
async function photoFile(page, name) {
	const base64 = await page.evaluate(async () => {
		const canvas = Object.assign(document.createElement("canvas"), { width: 400, height: 300 });
		canvas.getContext("2d").fillRect(0, 0, 400, 300);
		const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
		let text = "";
		for (const b of new Uint8Array(await blob.arrayBuffer())) text += String.fromCharCode(b);
		return btoa(text);
	});
	return { name, mimeType: "image/jpeg", buffer: Buffer.from(base64, "base64") };
}

export const scenarios = [
	{
		name: "guard: adding photos on a page the site asks to reload stops at the first photo and says so",
		phones: ALL,
		async run(t) {
			t.harness.page("/photos", photosPage);
			t.harness.answer("POST /api/photos", () => refusal("site_updated", RELOAD));
			await t.page.goto(`${t.harness.url}/photos`);
			await t.page.setInputFiles("#photo-files", [await photoFile(t.page, "IMG_1.JPG"), await photoFile(t.page, "IMG_2.JPG")]);
			await t.until(async () => (await t.text("#photo-hint")) === RELOAD, "the page to say reload", 30_000);
			t.check(t.harness.calls("POST /api/photos").length === 1, `one photo sent, then it stopped (sent ${t.harness.calls("POST /api/photos").length})`);
			t.check(!t.page.url().includes("done=added"), "no Photos added");
		},
	},
	{
		name: "guard: Go live on a page for a team you've left says to reload, and tries nothing else",
		phones: ALL,
		async run(t) {
			const message = "You switched to Saints G14.5 in another window. Reload this page to carry on.";
			t.harness.answer(`POST /api/live/${GAME_ID}/browser`, () => refusal("team_changed", message));
			await t.openGoLive();
			await t.startCamera();
			await t.picture(1280, 720);
			await t.tap(SEL.live);
			await t.until(async () => (await t.text(SEL.msg)).includes(message), "the page to say reload");
			t.check(!(await t.isFull()), "the camera back in the card");
			t.check(t.starts() === 1, `one try only (${t.starts()})`);
		},
	},
	{
		name: "guard: Go live during maintenance says when the site will be back, not that the signal's weak",
		phones: ALL,
		async run(t) {
			t.harness.answer(`POST /api/live/${GAME_ID}/browser`, () => refusal("maintenance", MAINTENANCE, 503));
			await t.openGoLive();
			await t.startCamera();
			await t.picture(1280, 720);
			await t.tap(SEL.live);
			await t.until(async () => (await t.text(SEL.msg)).includes(MAINTENANCE), "the maintenance page's words");
			t.check(!/signal/.test(await t.text(SEL.msg)), "nothing about the signal");
		},
	},
];
