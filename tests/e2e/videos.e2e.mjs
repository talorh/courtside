// Saving a game's video and its highlight clips on a phone (public/video-save.js). On an iPhone a clip
// goes through the share menu (Save Video puts it in Photos); a whole game (1 to 3 GB) still goes to Files, opened in
// Safari from the Home Screen app so the app isn't left on a page with no way back. Elsewhere, plain downloads.
import { CLIP_ID, GAME_ID, gamePageWithClip } from "./pages.mjs";

const VIDEO = 41;
const CLIP_NAME = "saints-b12-1-2026-10-30-practice-match-vs-northside-2-clip-steal.mp4";
const GAME_NAME = "saints-b12-1-2026-10-30-practice-match-vs-northside-2.mp4";
const MP4 = Buffer.alloc(300_000, 7); // stands in for a clip's MP4 from Stream

// The phone's share menu, standing in for the real one: notes the files it was given.
const shareMenu = () => {
	Object.defineProperty(navigator, "canShare", { configurable: true, value: (data) => Boolean(data?.files?.length) });
	Object.defineProperty(navigator, "share", { configurable: true, value: async (data) => { window.shared = data.files.map((f) => ({ name: f.name, type: f.type, size: f.size })); } });
};
const homeScreenApp = () => { Object.defineProperty(navigator, "standalone", { get: () => true }); };

/** The game page, the site's download links (JSON for a phone, a redirect for a link) and Stream's MP4s. */
function serveGame(t) {
	const url = t.harness.url;
	const json = (data) => ({ headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ok: true, data }) });
	const mp4 = (name) => () => ({ headers: { "Content-Type": "video/mp4", "Content-Disposition": `attachment; filename="${name}"`, "Content-Length": String(MP4.length) }, body: MP4 });
	t.harness.page("/game", () => gamePageWithClip(VIDEO));
	t.harness.page(`/api/clips/${CLIP_ID}/download`, () => json({ url: `${url}/stream/clip.mp4`, name: CLIP_NAME }));
	t.harness.page(`/clips/${CLIP_ID}/download`, () => ({ status: 302, headers: { Location: `${url}/stream/clip.mp4` }, body: "" }));
	t.harness.page(`/api/videos/${VIDEO}/download/hd`, () => json({ url: `${url}/stream/game.mp4`, name: GAME_NAME }));
	t.harness.page(`/videos/${VIDEO}/download/hd`, () => ({ status: 302, headers: { Location: `${url}/stream/game.mp4` }, body: "" }));
	t.harness.page("/stream/clip.mp4", mp4(CLIP_NAME));
	t.harness.page("/stream/game.mp4", mp4(GAME_NAME));
}

const clipButton = `[data-save-clip="${CLIP_ID}"]`, gameButton = `[data-save-game="${VIDEO}"]`;
const words = (t, selector) => t.text(selector).then((s) => s.replace(/\s+/g, " "));

export const scenarios = [
	{
		name: "saving a highlight clip: on an iPhone, the share menu's Save Video; elsewhere both downloads stay plain",
		phones: ["android", "iphone", "firefox"],
		init: [shareMenu],
		async run(t) {
			serveGame(t);
			await t.page.goto(`${t.harness.url}/game`);
			if (t.phone === "iphone") {
				t.check((await words(t, clipButton)).startsWith("Save"), `the clip's button saying Save (it says "${await words(t, clipButton)}")`);
				t.check((await t.text("[data-save-clip-hint]")).includes("then Save Video in the share menu"), "how to save a clip from the share menu");
				await t.tap(clipButton);
				const shared = await t.until(() => t.page.evaluate(() => window.shared), "the share menu to open with the clip");
				t.check(shared.length === 1 && shared[0].name === CLIP_NAME && shared[0].type === "video/mp4" && shared[0].size === MP4.length,
					`the clip itself in the share menu (got ${JSON.stringify(shared)})`);
				t.check(t.page.url().endsWith("/game"), "the page staying put");
			} else {
				t.check((await words(t, clipButton)).startsWith("Download"), `the clip's button saying Download (it says "${await words(t, clipButton)}")`);
				const [clip] = await Promise.all([t.page.waitForEvent("download", { timeout: 10_000 }), t.tap(clipButton)]);
				t.check(clip.suggestedFilename() === CLIP_NAME, `the clip downloaded (got ${clip.suggestedFilename()})`);
				t.check(!(await t.visible("[data-save-game-hint]")) && !(await t.page.getAttribute(gameButton, "target")), "the game's download as it was");
				t.check(!(await t.page.evaluate(() => window.shared)), "no share menu off an iPhone");
			}
		},
	},
	{
		name: "the whole game on an iPhone in Safari: it goes to Files, and the page says how to put it in Photos",
		phones: ["iphone"],
		init: [shareMenu],
		async run(t) {
			serveGame(t);
			await t.page.goto(`${t.harness.url}/game`);
			const hint = await t.text("[data-save-game-hint]");
			t.check(hint.includes("It goes to Files") && hint.includes("Save Video"), `where it goes and how to put it in Photos (said "${hint}")`);
			t.check((await words(t, gameButton)).startsWith("Download HD video") && !(await t.page.getAttribute(gameButton, "target")), "Safari's own download, as before");
		},
	},
	{
		name: "the whole game on an iPhone's Home Screen app: Open in Safari with the game's own link, never a page with no way back",
		phones: ["iphone"],
		init: [shareMenu, homeScreenApp],
		async run(t) {
			serveGame(t);
			await t.page.goto(`${t.harness.url}/game`);
			await t.tap(gameButton);
			await t.until(async () => (await words(t, gameButton)).startsWith("Open in Safari to download"), "the button to become Open in Safari");
			t.check(await t.page.getAttribute(gameButton, "href") === `${t.harness.url}/stream/game.mp4` && await t.page.getAttribute(gameButton, "target") === "_blank",
				"the game's own download link, opening in Safari");
			t.check((await t.text("[data-save-game-hint]")).includes("Save Video"), "how to put it in Photos");
			t.check(t.page.url().endsWith("/game"), "the app staying on the game page");
		},
	},
];
