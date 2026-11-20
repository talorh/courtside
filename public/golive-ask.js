// Go live's Save what was recorded and Carry on streaming (golive-recover.js): the site can answer "wait" while the
// last of a recording arrives or Stream lets go of the old page; the page asks again until it's ready, counting down.
import { api } from "./upload-net.js";

// The site's "wait" answers (Save, Carry on): a part arrived in the last two minutes, or Stream still sees a phone.
const WAITING = {
	sending: "The last of the recording is still arriving (the site waits two minutes after the last part, in case the old page is still sending). Keep this page open.",
	streaming: "The stream from the closed page is still finishing: this takes a minute or two. Keep this page open. (If someone else is now filming this game from another phone, don't carry on.)",
};
const sleep = (seconds) => new Promise((resolve) => setTimeout(resolve, seconds * 1000));
const clock = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

/** Asks the site until it's no longer "wait": the answer. Meanwhile the button counts the wait down ("Carrying on in 1:20…")
 * or says it's getting ready (`readying`), and the panel says why. */
export async function askUntilReady(path, body, button, doing, readying, tell) {
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
