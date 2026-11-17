// Resumable upload: browser → R2 (pre-signed multipart parts) → server completes → Stream copies.
// A dropped connection pauses the upload and it carries on by itself (see upload-net.js).
// Progress is also remembered per file (name + size + game), so choosing the same file again after a reload resumes.
// The screen is kept awake while uploading: phones pause the upload when the screen locks.
import { keepAwake } from "./awake.js";
import { enableDrop } from "./upload-drop.js";
import { needsReload } from "./upload-net.js";
import { progressOf, progressWords, reportProblem } from "./problems.js";
import { cancelOnServer, failedWords, upload } from "./upload-run.js";
import { forget, gb, keyFor } from "./upload-state.js";
import { tapAgain } from "./tap-again.js";

const $ = (id) => document.getElementById(id);
const hint = (text) => { $("hint").textContent = text; };
// How far the upload has got, for its report if it stops (problems.js), and the upload going, if one is.
const sent = { pct: 0, startedMs: 0, going: null };
const reportStopped = (file, gameId, why, status, keepalive = false) => {
	const progress = progressOf(sent.pct, file.size, sent.startedMs, Date.now());
	reportProblem("upload", { gameId, message: `${progressWords(progress)}: ${why}`, status, progress, keepalive });
};
// The page closing mid-upload (iPhone reclaiming the tab, say): told as it goes. The upload carries on where it left off
// when the video is chosen again.
addEventListener("pagehide", () => { if (sent.going) reportStopped(sent.going.file, sent.going.gameId, "the page closed mid-upload", undefined, true); });
const ui = {
	hint,
	show: ({ pct, text }) => { sent.pct = pct; $("bar").style.width = `${pct}%`; $("pct").textContent = text; },
};

function main() {
	const form = $("upload");
	if (!form) return;
	const fileInput = $("file"), gameSelect = $("game"), pickText = $("pick-text"), cancel = $("cancel");
	let busy = false, controller = null, awake = null;
	// If the phone won't keep the screen on, the upload still runs, but say how to stop it locking.
	// iPhone only grants it straight after a tap, so it's asked for on the tap that opens the video picker.
	const awakeNote = (held) => { $("awake").hidden = held; };
	const stayAwake = () => { awake ??= keepAwake(awakeNote); };
	const sleepOk = () => { awake?.release(); awake = null; $("awake").hidden = true; };
	$("pick").addEventListener("pointerdown", () => { if (!busy) stayAwake(); });
	const warn = (e) => { e.preventDefault(); e.returnValue = ""; };

	form.addEventListener("submit", (e) => e.preventDefault());
	fileInput.addEventListener("cancel", () => { if (!busy) { sleepOk(); $("progress").hidden = false; hint("No video chosen. Tap the button to pick one."); } });

	// Two taps: the first asks, the second cancels (there's no undo).
	const sureToCancel = tapAgain(cancel, "Tap again to cancel the upload");
	cancel.addEventListener("click", () => { if (busy && sureToCancel.sure()) controller?.abort(); });

	// Choosing a file and dropping one (on a computer) both start here.
	async function start(files) {
		if (busy || files.length === 0) return;
		// One video per game. Some phone pickers let you tick several even though the page asks for one.
		if (files.length > 1) {
			$("progress").hidden = false;
			hint(`You chose ${files.length} videos. Please choose just one: the video for this game.`);
			fileInput.value = "";
			sleepOk();
			return;
		}
		const file = files[0];
		const gameId = Number(gameSelect.value);
		busy = true;
		controller = new AbortController();
		$("progress").hidden = false;
		$("done-note").hidden = true;
		cancel.hidden = false;
		$("file-name").textContent = file.name;
		$("pct").textContent = gb(file.size);
		Object.assign(sent, { pct: 0, startedMs: Date.now(), going: { file, gameId } });
		pickText.textContent = "Uploading…";
		hint("Keep this page open until it finishes (we'll keep your screen on).");
		window.addEventListener("beforeunload", warn);
		stayAwake();
		try {
			const result = await upload(file, gameId, controller.signal, ui);
			$("bar").style.width = "100%";
			$("pct").textContent = "Uploaded";
			hint(result.status === "processing"
				? "Uploaded."
				: "Uploaded. Processing will start shortly.");
			$("done-note").hidden = false;
			// That game has its video now: the next upload offers the other games, or nothing (the site would refuse it again).
			gameSelect.querySelector(`option[value="${gameId}"]`)?.remove();
			if (gameSelect.options.length) pickText.textContent = "Upload another video";
			else { $("pick").hidden = true; hint("Uploaded. Every game has its video now."); }
		} catch (err) {
			if (controller.signal.aborted) {
				$("bar").style.width = "0%";
				$("pct").textContent = "";
				hint(await cancelOnServer(file, gameId));
			} else {
				// The game has a video already, or the upload's gone: forget it. Not when the site only asks for a reload.
				if (err.status === 409 && !needsReload(err)) forget(keyFor(file, gameId));
				hint(failedWords(err));
				// The site logs its own failures (5xx), but not storage's (the parts go straight to R2); signed out isn't one.
				if ((!(err.status >= 500) || /^storage /.test(err.message)) && err.status !== 401) reportStopped(file, gameId, err.message, err.status);
			}
			pickText.textContent = "Choose the video";
		} finally {
			sent.going = null;
			busy = false;
			sureToCancel.reset();
			cancel.hidden = true;
			fileInput.value = "";
			window.removeEventListener("beforeunload", warn);
			sleepOk();
		}
	}

	fileInput.addEventListener("change", () => start(fileInput.files ?? []));
	enableDrop(form, start);
}

main();
