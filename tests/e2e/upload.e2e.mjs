// The Upload page after a video goes up: the game just uploaded has its video now, so Upload
// another video offers the other games only; with none left, the page says so instead of offering the same game again
// (which the site would refuse).
import { GAME_ID, uploadTestPage } from "./pages.mjs";

const VIDEO = 41;
const file = { name: "game.mp4", mimeType: "video/mp4", buffer: Buffer.alloc(300_000, 1) };

async function uploadOne(t, games) {
	t.harness.page("/upload", () => uploadTestPage(games));
	t.harness.answer("POST /api/uploads", () => ({ status: 201, json: { ok: true, data: { videoId: VIDEO, partSize: 128 * 1024, totalParts: 3 } } }));
	await t.page.goto(`${t.harness.url}/upload`);
	t.check(await t.page.evaluate(() => document.querySelector("#game").value) === String(GAME_ID), "the latest game picked for the upload");
	await t.page.setInputFiles("#file", [file]);
	await t.until(() => t.harness.completed, "the upload to complete", 30_000);
	await t.until(async () => (await t.text("#hint")).startsWith("Uploaded"), "the page to say it's uploaded");
}
const options = (t) => t.page.evaluate(() => [...document.querySelectorAll("#game option")].map((o) => o.value));

export const scenarios = [
	{
		name: "after an upload, Upload another video offers the other games only: the one just uploaded has its video",
		phones: ["android", "iphone"],
		async run(t) {
			await uploadOne(t, 2);
			t.check((await t.text("#pick-text")) === "Upload another video", "the button to offer another upload");
			t.check(JSON.stringify(await options(t)) === '["8"]', `the uploaded game gone from the list (got ${JSON.stringify(await options(t))})`);
			t.check(await t.page.evaluate(() => document.querySelector("#game").value) === "8", "the next game picked");
		},
	},
	{
		name: "the only waiting game uploaded: the page says every game has its video, instead of offering it again",
		phones: ["android"],
		async run(t) {
			await uploadOne(t, 1);
			t.check((await options(t)).length === 0, "no game left to pick");
			t.check(!(await t.visible("#pick")), "no Choose the video button with nothing to upload");
			t.check(/every game has its video/i.test(await t.text("#hint")), `the page saying so (said "${await t.text("#hint")}")`);
		},
	},
];
