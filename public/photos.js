// Photos: adds the photos anyone on the team chooses, or drops on Add photos on a computer. Each is
// read for when it was taken (photo-date.js), then drawn smaller (at most 2560 px along its longer side, saved as a
// JPEG), which leaves off everything else the camera wrote, where it was taken too. Drawn from an <img> of the file,
// it's the right way up. They're drawn one at a time and sent one at a time, or a few at once when the first went up
// quickly (photo-queue.js). Trouble reaching the site is waited out and tried again; a photo the site turns down is
// skipped and listed, unless the rest would be turned down too (signed out, the day's photos all added), which stops
// there and says why. The screen is kept on (and the page marked busy) until they're all sent; a page left before then
// says so next time (photo-unsent.js).
import { awakeOnTap } from "./awake.js";
import { takenAt } from "./photo-date.js";
import { oneAtATime, sendPhotos, stopsTheRest, uploadLanes } from "./photo-queue.js";
import { leftWords, unsentNote } from "./photo-unsent.js";
import { reportProblem } from "./problems.js";
import { enableDrop } from "./upload-drop.js";
import { apiForm, isNetworkTrouble, newId, withRetries } from "./upload-net.js";

const LONGEST = 2560, QUALITY = 0.88;
const $ = (id) => document.getElementById(id);
const KEEP_OPEN = "Keep this page open until they're all in (we'll keep your screen on).";

/** The photo the right way up, drawn at most LONGEST px along its longer side, as a JPEG. */
async function shrink(file) {
	const url = URL.createObjectURL(file);
	const canvas = document.createElement("canvas");
	try {
		const img = new Image();
		img.src = url;
		await img.decode().catch(() => { throw new Error("it couldn't be opened"); });
		const scale = Math.min(1, LONGEST / Math.max(img.naturalWidth, img.naturalHeight));
		canvas.width = Math.round(img.naturalWidth * scale);
		canvas.height = Math.round(img.naturalHeight * scale);
		const g = canvas.getContext("2d");
		// A see-through part (a PNG's) would be black in a JPEG: white behind it instead.
		g.fillStyle = "#fff";
		g.fillRect(0, 0, canvas.width, canvas.height);
		g.drawImage(img, 0, 0, canvas.width, canvas.height);
		const jpeg = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", QUALITY));
		if (!jpeg) throw new Error("it couldn't be made smaller");
		return jpeg;
	} finally {
		URL.revokeObjectURL(url);
		// An iPhone caps what all canvases together hold, and frees one only when it's emptied: a long batch would fill it.
		canvas.width = canvas.height = 0;
	}
}

/** When it was taken, and the photo made smaller: one at a time, as an iPhone has room to draw only so many at once.
 * Its key goes with it each time it's sent, so the site adds it once though an answer is lost and it's sent again. */
const prepare = oneAtATime(async (file) => {
	// A file dropped on a computer can be anything; an empty type is left to the drawing to find out.
	if (file.type && !file.type.startsWith("image/")) throw new Error("it isn't a photo");
	const body = new FormData();
	body.set("takenAt", await takenAt(file));
	body.set("photo", await shrink(file), "photo.jpg");
	body.set("key", newId());
	return body;
});

/** One photo: made smaller, then sent as `lanes` allows (tried again through network trouble only). */
async function send(file, hint, lanes) {
	const body = await prepare(file);
	const started = Date.now();
	await withRetries(() => lanes.run(() => apiForm("/api/photos", body)), hint, undefined, (err) => {
		const again = isNetworkTrouble(err);
		if (again) lanes.trouble();
		return again;
	});
	lanes.sent(Date.now() - started);
}

function main() {
	const input = $("photo-files");
	if (!input) return;
	const label = input.closest("label").querySelector("span");
	const hint = (text) => { $("photo-hint").textContent = text; };
	const show = (done, total) => {
		$("photo-bar").style.width = `${(done / total) * 100}%`;
		$("photo-pct").textContent = `${Math.round((done / total) * 100)}%`;
	};
	const warn = (e) => { e.preventDefault(); e.returnValue = ""; };
	const team = document.documentElement.dataset.team ?? "";
	// Reading localStorage itself throws where the browser blocks it.
	const note = unsentNote((() => { try { return localStorage; } catch { return null; } })());
	const left = note.take(team, Date.now());
	if (left) {
		$("photo-progress").hidden = false;
		$("photo-count").textContent = `Added ${left.added} of ${left.total}`;
		show(left.added, left.total);
		hint(leftWords(left));
	}
	// An iPhone keeps the screen on only when asked straight after a tap: the one that opens the photo picker.
	const screen = awakeOnTap(input, () => !input.disabled);
	input.addEventListener("cancel", screen.release);

	// Choosing photos and dropping them (on a computer) both start here.
	async function start(chosen) {
		const files = [...(chosen ?? [])];
		if (input.disabled || !files.length) return;
		input.disabled = true;
		screen.hold();
		window.addEventListener("beforeunload", warn);
		$("photo-progress").hidden = false;
		label.textContent = "Adding photos…";
		hint(KEEP_OPEN);
		const count = (done) => {
			$("photo-count").textContent = `Adding ${files.length} ${files.length === 1 ? "photo" : "photos"}: ${done} done`;
			show(done, files.length);
		};
		count(0);
		note.start(team, files.length, Date.now());
		const lanes = uploadLanes();
		let sent = 0;
		const sendOne = (file) => send(file, hint, lanes).then(() => { note.added(++sent); hint(KEEP_OPEN); });
		const { added, skipped, stopped } = await sendPhotos(files, sendOne, count, stopsTheRest);
		note.finished();
		window.removeEventListener("beforeunload", warn);
		screen.release();
		// In place of this page, not after it: Back would bring it from the browser's cache, still adding photos and stuck.
		if (added === files.length) return location.replace("/photos?done=added");
		show(added + skipped.length, files.length);
		$("photo-count").textContent = `Added ${added} of ${files.length}`;
		const names = skipped.map(({ file, error }) => `${file.name || `photo ${files.indexOf(file) + 1}`} (${String(error.message).replace(/\.$/, "")})`);
		const why = stopped ? String(stopped.message).replace(/\.?$/, ".") : `Not added: ${names.join("; ")}.`;
		hint(why);
		if (stopped?.status !== 401) reportProblem("photos", { message: `Added ${added} of ${files.length}. ${why}`, status: stopped?.status });
		$("photo-see")?.remove();
		$("photo-progress").append(Object.assign(document.createElement("a"), { id: "photo-see", className: "btn", href: "/photos", textContent: "See the photos" }));
		label.textContent = "Choose photos";
		input.value = "";
		input.disabled = false;
	}

	input.addEventListener("change", () => start(input.files));
	enableDrop($("addphotos"), start);
}

main();
