// Go live: this game already has a recording on its way (the card's data-recording), or its stream was stopped. What
// closed pages kept on the phone (golive-kept.js: the parts storage never got, and the tail) is sent first, so nothing
// recorded is lost.
import { forgetNotes, keptOnPhone, minutesOf } from "./golive-kept.js";
import { stateKey } from "./golive-rec.js";
import { buttonRunner } from "./golive-run.js";
import { api } from "./upload-net.js";
import { load } from "./upload-state.js";
import { askName } from "./team.js";

// The site's "wait" answers (Save, Carry on): a part arrived in the last two minutes, or Stream still sees a phone.
const WAITING = {
	sending: "The last of the recording is still arriving (the site waits two minutes after the last part, in case the old page is still sending). Keep this page open.",
	streaming: "The stream from the closed page is still finishing: this takes a minute or two. Keep this page open. (If someone else is now filming this game from another phone, don't carry on.)",
};
const sleep = (seconds) => new Promise((resolve) => setTimeout(resolve, seconds * 1000));
const clock = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

/** Asks the site until it's no longer "wait": the answer. Meanwhile the button counts the wait down ("Carrying on in 1:20…")
 * or says it's getting ready (`readying`), and the panel says why. */
async function askUntilReady(path, body, button, doing, readying, tell) {
	const was = button.textContent;
	try {
		for (;;) {
			const answer = await api(path, body);
			if (!(answer.status in WAITING)) return answer;
			tell(WAITING[answer.status]);
			let left = answer.waitLeft ?? answer.retryIn;
			for (let i = 0; i < answer.retryIn; i++) {
				button.textContent = answer.status === "sending" ? `${doing} in ${clock(Math.max(1, left - i))}…` : readying;
				await sleep(1);
			}
		}
	} finally {
		button.textContent = was;
	}
}

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
 * arrived), and Delete it and start again unless the stream was stopped. What happens is said in
 * the panel, beside the buttons. Otherwise says why the game can't be streamed. True if the page should stop there.
 */
export function recordingInTheWay(card, { btn, say, carryOn }) {
	const gameId = card.dataset.game, recording = card.dataset.recording;
	const ended = card.dataset.ended === "1";
	const remembered = load(stateKey(gameId));
	const here = Boolean(recording) && String(remembered?.videoId) === recording;
	// Nothing on its way: a note left on this phone is from a recording that has been saved since.
	if (!recording) forgetNotes(gameId);
	if (here || (recording && card.dataset.mine === "1")) {
		const panel = card.querySelector("[data-recover]"), note = panel.querySelector("[data-recover-msg]");
		const tell = (text) => { note.textContent = text; };
		const run = buttonRunner(tell);
		const canCarryOn = here && !ended;
		const state = here ? { gameId, ...remembered } : null;
		// What closed pages kept on this phone, if anything: said as soon as it's known.
		const kept = here ? keptOnPhone(gameId, state, carryOn.mime ?? "video/mp4").then((k) => {
			const minutes = minutesOf(k.bytes);
			if (k.bytes > 0) tell(`${minutes > 0 ? `About ${minutes} ${minutes === 1 ? "minute" : "minutes"}` : "The last moments"} of the recording were still on this phone when the page closed: that's sent when you save or carry on.`);
			return k;
		}) : Promise.resolve(null);
		panel.hidden = false;
		panel.querySelector("[data-recover-carry]").hidden = !canCarryOn;
		panel.querySelector("[data-recover-here]").hidden = !(here && ended);
		panel.querySelector("[data-recover-other]").hidden = here;
		btn("continue").hidden = !canCarryOn;
		if (canCarryOn) btn("save").textContent = "End game and save what was recorded";
		btn("discard").hidden = ended;
		// Mid-game, in a hurry: what happened and its buttons are on screen without scrolling for them.
		bringOnScreen(panel, btn(canCarryOn ? "continue" : "save"));
		const others = (busy) => { btn("save").disabled = btn("discard").disabled = btn("continue").disabled = busy; };
		btn("continue").onclick = () => run(btn("continue"), async () => {
			others(true);
			const answer = await askUntilReady(`/api/live/${gameId}/continue`, { videoId: Number(recording), mimeType: carryOn.mime }, btn("continue"), "Carrying on", "Getting ready to carry on streaming…", tell).finally(() => others(false));
			// What the old page kept goes up while the game streams again; End game waits for it before saving.
			const k = await kept;
			const sending = k?.bytes > 0 ? k.send(carryOn.say, true).then(() => carryOn.say("")) : Promise.resolve();
			// The camera next (the phone may ask for it again); the panel goes once it's there, or says why it isn't.
			await carryOn.ready(answer, (state.minutesBefore ?? 0) + minutesOf(Object.keys(state.etags ?? {}).length * (state.partSize ?? 0)) + minutesOf(k?.own ?? 0), sending);
			panel.hidden = true;
		});
		btn("save").onclick = () => run(btn("save"), async () => {
			others(true);
			let status;
			try {
				// What this phone kept goes up first; then the site saves what reached it (waiting its two minutes after the
				// last part, in case a page of this recording is still alive and sending).
				const k = await kept;
				if (k?.bytes > 0) await k.send(tell);
				status = (await askUntilReady(`/api/live/${gameId}/save`, {}, btn("save"), "Saving", "Getting ready to save…", tell)).status;
			} finally {
				others(false);
			}
			forgetNotes(gameId);
			btn("save").hidden = btn("discard").hidden = btn("continue").hidden = true;
			tell(status === "saved" ? "Saved. What was recorded will be in Watch games in about 20 to 25 minutes."
				: "Nothing had reached the site yet, so there was nothing to save. Reload the page to go live again.");
		});
		btn("discard").onclick = () => run(btn("discard"), async () => {
			await api(`/api/uploads/${recording}/abort`, {});
			forgetNotes(gameId);
			await (await kept)?.clear();
			// Start afresh: the page sets up the camera controls for a game with nothing recorded yet.
			location.reload();
		});
		return true;
	}
	if (ended) say(`This game has been ended and is being saved. It can't be streamed again: if the game's still going, record the rest with the phone's Camera app and send it to ${askName()} afterwards.`);
	else if (recording) say("This game is already being filmed from another phone or tab.");
	return ended || Boolean(recording);
}
