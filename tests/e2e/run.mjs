// Runs the browser tests (started in the podman Playwright image by scripts/e2e.mjs): each scenario on each phone it
// names, against the harness. Chromium plays an Android phone, WebKit an iPhone (no element full screen, as on game
// night), Firefox itself. Prints one line per run; a failure saves a screenshot to /out and the exit code is 1.
// `node run.mjs [words]` runs only scenarios whose name has those words; PHONES=iphone,android picks phones.
import { chromium, devices, firefox, webkit } from "playwright";
import { mkdirSync } from "node:fs";
import { CHROMIUM_FAKE_MEDIA, startBridge } from "./bridge.mjs";
import { fakeCamera } from "./fake-camera.mjs";
import { fakeRecorder } from "./fake-recorder.mjs";
import { startHarness } from "./harness.mjs";
import { helpers } from "./helpers.mjs";
import { scenarios as admin } from "./admin.e2e.mjs";
import { scenarios as goLive } from "./golive.e2e.mjs";
import { scenarios as confirm } from "./confirm.e2e.mjs";
import { scenarios as guard } from "./guard.e2e.mjs";
import { scenarios as help } from "./help.e2e.mjs";
import { scenarios as launch } from "./launch.e2e.mjs";
import { scenarios as layout } from "./layout.e2e.mjs";
import { scenarios as manage } from "./manage.e2e.mjs";
import { scenarios as theme } from "./theme.e2e.mjs";
import { scenarios as photos } from "./photos.e2e.mjs";
import { scenarios as photosPick } from "./photos-pick.e2e.mjs";
import { scenarios as signIn } from "./signin.e2e.mjs";
import { scenarios as upload } from "./upload.e2e.mjs";
import { scenarios as videos } from "./videos.e2e.mjs";
import { scenarios as viewer } from "./viewer.e2e.mjs";

// An iPhone has no element full screen (game night, 23 Oct 2026: the phone logged fs=undefined), so it's taken away if
// the WebKit build has it. WebKit here has no camera or recorder either: fake-camera.mjs and fake-recorder.mjs stand in.
const noElementFullScreen = () => {
	delete Element.prototype.requestFullscreen;
	delete Element.prototype.webkitRequestFullscreen;
};

// Headless Chromium and Firefox refuse the screen lock (a phone's browser grants it to a page that's on screen), so it's
// granted here; scenarios that need it refused or watched replace it.
const grantedWakeLock = () => {
	Object.defineProperty(navigator, "wakeLock", { configurable: true, value: { request: async () => Object.assign(new EventTarget(), { released: false, release: async () => {} }) } });
};

const PHONES = {
	android: { launch: () => chromium.launch({ args: CHROMIUM_FAKE_MEDIA }), context: { ...devices["Pixel 7"], permissions: ["camera", "microphone"] }, init: [grantedWakeLock] },
	iphone: { launch: () => webkit.launch(), context: { ...devices["iPhone 13"] }, init: [noElementFullScreen, fakeCamera, fakeRecorder] },
	firefox: {
		launch: () => firefox.launch({ firefoxUserPrefs: { "media.navigator.streams.fake": true, "media.navigator.permission.disabled": true, "media.peerconnection.ice.obfuscate_host_addresses": false } }),
		context: { viewport: { width: 412, height: 915 }, hasTouch: true },
		init: [grantedWakeLock],
	},
};

// WebKit's words for a fetch the page was making when it reloaded.
const CUT_BY_RELOAD = /^(?:\w*Error: )?Fetch API cannot load .* due to access control checks\.?$/;

const filter = process.argv.slice(2).join(" ").toLowerCase();
const only = process.env.PHONES?.split(",") ?? Object.keys(PHONES);
const OUT = "/out";
mkdirSync(OUT, { recursive: true });

const bridgeUrl = "http://127.0.0.1:8799/bridge";
let bridge = null;
const harness = await startHarness({ publicDir: "/repo/public", bridge: { answerWhip: (o) => bridge.answerWhip(o), answerWhep: (o) => bridge.answerWhep(o) } });
harness.page("/bridge", () => "<!doctype html><title>bridge</title>");
bridge = await startBridge(chromium, bridgeUrl);

const all = [...goLive, ...viewer, ...photos, ...photosPick, ...upload, ...videos, ...guard, ...launch, ...confirm, ...admin, ...help, ...layout, ...manage, ...theme, ...signIn].filter((s) => !filter || s.name.toLowerCase().includes(filter));
const results = [];
for (const phoneName of only) {
	const phone = PHONES[phoneName];
	const browser = await phone.launch();
	for (const scenario of all.filter((s) => s.phones.includes(phoneName))) {
		harness.reset();
		harness.page("/bridge", () => "<!doctype html><title>bridge</title>");
		await bridge.reset();
		const context = await browser.newContext({ ...phone.context, ...(scenario.context ?? {}) });
		for (const init of [phone.init ?? [], scenario.init ?? []].flat()) await context.addInitScript(init);
		const page = await context.newPage();
		const errors = [];
		// WebKit reports a fetch cut short by the page reloading as a page error ("… due to access control checks"), even
		// though the page's own code catches it; anything else the page throws fails the scenario.
		page.on("pageerror", (err) => { if (!(phoneName === "iphone" && CUT_BY_RELOAD.test(String(err)))) errors.push(String(err)); });
		const started = Date.now();
		const t = helpers({ page, harness, bridge, phone: phoneName, errors });
		try {
			await scenario.run(t);
			if (errors.length) throw new Error(`the page threw: ${errors.join(" | ")}`);
			results.push({ ok: true });
			console.log(`ok   [${phoneName}] ${scenario.name} (${((Date.now() - started) / 1000).toFixed(1)} s)`);
		} catch (err) {
			const shot = `${OUT}/${phoneName}-${results.length + 1}.png`;
			await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
			results.push({ ok: false });
			console.log(`FAIL [${phoneName}] ${scenario.name}\n     ${String(err.message ?? err).split("\n")[0]}\n     screenshot: ${shot}`);
		}
		await context.close();
	}
	await browser.close();
}
await bridge.close();
await harness.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed && 1);
