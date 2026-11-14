// Photos (public/photos.js): a parent picks photos on their phone. Each is turned the right
// way up, made smaller and sent with when it was taken, and nothing else the camera wrote (where it was taken too).
import { readFileSync } from "node:fs";
import { cleanJpeg } from "../../src/features/photos/jpeg.ts";
import { exifApp1, hasExif } from "../helpers/jpeg.ts";
import { PHOTO, photoPage, photosPage } from "./pages.mjs";

// The phone's share menu, standing in for the real one: notes the files it was given (WebKit here has none).
const shareMenu = () => {
	Object.defineProperty(navigator, "canShare", { configurable: true, value: (data) => Boolean(data?.files?.length) });
	Object.defineProperty(navigator, "share", { configurable: true, value: async (data) => { window.shared = data.files.map((f) => ({ name: f.name, type: f.type, size: f.size })); } });
};
const noShareMenu = () => {
	Object.defineProperty(navigator, "canShare", { configurable: true, value: undefined });
	Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
};

/** A photo's page, and its download as the site sends it. */
function servePhoto(t) {
	const jpeg = readFileSync("/repo/public/technical-difficulties.jpg");
	t.harness.page("/photo", () => photoPage());
	t.harness.page(`/photos/${PHOTO.id}/download`, () => ({
		headers: { "Content-Type": "image/jpeg", "Content-Disposition": `attachment; filename="saints-b12-1-2026-10-23-photo-${PHOTO.id}.jpg"` }, body: jpeg,
	}));
	return jpeg;
}

/** A photo the browser draws, `width` × `height`, as a JPEG, with `app1` (an EXIF block) where a camera puts it. */
async function photo(page, width, height, app1 = []) {
	const base64 = await page.evaluate(async ([w, h]) => {
		const canvas = Object.assign(document.createElement("canvas"), { width: w, height: h });
		const g = canvas.getContext("2d");
		g.fillStyle = "#0A4A23";
		g.fillRect(0, 0, w, h);
		g.fillStyle = "#fff";
		g.fillRect(0, 0, w / 4, h / 4);
		const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
		let text = "";
		for (const b of new Uint8Array(await blob.arrayBuffer())) text += String.fromCharCode(b);
		return btoa(text);
	}, [width, height]);
	const jpeg = Buffer.from(base64, "base64");
	// After the JFIF header when the browser wrote one, as phones do; otherwise straight after the start.
	const at = jpeg[3] === 0xe0 ? 4 + jpeg.readUInt16BE(4) : 2;
	return Buffer.concat([jpeg.subarray(0, at), Buffer.from(app1), jpeg.subarray(at)]);
}

/** A form post's fields, by name: each one's bytes. */
function fields(body) {
	const boundary = body.subarray(0, body.indexOf("\r\n")).toString();
	const out = {};
	for (let at = boundary.length + 2; ;) {
		const end = body.indexOf(`\r\n${boundary}`, at);
		if (end < 0) return out;
		const part = body.subarray(at, end);
		const split = part.indexOf("\r\n\r\n");
		out[/name="([^"]+)"/.exec(part.subarray(0, split).toString())[1]] = part.subarray(split + 4);
		at = end + 2 + boundary.length + 2;
	}
}

export const scenarios = [
	{
		name: "a filming watcher adds photos: each made smaller on the phone, the right way up, with the location left off",
		phones: ["android", "iphone", "firefox"],
		async run(t) {
			t.harness.page("/photos", photosPage);
			await t.page.goto(`${t.harness.url}/photos`);
			// Taken sideways (EXIF says turn it a quarter clockwise), with when and where it was taken; and a screenshot.
			const sideways = await photo(t.page, 4000, 3000, exifApp1({ taken: "2026:10:23 19:05:12", orientation: 6 }));
			const screenshot = await photo(t.page, 800, 600);
			await t.page.setInputFiles("#photo-files", [
				{ name: "IMG_0001.JPG", mimeType: "image/jpeg", buffer: sideways },
				{ name: "Screenshot.jpg", mimeType: "image/jpeg", buffer: screenshot },
			]);
			await t.until(() => t.page.url().includes("done=added"), "the Photos page once both are in", 30_000);
			await t.until(async () => (await t.text(".note")).includes("Photos added. Nice assist!"), "the thank-you note");
			const sent = t.harness.calls("POST /api/photos").map((c) => fields(c.body));
			t.check(sent.length === 2, `two photos sent (sent ${sent.length})`);
			const [first, second] = sent.map((f) => ({ takenAt: f.takenAt.toString(), jpeg: new Uint8Array(f.photo), size: cleanJpeg(new Uint8Array(f.photo)) }));
			t.check(first.takenAt === "2026-10-23T19:05:12", `the first sent with when it was taken (sent "${first.takenAt}")`);
			t.check(first.size?.width === 1920 && first.size?.height === 2560, `the first upright and 2560 px tall (sent ${first.size?.width} x ${first.size?.height})`);
			t.check(!hasExif(first.jpeg), "the first sent with no EXIF and no location");
			t.check(second.takenAt === "", `the screenshot sent with no date, so the site uses when it was added (sent "${second.takenAt}")`);
			t.check(second.size?.width === 800 && second.size?.height === 600, `the screenshot kept its size (sent ${second.size?.width} x ${second.size?.height})`);
		},
	},
	{
		name: "photos: a dropped connection is tried again; one the site turns down, or the phone can't open, is skipped and said so",
		phones: ["android", "iphone", "firefox"],
		async run(t) {
			t.harness.page("/photos", photosPage);
			let posts = 0;
			const SEASON_OVER = "That photo was taken on Sat 1 Mar 2025, in a season that's over, so it isn't kept here.";
			// The connection drops (Chrome and Firefox send it again themselves), then the site is busy (502): the page tries
			// again; the next photo the site turns down.
			const busy = { status: 502, json: { ok: false, error: { code: "photo_save_failed", message: "Couldn't save the photo just now. Try again in a minute." } } };
			t.harness.answer("POST /api/photos", () => (++posts === 1 ? "drop" : posts === 2 ? busy : posts === 3 ? { status: 201, json: { ok: true, data: { id: 1 } } }
				: { status: 409, json: { ok: false, error: { code: "conflict", message: SEASON_OVER } } }));
			await t.page.goto(`${t.harness.url}/photos`);
			const good = await photo(t.page, 1200, 900), old = await photo(t.page, 1200, 900);
			await t.page.setInputFiles("#photo-files", [
				{ name: "IMG_0002.JPG", mimeType: "image/jpeg", buffer: good },
				{ name: "IMG_0003.JPG", mimeType: "image/jpeg", buffer: old },
				{ name: "IMG_0004.JPG", mimeType: "image/jpeg", buffer: Buffer.from("not a photo") },
			]);
			await t.until(async () => (await t.text("#photo-count")) === "Added 1 of 3", "the page to say 1 of the 3 was added", 30_000);
			const said = await t.text("#photo-hint");
			t.check(said === `Not added: IMG_0003.JPG (${SEASON_OVER.replace(/\.$/, "")}); IMG_0004.JPG (it couldn't be opened).`, `which weren't added, and why (said "${said}")`);
			t.check(posts === 4, `the first photo sent again after the dropped connection and the busy site, then the second (${posts} posts)`);
			t.check(await t.visible("#photo-see"), "a See the photos button");
			t.check(!t.page.url().includes("done=added"), "the page staying put, so the list can be read");
		},
	},
	{
		name: "photos on a weak signal: the first is slow, so the rest go one at a time; a page left part way says so next time",
		phones: ["android", "iphone", "firefox"],
		async run(t) {
			t.harness.page("/photos", photosPage);
			let posts = 0, now = 0, most = 0;
			// The first takes over 5 seconds to answer, the second a moment; from the third the signal's lost. The page is
			// left while it waits to try again (WebKit reports a request cut off by leaving as an error on the page).
			t.harness.answer("POST /api/photos", () => {
				const n = ++posts;
				most = Math.max(most, now + 1);
				if (n >= 3) return "drop";
				now++;
				const ms = n === 1 ? 5_500 : 500;
				setTimeout(() => now--, ms);
				return { delayMs: ms, then: { status: 201, json: { ok: true, data: { id: n } } } };
			});
			await t.page.goto(`${t.harness.url}/photos`);
			const shots = [];
			for (let i = 0; i < 4; i++) shots.push({ name: `IMG_00${i + 10}.JPG`, mimeType: "image/jpeg", buffer: await photo(t.page, 1200, 900) });
			await t.page.setInputFiles("#photo-files", shots);
			await t.until(async () => (await t.text("#photo-hint")).startsWith("Having trouble reaching the server"), "the third photo to wait for the signal", 30_000);
			t.check(most === 1, `one at a time after the slow first (${most} at once at most)`);
			t.page.once("dialog", (d) => d.accept());
			await t.page.goto(`${t.harness.url}/photos`);
			await t.until(async () => (await t.text("#photo-count")) === "Added 2 of 4", "the page to say 2 of the 4 were added last time", 10_000);
			const said = await t.text("#photo-hint");
			t.check(said === "The page was left before the other 2 photos were sent. Choose them again, and keep this page open until they're all in.", `what to do about the rest (said "${said}")`);
			await t.page.reload();
			t.check(!(await t.visible("#photo-progress")), "said once: not again on the next visit");
		},
	},
	{
		name: "photos on a computer: dropping them on Add photos adds them the same way; a file that isn't a photo is listed",
		phones: ["android", "firefox"],
		async run(t) {
			t.harness.page("/photos", photosPage);
			await t.page.goto(`${t.harness.url}/photos`);
			const shots = [await photo(t.page, 1200, 900), await photo(t.page, 900, 1200)].map((b) => b.toString("base64"));
			const lit = await t.page.evaluate((jpegs) => {
				const files = jpegs.map((b64, i) => new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], `IMG_10${i}.JPG`, { type: "image/jpeg" }));
				const dataTransfer = new DataTransfer();
				for (const file of [...files, new File(["team list"], "notes.txt", { type: "text/plain" })]) dataTransfer.items.add(file);
				const box = document.getElementById("addphotos");
				const fire = (type) => box.dispatchEvent(new DragEvent(type, { dataTransfer, bubbles: true, cancelable: true }));
				fire("dragenter");
				fire("dragover");
				const on = box.classList.contains("dragover");
				fire("drop");
				return on && !box.classList.contains("dragover");
			}, shots);
			t.check(lit, "the box lit up while the files were over it, and not after");
			await t.until(async () => (await t.text("#photo-count")) === "Added 2 of 3", "the page to say 2 of the 3 were added", 30_000);
			const said = await t.text("#photo-hint");
			t.check(said === "Not added: notes.txt (it isn't a photo).", `the file that isn't a photo listed (said "${said}")`);
			t.check(t.harness.calls("POST /api/photos").length === 2, `the two photos sent (sent ${t.harness.calls("POST /api/photos").length})`);
		},
	},
	{
		name: "saving a photo: on an iPhone, the share menu's Save Image and no page to get stuck on; elsewhere it downloads",
		phones: ["android", "iphone", "firefox"],
		init: [shareMenu],
		async run(t) {
			const jpeg = servePhoto(t);
			await t.page.goto(`${t.harness.url}/photo`);
			const button = (await t.text("[data-save-photo]")).replace(/\s+/g, " ");
			if (t.phone === "iphone") {
				t.check(button.startsWith("Save photo"), `the button saying Save photo (it says "${button}")`);
				t.check((await t.text("[data-save-hint]")).includes("tap Save Image"), "how to save it from the share menu");
				await t.tap("[data-save-photo]");
				const shared = await t.until(() => t.page.evaluate(() => window.shared), "the share menu to open with the photo");
				t.check(shared.length === 1 && shared[0].name === `saints-b12-1-2026-10-23-photo-${PHOTO.id}.jpg` && shared[0].type === "image/jpeg" && shared[0].size === jpeg.length,
					`the photo itself in the share menu (got ${JSON.stringify(shared)})`);
				t.check(t.page.url().endsWith("/photo"), "the page staying put (a download opened a page with no way back)");
			} else {
				t.check(button.startsWith("Download photo"), `the button saying Download photo (it says "${button}")`);
				const [download] = await Promise.all([t.page.waitForEvent("download", { timeout: 10_000 }), t.tap("[data-save-photo]")]);
				t.check(download.suggestedFilename() === `saints-b12-1-2026-10-23-photo-${PHOTO.id}.jpg`, `the photo downloaded (got ${download.suggestedFilename()})`);
				t.check(!(await t.page.evaluate(() => window.shared)), "no share menu off an iPhone");
			}
		},
	},
	{
		name: "a photo's page on a phone: a swipe left slides to the older photo and right to the newer, in place; a scroll doesn't",
		phones: ["android", "iphone"],
		async run(t) {
			t.harness.page("/photo", () => photoPage({ newer: 9, older: 5 }));
			t.harness.page("/photos/5", () => photoPage({ id: 5, newer: PHOTO.id }));
			t.harness.page("/photos/9", () => photoPage({ id: 9, older: PHOTO.id }));
			const swipe = (dx, dy, ms = 120) => t.page.evaluate(async ([dx, dy, ms]) => {
				const at = document.querySelector(".photoview");
				const fire = (type, x, y) => {
					const e = new Event(type, { bubbles: true });
					Object.defineProperty(e, "touches", { value: type === "touchend" ? [] : [{ clientX: x, clientY: y }] });
					Object.defineProperty(e, "changedTouches", { value: [{ clientX: x, clientY: y }] });
					at.dispatchEvent(e);
				};
				fire("touchstart", 200, 300);
				for (let i = 1; i <= 5; i++) { fire("touchmove", 200 + (dx * i) / 5, 300 + (dy * i) / 5); await new Promise((r) => setTimeout(r, ms / 5)); }
				fire("touchend", 200 + dx, 300 + dy);
			}, [dx, dy, ms]);
			await t.page.goto(`${t.harness.url}/photo`);
			t.check(await t.visible(".swipe-hint"), "the swipe hint shows on a phone");
			await t.until(() => t.page.evaluate(() => document.querySelectorAll(".photoview .slide img.big").length === 3), "the newer and older photos either side");
			t.check(await t.page.evaluate(() => document.querySelectorAll(".photoview .slide img.blur").length === 3), "each with its blurred thumbnail behind it");
			await t.until(() => t.page.evaluate(() => document.querySelectorAll(".photoview .slide img.big.in").length === 3), "the full pictures faded in once loaded");
			// The roll shows this photo, not a neighbour: the middle slide sits exactly over the figure.
			const placed = await t.page.evaluate(() => {
				const fig = document.querySelector(".photoview").getBoundingClientRect(), mid = document.querySelectorAll(".photoview .slide")[1].getBoundingClientRect();
				return { left: Math.round(mid.left - fig.left), width: Math.round(mid.width - fig.width) };
			});
			t.check(placed.left === 0 && placed.width === 0, `the photo's own slide over the figure (${JSON.stringify(placed)})`);
			await t.page.evaluate(() => { window.samePage = true; window.pagesBefore = history.length; });
			await swipe(-20, 240); // a scroll, mostly down
			await t.page.waitForTimeout(400);
			t.check(t.page.url().endsWith("/photo"), "a scroll stays put");
			await swipe(-180, 10);
			await t.page.waitForURL(/\/photos\/5$/, { timeout: 10_000 });
			await t.until(() => t.page.evaluate(() => document.querySelector(".photoview")?.dataset.id === "5" && window.samePage === true), "the page to become photo 5's without a reload");
			t.check(await t.page.evaluate(() => document.querySelector(".photoview").dataset.newer === String(7) && !document.querySelector(".photoview").dataset.older), "photo 5's own neighbours in place");
			// The oldest photo, at the end of the roll: its picture shows (an empty slide beyond it, nothing black in the middle).
			const shown = await t.until(() => t.page.evaluate(() => {
				const slides = [...document.querySelectorAll(".photoview .slide")];
				const big = slides[1]?.querySelector("img.big.in");
				const left = Math.round(slides[1].getBoundingClientRect().left - document.querySelector(".photoview").getBoundingClientRect().left);
				return big && big.naturalWidth > 0 && getComputedStyle(big).opacity === "1" ? { slides: slides.length, beyond: slides[2]?.children.length ?? -1, left, back: document.querySelector(".photoback")?.getAttribute("href") } : null;
			}), "the oldest photo's picture showing in the middle");
			t.check(shown.slides === 3 && shown.beyond === 0, `an empty slide beyond the oldest (${JSON.stringify(shown)})`);
			t.check(shown.left === 0, `its slide over the figure (${JSON.stringify(shown)})`);
			t.check(shown.back === "/photos?page=1#p5", `All photos going back to its place (${shown.back})`);
			t.check(await t.page.evaluate(() => history.length === window.pagesBefore), "no history added: Back still goes to All photos");
			await swipe(180, -10);
			await t.page.waitForURL(/\/photos\/7$/, { timeout: 10_000 });
			t.check(await t.page.evaluate(() => window.samePage === true), "still no reload");
		},
	},
	{
		name: "a swipe on a weak signal, the next photo's page not reading: the whole page goes to that photo, its own buttons and all",
		phones: ["android", "iphone"],
		async run(t) {
			let asked = 0;
			t.harness.page("/photo", () => photoPage({ newer: 9, older: 5 }));
			t.harness.page("/photos/9", () => photoPage({ id: 9, older: PHOTO.id }));
			// The read in advance and the swipe's own read both fail; the page opened after them doesn't.
			t.harness.page("/photos/5", () => (++asked <= 2 ? { status: 503, body: "" } : photoPage({ id: 5, newer: PHOTO.id })));
			await t.page.goto(`${t.harness.url}/photo`);
			await t.until(() => asked >= 1, "the older photo's page read in advance (and failing)");
			await t.page.evaluate(async () => {
				const at = document.querySelector(".photoview");
				const fire = (type, x) => {
					const e = new Event(type, { bubbles: true });
					Object.defineProperty(e, "touches", { value: type === "touchend" ? [] : [{ clientX: x, clientY: 300 }] });
					at.dispatchEvent(e);
				};
				fire("touchstart", 200);
				for (let i = 1; i <= 5; i++) { fire("touchmove", 200 - 36 * i); await new Promise((r) => setTimeout(r, 24)); }
				fire("touchend", 20);
			});
			await t.until(() => t.page.evaluate(() => document.querySelector(".photoview")?.dataset.id === "5"), "the page to be photo 5's", 15_000);
			t.check(await t.page.evaluate(() => document.querySelector(".photoview").dataset.newer === "7"), "photo 5's own Newer, not the old photo's");
		},
	},
	{
		name: "saving a photo on an iPhone with no share menu: says to press and hold the photo, and keeps the page",
		phones: ["iphone"],
		init: [noShareMenu],
		async run(t) {
			servePhoto(t);
			await t.page.goto(`${t.harness.url}/photo`);
			t.check(!(await t.visible("[data-save-photo]")), "no button that would open a page with no way back");
			const hint = await t.text("[data-save-hint]");
			t.check(hint === "To save it, press and hold the photo, then tap Save to Photos.", `how to save it (said "${hint}")`);
		},
	},
];
