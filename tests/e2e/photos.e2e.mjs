// Photos (public/photos.js): a parent picks photos on their phone. Each is turned the right
// way up, made smaller and sent with when it was taken, and nothing else the camera wrote (where it was taken too).
import { readFileSync } from "node:fs";
import { cleanJpeg } from "../../src/features/photos/jpeg.ts";
import { exifApp1, hasExif } from "../helpers/jpeg.ts";
import { homeStub, PHOTO, photoPage, photosPage } from "./pages.mjs";

// The phone's share menu, standing in for the real one: notes the files it was given (WebKit here has none).
const shareMenu = () => {
	Object.defineProperty(navigator, "canShare", { configurable: true, value: (data) => Boolean(data?.files?.length) });
	Object.defineProperty(navigator, "share", { configurable: true, value: async (data) => { window.shared = data.files.map((f) => ({ name: f.name, type: f.type, size: f.size })); } });
};
// Safari's share menu as it behaves: open for a moment, and asked again while it's open, it refuses (InvalidStateError).
const slowShareMenu = () => {
	Object.defineProperty(navigator, "canShare", { configurable: true, value: (data) => Boolean(data?.files?.length) });
	let open = false;
	window.shares = 0;
	Object.defineProperty(navigator, "share", { configurable: true, value: async (data) => {
		if (open) throw new DOMException("An earlier share has not yet completed.", "InvalidStateError");
		open = true;
		window.shares++;
		await new Promise((resolve) => setTimeout(resolve, 1_000));
		open = false;
		window.shared = data.files.map((f) => ({ name: f.name, type: f.type, size: f.size }));
	} });
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
		g.fillStyle = "#14274E";
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
			const keys = sent.map((f) => f.key?.toString() ?? "");
			t.check(keys.every((k) => /^[0-9a-f-]{36}$/.test(k)) && keys[0] !== keys[1], `each sent with a key of its own (sent ${JSON.stringify(keys)})`);
		},
	},
	{
		name: "photos: a picture with a see-through background (a PNG) is sent on white, not black",
		phones: ["android", "iphone", "firefox"],
		async run(t) {
			t.harness.page("/photos", photosPage);
			await t.page.goto(`${t.harness.url}/photos`);
			// A blue square on nothing at all, as a sticker or a saved logo is.
			const png = Buffer.from(await t.page.evaluate(async () => {
				const canvas = Object.assign(document.createElement("canvas"), { width: 400, height: 300 });
				const g = canvas.getContext("2d");
				g.fillStyle = "#1F4FA8";
				g.fillRect(150, 100, 100, 100);
				const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
				let text = "";
				for (const b of new Uint8Array(await blob.arrayBuffer())) text += String.fromCharCode(b);
				return btoa(text);
			}), "base64");
			await t.page.setInputFiles("#photo-files", [{ name: "Sticker.png", mimeType: "image/png", buffer: png }]);
			await t.until(() => t.page.url().includes("done=added"), "the Photos page once it's in", 30_000);
			const [sent] = t.harness.calls("POST /api/photos").map((c) => fields(c.body));
			const [corner, middle] = await t.page.evaluate(async (b64) => {
				const bitmap = await createImageBitmap(new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], { type: "image/jpeg" }));
				const canvas = Object.assign(document.createElement("canvas"), { width: bitmap.width, height: bitmap.height });
				const g = canvas.getContext("2d");
				g.drawImage(bitmap, 0, 0);
				return [[10, 10], [200, 150]].map(([x, y]) => [...g.getImageData(x, y, 1, 1).data.slice(0, 3)]);
			}, Buffer.from(sent.photo).toString("base64"));
			t.check(corner.every((v) => v > 240), `the see-through part sent white (${corner})`);
			t.check(middle[2] > middle[0] + 60 && middle[2] < 210, `the blue square still blue (${middle})`);
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
			// Sent again with the same key, so a lost answer can't add it twice; the next photo has its own.
			const keys = t.harness.calls("POST /api/photos").map((c) => fields(c.body).key?.toString() ?? "");
			const first = keys.slice(0, -1), last = keys.at(-1);
			t.check(first.length >= 2 && first.every((k) => k && k === first[0]) && last && last !== first[0], `the first photo's key the same each time it was sent (${JSON.stringify(keys)})`);
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
		name: "a photo's page on a phone: a swipe left slides to the older photo and right to the newer, in place; a scroll or a zoomed-in drag doesn't",
		phones: ["android", "iphone"],
		async run(t) {
			t.harness.page("/photo", () => photoPage({ newer: 9, older: 5 }));
			// Photo 5 was taken on another day, so its caption isn't photo 7's.
			t.harness.page("/photos/5", () => photoPage({ id: 5, newer: PHOTO.id }).replace(/(class="small photo-when">)[^<]*/, "$1Tuesday 20 October, 8:30am"));
			t.harness.page("/photos/9", () => photoPage({ id: 9, older: PHOTO.id }));
			/** What the page says and links to: its caption, All photos, Download photo and Ask for this photo to be removed. */
			const own = () => t.page.evaluate(() => ({
				caption: document.querySelector(".photo-when").textContent, back: document.querySelector(".photoback").getAttribute("href"),
				download: document.querySelector("[data-save-photo]").getAttribute("href"), removal: document.querySelector(".side form").getAttribute("action"),
			}));
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
			const opened = await own();
			t.check(opened.back === "/photos?page=1#p7" && opened.download === "/photos/7/download" && opened.removal === "/photos/7/removal-requests", `photo 7's own links (${JSON.stringify(opened)})`);
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
			const five = await own();
			t.check(five.caption === "Tuesday 20 October, 8:30am" && five.download === "/photos/5/download" && five.removal === "/photos/5/removal-requests", `photo 5's own caption and buttons (${JSON.stringify(five)})`);
			t.check(await t.page.evaluate(() => history.length === window.pagesBefore), "no history added: Back still goes to All photos");
			await swipe(180, -10);
			await t.page.waitForURL(/\/photos\/7$/, { timeout: 10_000 });
			t.check(await t.page.evaluate(() => window.samePage === true), "still no reload");
			// Back on the opened photo: its own caption, links and buttons, not photo 5's (Delete would delete the wrong one).
			await t.until(() => t.page.evaluate(() => document.querySelector(".photoview")?.dataset.id === "7"), "the page to be photo 7's again");
			const back = await own();
			t.check(JSON.stringify(back) === JSON.stringify(opened), `photo 7's own caption and links again (${JSON.stringify(back)}, opened ${JSON.stringify(opened)})`);
			// Pinched to zoom in: a finger moves around the photo, in any direction, and doesn't swipe to the next one.
			t.check(await t.page.evaluate(() => getComputedStyle(document.querySelector(".photoview")).touchAction) === "pan-y pinch-zoom", "the photo lets a pinch zoom it");
			const zoomTo = (scale) => t.page.evaluate((scale) => {
				Object.defineProperty(window.visualViewport, "scale", { configurable: true, get: () => scale });
				window.visualViewport.dispatchEvent(new Event("resize"));
			}, scale);
			await zoomTo(2);
			await swipe(-180, 10);
			await t.page.waitForTimeout(600);
			const zoomed = await t.page.evaluate(() => ({ id: document.querySelector(".photoview").dataset.id, touch: document.querySelector(".photoview").style.touchAction, url: location.pathname }));
			t.check(zoomed.id === "7" && zoomed.url === "/photos/7" && zoomed.touch === "auto", `zoomed in, a drag stays on photo 7 and pans it any way (${JSON.stringify(zoomed)})`);
			await zoomTo(1);
			t.check(await t.page.evaluate(() => document.querySelector(".photoview").style.touchAction === ""), "zoomed out, up and down only again, for the swipe");
			// The phone turned on its side: the photo's own slide still sits over the figure, not half of each neighbour.
			const size = t.page.viewportSize();
			await t.page.setViewportSize({ width: size.height, height: size.width });
			await t.page.waitForTimeout(300);
			const turned = await t.page.evaluate(() => {
				const fig = document.querySelector(".photoview").getBoundingClientRect(), mid = document.querySelectorAll(".photoview .slide")[1].getBoundingClientRect();
				return { left: Math.round(mid.left - fig.left), width: Math.round(mid.width - fig.width) };
			});
			await t.page.setViewportSize(size);
			t.check(turned.left === 0 && turned.width === 0, `turned on its side, the photo's own slide over the figure (${JSON.stringify(turned)})`);
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
		name: "a swipe on a slow signal: until the next photo's page comes, the last one's caption and buttons can't be used",
		phones: ["android", "iphone"],
		async run(t) {
			let asked = 0, arrive = () => {};
			const arrived = new Promise((resolve) => { arrive = resolve; });
			t.harness.page("/photo", () => photoPage({ newer: 9, older: 5 }));
			t.harness.page("/photos/9", () => photoPage({ id: 9, older: PHOTO.id }));
			// The read in advance fails; the swipe's own read is slow, coming only when the test lets it.
			t.harness.page("/photos/5", async () => {
				if (++asked === 1) return { status: 503, body: "" };
				await arrived;
				return photoPage({ id: 5, newer: PHOTO.id }).replace(/(class="small photo-when">)[^<]*/, "$1Tuesday 20 October, 8:30am");
			});
			await t.page.goto(`${t.harness.url}/photo`);
			await t.until(() => asked >= 1, "the older photo's page read in advance (and failing)");
			const caption = await t.text(".photo-when");
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
			await t.until(() => asked >= 2, "photo 5's page asked for by the swipe");
			const held = () => t.page.evaluate(() => [".photo-when", ".photonav", ".photoback", ".side"].map((sel) => document.querySelector(sel)?.inert ?? null));
			const waiting = await held();
			t.check(waiting.every((inert) => inert === true), `while it's on its way, the last photo's caption, Newer and Older, All photos and buttons can't be used (${JSON.stringify(waiting)})`);
			t.check(await t.page.evaluate(() => getComputedStyle(document.querySelector(".side")).opacity === "0.5"), "and look it");
			t.check(await t.page.evaluate(() => document.querySelector(".photoview").dataset.id === String(7)), "the page's facts still the last photo's until then");
			arrive();
			await t.until(() => t.page.evaluate(() => document.querySelector(".photoview")?.dataset.id === "5"), "the page to be photo 5's");
			const after = await held();
			t.check(after.every((inert) => inert === false), `photo 5's own caption and buttons can be used (${JSON.stringify(after)})`);
			const five = await t.text(".photo-when");
			t.check(five === "Tuesday 20 October, 8:30am" && five !== caption, `photo 5's own caption (${five})`);
			t.check(await t.page.evaluate(() => document.querySelector("[data-save-photo]").getAttribute("href")) === "/photos/5/download", "its own Save");
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
	{
		name: "Save photo tapped twice on an iPhone: the photo is got once and the share menu opens once, with no word of trouble",
		phones: ["iphone"],
		init: [slowShareMenu],
		async run(t) {
			const jpeg = servePhoto(t);
			let gets = 0;
			t.harness.page(`/photos/${PHOTO.id}/download`, async () => {
				gets++;
				await new Promise((resolve) => setTimeout(resolve, 300));
				return { headers: { "Content-Type": "image/jpeg" }, body: jpeg };
			});
			await t.page.goto(`${t.harness.url}/photo`);
			await t.page.evaluate(() => { const save = document.querySelector("[data-save-photo]"); save.click(); save.click(); });
			await t.until(() => t.page.evaluate(() => window.shared), "the share menu to open with the photo");
			// A third tap, once the menu has closed, opens it again with the photo it already has.
			await t.page.evaluate(() => document.querySelector("[data-save-photo]").click());
			await t.page.waitForTimeout(1_500);
			const shares = await t.page.evaluate(() => window.shares), hint = await t.text("[data-save-hint]");
			t.check(gets === 1 && shares === 2, `the photo got once, and the menu opened once for the double tap and once for the third (got ${gets}, opened ${shares})`);
			t.check(!/Couldn't/.test(hint), `no word of trouble (said "${hint}")`);
		},
	},
	{
		name: "after adding photos, Back goes to the page before Photos, not to one still stuck adding them",
		phones: ["android", "iphone", "firefox"],
		async run(t) {
			t.harness.page("/", homeStub);
			t.harness.page("/photos", photosPage);
			await t.page.goto(`${t.harness.url}/`);
			await t.page.goto(`${t.harness.url}/photos`);
			await t.page.setInputFiles("#photo-files", [{ name: "IMG_0001.JPG", mimeType: "image/jpeg", buffer: await photo(t.page, 800, 600) }]);
			await t.until(() => t.page.url().includes("done=added"), "the Photos page once it's in", 30_000);
			await t.page.goBack();
			await t.until(() => new URL(t.page.url()).pathname === "/", `Back at the page before Photos (at ${t.page.url()})`, 10_000);
		},
	},
	{
		name: "a scroll that starts on Choose photos lets the screen sleep again, so the page can still be pulled to refresh",
		phones: ["android", "iphone"],
		async run(t) {
			t.harness.page("/photos", photosPage);
			await t.page.goto(`${t.harness.url}/photos`);
			const busy = () => t.page.evaluate(() => document.documentElement.classList.contains("busy"));
			await t.page.dispatchEvent("#photo-files", "pointerdown", { pointerType: "touch", isPrimary: true });
			t.check(await busy(), "the screen kept on from the touch");
			await t.page.dispatchEvent("#photo-files", "pointercancel", { pointerType: "touch", isPrimary: true });
			t.check(!(await busy()), "the page no longer busy once the touch became a scroll");
		},
	},
];
