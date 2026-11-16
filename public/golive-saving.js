// Go live, after End game: the Saving panel (progress until Saved), or why nothing was saved.
import { BEHIND_MINUTES, onPhoneMinutes } from "./golive-status.js";
import { askNameHtml } from "./team.js";

export function savingPanel(card) {
	const panel = card.querySelector("[data-saving]"), text = card.querySelector("[data-saving-text]"), bar = panel.querySelector("progress");
	// Saved, failed or a test is the last word: a progress update arriving after it (the camera can take longer to leave
	// full screen than the last parts take to send) mustn't put "Saving the video…" back.
	let finished = false;
	const finish = () => { finished = true; };
	return {
		/** In the middle of the screen: the page behind the camera is wherever it was, often its top. */
		show() {
			panel.hidden = false;
			panel.scrollIntoView({ block: "center" });
		},
		/** Upload progress from golive-rec.js, once the recording has stopped (totalParts known). */
		progress(p) {
			if (finished || !p?.totalParts) return;
			bar.max = p.totalParts;
			bar.value = p.uploadedParts;
			const waiting = p.waitingBytes > 0 ? ` ${Math.ceil(p.waitingBytes / 1e6)} MB to go.` : "";
			const behind = onPhoneMinutes({ waitingBytes: p.waitingBytes });
			// On a weak signal: what's still to send is only on this phone (kept there if the page closes). End game told the
			// site so, and it waits 12 hours for them before saving what reached it by itself (recording-save-service.ts).
			text.innerHTML = behind >= BEHIND_MINUTES
				? `<b>Saving the video…</b> Keep this page open until it says Saved: about ${behind} minutes of the game are still only on this phone.${waiting} On Wi-Fi it's quicker. Page closed before then? Open Go live on this phone again within 12 hours of End game and tap <b>Save what was recorded</b>: they're sent first.`
				: `<b>Saving the video…</b> Keep this page open.${waiting}`;
		},
		saved() {
			finish();
			bar.value = bar.max;
			text.innerHTML = `<b>Saved!</b> The game will be ready in Watch games in about 20 to 25 minutes. You can close this page. Ended before the final buzzer? Record the rest with the phone's Camera app and send it to ${askNameHtml()} afterwards.`;
		},
		failed(err) {
			finish();
			// Signed out mid-game, the parts recorded since couldn't be sent; what reached the site can still be saved.
			text.textContent = err.status === 401
				? "You've been signed out, so the rest of the video couldn't be sent. Reload the page, sign in with the code from your email, then tap Save what was recorded."
				: `The video couldn't be saved: ${err.message.replace(/\.$/, "")}. Reload the page, then tap Save what was recorded.`;
		},
		test(seconds) {
			finish();
			bar.hidden = true;
			text.innerHTML = `That was only ${seconds} seconds, so it was treated as a test and not saved. The game can still be streamed: reload the page when you're ready.`;
		},
	};
}
