// The families' live player on the game page (public/whep.js): the picture from a filming phone, about a second behind.
import { GAME_ID, livePlayerPage } from "./pages.mjs";

export const scenarios = [
	{
		name: "a family's player shows the live picture",
		phones: ["android", "iphone", "firefox"],
		async run(t) {
			t.harness.page("/game", () => livePlayerPage(`${t.harness.url}/whep/${GAME_ID}`));
			await t.page.goto(`${t.harness.url}/game`);
			await t.until(() => t.page.evaluate(() => document.querySelector("video[data-whep]").videoWidth > 0), "a frame of the live picture to show", 20_000);
		},
	},
	{
		name: "a family's player picks the picture back up after the phone's connection drops",
		phones: ["android", "firefox"],
		async run(t) {
			t.harness.page("/game", () => livePlayerPage(`${t.harness.url}/whep/${GAME_ID}`));
			await t.page.goto(`${t.harness.url}/game`);
			const playing = () => t.page.evaluate(() => document.querySelector("video[data-whep]").currentTime);
			await t.until(async () => (await playing()) > 1, "the live picture to play", 20_000);
			await t.bridge.reset();
			await t.until(() => t.harness.calls(`POST /whep/${GAME_ID}`).length >= 2, "the player to ask for the picture again", 45_000);
			// A new connection starts its clock again, so it's playing when its time moves on.
			await t.until(async () => {
				const a = await playing();
				await t.page.waitForTimeout(1500);
				return (await playing()) > a + 0.5;
			}, "the picture to play again", 20_000);
		},
	},
	{
		name: "a family's player gets the picture back by itself after the filming phone goes and comes back",
		phones: ["android", "firefox"],
		async run(t) {
			t.harness.page("/game", () => livePlayerPage(`${t.harness.url}/whep/${GAME_ID}`));
			await t.page.goto(`${t.harness.url}/game`);
			const waiting = () => t.page.evaluate(() => !document.querySelector("[data-live-wait]").hidden);
			const asked = () => t.harness.calls(`POST /whep/${GAME_ID}`).length;
			await t.until(() => t.page.evaluate(() => document.querySelector("video[data-whep]").currentTime > 1), "the live picture to play", 20_000);
			await t.bridge.phoneGone();
			await t.until(waiting, "the card that says the stream will resume", 15_000);
			// The player's connection stays up with nothing on it, so it has to ask again by itself; and again, since the
			// phone is still gone.
			await t.until(() => asked() >= 2, "the player to ask for the picture again", 30_000);
			await t.bridge.phoneBack();
			await t.until(() => asked() >= 3, "the player to keep asking while it has no picture", 40_000);
			await t.until(async () => !(await waiting()), "the picture to be back, and the card gone", 20_000);
		},
	},
];
