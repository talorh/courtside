// Go live, on a page reopened after one closed mid-game: reading what this phone kept (golive-kept.js), tried again
// before giving up, as a phone just back from a crash can be slow to open its storage; and while it goes up, the
// panel's progress bar and a question before the page is refreshed or closed. golive-recover.js uses these for Save
// what was recorded and Carry on streaming.
import { keptOnPhone } from "./golive-kept.js";
import { api } from "./upload-net.js";

const TRIES = 3;
const WAIT_MS = 2000;

export const CHECKING = "Checking what's on this phone…";
export const UNREADABLE = "This phone's copy of the recording couldn't be read just now, so nothing has been saved yet: "
	+ "it's still on the phone. Close any other tabs, wait a few seconds, then tap Save again. Left alone, the site saves "
	+ "what reached it by itself within 12 hours.";

/** Tells the site's log what went wrong on the phone (golive-watch.js sends the rest). */
export const reportProblem = (gameId, what) => api(`/api/live/${gameId}/events`, { events: [{ s: 0, what: what.slice(0, 160), p: true }] })
	.catch((err) => console.warn(`live log: ${err.message ?? err}`));

/** What this phone kept for the recording (keptOnPhone), or `{ failed }` if it still can't be read after three tries;
 * the site hears of that. */
export async function readKept(gameId, state, mime) {
	for (let tries = 1; ; tries++) {
		try {
			return await keptOnPhone(gameId, state, mime);
		} catch (err) {
			console.warn(`recording store: ${err}`);
			if (tries >= TRIES) {
				reportProblem(gameId, `recording store unreadable: ${err?.message ?? err}`);
				return { failed: err };
			}
			await new Promise((resolve) => setTimeout(resolve, WAIT_MS));
		}
	}
}

/** Runs `job` with the page asking before it's refreshed or closed (what's on the phone is going up). */
export async function holdingPage(job) {
	const ask = (e) => { e.preventDefault(); e.returnValue = ""; };
	addEventListener("beforeunload", ask);
	try {
		return await job();
	} finally {
		removeEventListener("beforeunload", ask);
	}
}

/** `tell` with the panel's progress bar moved along as each part goes (golive-kept.js send: tell(text, { sent, count })). */
export const withBar = (tell, bar) => (text, p) => {
	tell(text);
	if (bar && p) {
		bar.hidden = false;
		bar.max = p.count;
		bar.value = p.sent;
	}
};

/**
 * Carry on streaming: what the old page kept (`k`, keptOnPhone) goes up while the game streams again, saying how it's
 * going (`say`). It answers with `left()` too, so End game and the Saving panel count what's still to go (golive-rec.js
 * before() waits on it). If it fails part way, the filmer is told those minutes are lost and the site's log hears of it.
 */
export function sendWhileStreaming(gameId, k, say) {
	const sent = k?.bytes > 0 ? k.send(say, true).then(() => say(""), (err) => {
		say("Some of what the closed page kept on this phone couldn't be sent, so those minutes won't be in the video.");
		reportProblem(gameId, `kept footage not sent: ${err?.message ?? err}`);
		throw err;
	}) : Promise.resolve();
	sent.catch(() => {}); // said and logged here; before() has its own once Carry on is tapped
	return Object.assign(sent, { left: () => k?.left() ?? 0 });
}
