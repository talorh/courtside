// Go live: this game already has a recording on its way (the card's data-recording), or its stream was stopped. What
// closed pages kept on the phone (golive-kept.js: the parts storage never got, and the tail) is sent first, so nothing
// recorded is lost.
import { keepAwake } from "./awake.js";
import { dropKept, earlierNoted, minutesOf } from "./golive-kept.js";
import { CHECKING, UNREADABLE, holdingPage, readKept, reportProblem, sendWhileStreaming, withBar } from "./golive-kept-read.js";
import { stateKey } from "./golive-rec.js";
import { askUntilReady } from "./golive-ask.js";
import { buttonRunner } from "./golive-run.js";
import { api } from "./upload-net.js";
import { load } from "./upload-state.js";
import { askName } from "./team.js";

/** Scrolls the least that puts the panel on screen, clear of the bar that stays at the top of a phone's page. Where the
 * screen is too short for all of it, its top goes just under the bar, or lower if that's what keeps `first`, its first
 * button, on screen. */
function bringOnScreen(panel, first) {
	const bar = document.querySelector(".appbar")?.getBoundingClientRect();
	// On a computer the bar runs down the side: nothing covers the top.
	const under = bar && bar.bottom < innerHeight ? Math.max(0, bar.bottom) : 0;
	const box = panel.getBoundingClientRect();
	const top = box.top - under - 8, bottom = box.bottom + 8 - innerHeight;
	const button = first.getBoundingClientRect().bottom + 8 - innerHeight;
	scrollBy(0, bottom > top ? Math.max(top, button) : Math.min(top, Math.max(bottom, 0)));
}

/**
 * A recording this phone made (its page was closed mid-game), or one of the filmer's own that isn't on this phone
 * (`data-mine`: another phone or tab, or a start that didn't finish). The same phone, while the stream hasn't been
 * ended, is offered Carry on streaming (`carryOn`, golive.js: { mime, say, ready(answer, minutesBefore, sending) } starts
 * the camera for the red Carry on tap, `sending` what the old page kept going up meanwhile); every case gets Save what
 * was recorded (what this phone kept is sent first, then the site saves what reached it once the last of it has
 * arrived), and Delete it and start again unless the stream was stopped (it asks first: Yes, delete it or Keep it, as
 * there's no undo). What happens is said in the panel, beside the buttons. Otherwise says why the game can't be
 * streamed. True if the page should stop there.
 */
export function recordingInTheWay(card, { btn, say, carryOn }) {
	const gameId = card.dataset.game, recording = card.dataset.recording;
	const ended = card.dataset.ended === "1";
	const remembered = load(stateKey(gameId));
	const here = Boolean(recording) && String(remembered?.videoId) === recording;
	// Nothing on its way: a note left on this phone, and what it kept, are from a recording saved or deleted since.
	if (!recording) dropKept(gameId).catch((err) => console.warn(`recording store: ${err}`));
	if (here || (recording && card.dataset.mine === "1")) {
		const panel = card.querySelector("[data-recover]"), note = panel.querySelector("[data-recover-msg]");
		const tell = (text) => { note.textContent = text; };
		const run = buttonRunner(tell);
		const canCarryOn = here && !ended;
		const state = here ? { gameId, ...remembered } : null;
		// What closed pages kept on this phone, if anything: said as soon as it's known. Storage that can't be read is
		// read again when Save or Carry on is tapped: what it holds is never passed over.
		const readAgain = () => readKept(gameId, state, carryOn.mime ?? "video/mp4");
		let kept = here ? readAgain().then((k) => {
			const minutes = minutesOf(k.bytes ?? 0, state.bytesPerMinute);
			if (k.bytes > 0) tell(`${minutes > 0 ? `About ${minutes} ${minutes === 1 ? "minute" : "minutes"}` : "The last moments"} of the recording were still on this phone when the page closed: that's sent when you save or carry on.`);
			return k;
		}) : Promise.resolve(null);
		const keptNow = async () => {
			if ((await kept)?.failed) kept = readAgain();
			return kept;
		};
		// Storage that can't be read could be hiding footage, unless it never opened while this segment recorded and no
		// earlier segment is noted as having any.
		const mayHold = () => state.keeps !== false || earlierNoted(gameId);
		const bar = panel.querySelector("[data-recover-bar]");
		panel.hidden = false;
		panel.querySelector("[data-recover-carry]").hidden = !canCarryOn;
		panel.querySelector("[data-recover-here]").hidden = !(here && ended);
		panel.querySelector("[data-recover-other]").hidden = here;
		btn("continue").hidden = !canCarryOn;
		if (canCarryOn) btn("save").textContent = "End game and save what was recorded";
		btn("discard").hidden = ended;
		// Mid-game, in a hurry: what happened and its buttons are on screen without scrolling for them.
		bringOnScreen(panel, btn(canCarryOn ? "continue" : "save"));
		const others = (busy) => { btn("save").disabled = btn("discard").disabled = btn("discardyes").disabled = btn("continue").disabled = busy; };
		const ask = panel.querySelector("[data-discardask]");
		const asking = (on) => { ask.hidden = !on; btn("discard").hidden = on; };
		btn("continue").onclick = () => run(btn("continue"), async () => {
			others(true);
			// What the old page kept is read first, with the buttons off, so a second tap can't ask for another part.
			let read;
			try {
				tell(CHECKING);
				read = await keptNow();
			} catch (err) {
				others(false);
				throw err;
			}
			const answer = await askUntilReady(`/api/live/${gameId}/continue`, { videoId: Number(recording), mimeType: carryOn.mime }, btn("continue"), "Carrying on", "Getting ready to carry on streaming…", tell).finally(() => others(false));
			// What the old page kept goes up while the game streams again; End game waits for it before saving. Storage
			// that can't be read doesn't stop the game streaming, but those minutes are lost, and the filmer is told.
			const k = read?.failed ? null : read;
			if (read?.failed && mayHold()) carryOn.say("What the closed page kept on this phone couldn't be read, so those minutes can't be sent and won't be in the video.");
			// It says how much it still has to send, so End game and the Saving panel count it (golive-rec.js before()).
			const sending = sendWhileStreaming(gameId, k, carryOn.say);
			// The camera next (the phone may ask for it again); the panel goes once it's there, or says why it isn't.
			const minutes = (bytes) => minutesOf(bytes, state.bytesPerMinute);
			await carryOn.ready(answer, (state.minutesBefore ?? 0) + minutes(Object.keys(state.etags ?? {}).length * (state.partSize ?? 0)) + minutes(k?.own ?? 0), sending);
			panel.hidden = true;
		});
		btn("save").onclick = () => run(btn("save"), async () => {
			others(true);
			// Sending what this phone kept, then the site's wait, can take minutes: a locked phone would pause them.
			const awake = keepAwake();
			// Something on screen at once: reading what the phone kept can take a while, and a tap that seems to do nothing
			// gets tapped again, or the page refreshed.
			const label = btn("save").textContent;
			btn("save").textContent = CHECKING;
			tell(CHECKING);
			let status;
			try {
				// What this phone kept goes up first, with the page holding on until it has; then the site saves what reached
				// it (waiting its two minutes after the last part, in case a page of this recording is still alive and
				// sending). If the phone's copy can't be read, nothing is saved: saving would leave it behind for good.
				const read = await keptNow();
				if (read?.failed && mayHold()) return tell(UNREADABLE);
				const k = read?.failed ? null : read;
				btn("save").textContent = "Saving…";
				status = await holdingPage(async () => {
					if (k?.bytes > 0) await k.send(withBar(tell, bar));
					return (await askUntilReady(`/api/live/${gameId}/save`, {}, btn("save"), "Saving", "Getting ready to save…", tell)).status;
				}).catch((err) => {
					// The phone's storage failing part way: nothing is saved, and the next tap reads it afresh.
					if (!err?.storage) throw err;
					kept = Promise.resolve({ failed: err });
					reportProblem(gameId, `recording store failed while sending: ${err.message ?? err}`);
					return null;
				});
				if (status === null) return tell(UNREADABLE);
			} finally {
				others(false);
				awake.release();
				btn("save").textContent = label;
			}
			dropKept(gameId).catch((err) => console.warn(`recording store: ${err}`));
			ask.hidden = btn("save").hidden = btn("discard").hidden = btn("continue").hidden = true;
			tell(status === "saved" ? "Saved. What was recorded will be in Watch games in about 20 to 25 minutes."
				: "Nothing had reached the site yet, so there was nothing to save. Reload the page to go live again.");
		});
		btn("discard").onclick = () => { asking(true); btn("discardno").focus(); };
		btn("discardno").onclick = () => asking(false);
		btn("discardyes").onclick = () => run(btn("discardyes"), async () => {
			others(true);
			await api(`/api/uploads/${recording}/abort`, {}).finally(() => others(false));
			// What the notes say this phone kept goes, then the notes.
			await dropKept(gameId).catch((err) => console.warn(`recording store: ${err}`));
			// Start afresh: the page sets up the camera controls for a game with nothing recorded yet.
			location.reload();
		});
		return true;
	}
	if (ended) say(`This game has been ended and is being saved. It can't be streamed again: if the game's still going, record the rest with the phone's Camera app and send it to ${askName()} afterwards.`);
	else if (recording) say("This game is already being filmed from another phone or tab.");
	return ended || Boolean(recording);
}
