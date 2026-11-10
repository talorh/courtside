// Choosing several photos on the Photos page (public/photos-pick.js): Select photos, tap the
// ones wanted, then Download them as one zip or, on an iPhone, Save to Photos through the share menu; Delete only
// when every chosen one is the person's own.
import { readFileSync } from "node:fs";
import { photosPageWithThree } from "./pages.mjs";

// The phone's share menu, standing in for the real one: notes the files it was given (WebKit here has none).
const shareMenu = () => {
	Object.defineProperty(navigator, "canShare", { configurable: true, value: (data) => Boolean(data?.files?.length) });
	Object.defineProperty(navigator, "share", { configurable: true, value: async (data) => { window.shared = data.files.map((f) => ({ name: f.name, type: f.type, size: f.size })); } });
};

/** The Photos page, each photo's download, and the zip, noting what the zip was asked for. */
function serve(t) {
	const jpeg = readFileSync("/repo/public/technical-difficulties.jpg");
	const asked = [];
	t.harness.page("/photos", photosPageWithThree);
	for (const id of [7, 8, 9]) {
		t.harness.page(`/photos/${id}/download`, () => ({ headers: { "Content-Type": "image/jpeg", "Content-Disposition": `attachment; filename="saints-b12-1-2026-10-23-photo-${id}.jpg"` }, body: jpeg }));
	}
	t.harness.page("/photos/download", (address) => {
		asked.push(address.searchParams.getAll("id").join(","));
		return { headers: { "Content-Type": "application/zip", "Content-Disposition": 'attachment; filename="saints-b12-1-photos-2026-10-24.zip"' }, body: "zip" };
	});
	return { jpeg, asked };
}

const shown = (t, selector) => t.page.locator(selector).isVisible();

export const scenarios = [
	{
		name: "choosing photos: a tap ticks one rather than opening it; Delete only when they're all yours; Download gets them as one zip",
		phones: ["android", "firefox"],
		async run(t) {
			const { asked } = serve(t);
			await t.page.goto(`${t.harness.url}/photos`);
			t.check(!(await shown(t, "#pickbar")), "no bar before Select photos");
			await t.tap("#pick-start");
			await t.tap("#p8");
			await t.tap("#p7");
			t.check(t.page.url().endsWith("/photos"), "the page staying put while choosing");
			t.check((await t.text("#pick-count")) === "2 chosen", `two chosen (said "${await t.text("#pick-count")}")`);
			t.check(await shown(t, "#pickbar .confirm summary"), "Delete offered: both are theirs");
			await t.tap("#p9");
			t.check(!(await shown(t, "#pickbar .confirm summary")), "no Delete once someone else's is chosen");
			t.check(await shown(t, "#pick-note"), "saying only their own can be deleted");
			const [download] = await Promise.all([t.page.waitForEvent("download", { timeout: 10_000 }), t.tap("#pick-download")]);
			t.check(download.suggestedFilename() === "saints-b12-1-photos-2026-10-24.zip", `the zip downloaded (got ${download.suggestedFilename()})`);
			t.check(asked[0] === "9,8,7", `the three asked for (asked "${asked[0]}")`);
			await t.tap("#pick-cancel");
			t.check(!(await shown(t, "#pickbar")) && (await t.page.locator("input[name=id]:checked").count()) === 0, "Cancel clears them and hides the bar");
		},
	},
	{
		name: "deleting chosen photos sends each one with the question answered",
		phones: ["android"],
		async run(t) {
			serve(t);
			let sent = null;
			t.harness.answer("POST /photos/delete", ({ text }) => { sent = text; return { status: 303, location: "/photos" }; });
			await t.page.goto(`${t.harness.url}/photos`);
			await t.tap("#pick-start");
			await t.tap("#p8");
			await t.tap("#p7");
			await t.tap("#pickbar .confirm summary");
			await t.tap("#pickbar .confirm button.danger");
			await t.until(() => sent, "the delete to be sent");
			t.check(sent === "_team=b12.1-2026&confirm=yes&id=8&id=7", `the two chosen, confirmed, for this team (sent "${sent}")`);
		},
	},
	{
		name: "choosing photos on an iPhone: Save to Photos opens the share menu with them all, named as each downloads",
		phones: ["iphone"],
		init: [shareMenu],
		async run(t) {
			const { jpeg, asked } = serve(t);
			await t.page.goto(`${t.harness.url}/photos`);
			await t.tap("#pick-start");
			await t.tap("#p9");
			await t.tap("#p7");
			t.check((await t.text("#pick-download")) === "Save to Photos", `the button saying Save to Photos (it says "${await t.text("#pick-download")}")`);
			await t.tap("#pick-download");
			const files = await t.until(() => t.page.evaluate(() => window.shared), "the share menu to open with the photos");
			t.check(JSON.stringify(files) === JSON.stringify([9, 7].map((id) => ({ name: `saints-b12-1-2026-10-23-photo-${id}.jpg`, type: "image/jpeg", size: jpeg.length }))), `both in the share menu (got ${JSON.stringify(files)})`);
			t.check(asked.length === 0 && t.page.url().endsWith("/photos"), "no zip, and the page staying put");
		},
	},
];
