// Go live: what closed pages left on this phone for a recording (golive-store.js), and sending it. The game's note
// (golive-rec.js) remembers one segment: the one being recorded. So when a page carries on while an earlier segment's
// kept parts are still going up, that segment is noted beside it (":kept") with each part that lands. A page closed
// again part way still knows them, and every part still goes up under its own segment and number.
import { stateKey } from "./golive-rec.js";
import { leftovers, openStore } from "./golive-store.js";
import { api, keepTrying, putPart } from "./upload-net.js";
import { forget, load, save } from "./upload-state.js";

const PART_TIMEOUT_MS = 5 * 60_000;
// A part's size when a note doesn't say (the site's LIVE_PART_SIZE).
const PART_SIZE = 8 * 1024 * 1024;
/** What a recording's bytes are worth in minutes: at the phone's own rate (`perMinute`, the note's bytesPerMinute) when
 * it's known, else at the 2.5 Mbps the page asks for. */
export const minutesOf = (bytes, perMinute) => Math.round(perMinute ? bytes / perMinute : (bytes * 8) / 2_500_000 / 60);
const mb = (bytes) => Math.ceil(bytes / 1e6);

/** What Save or Carry on says as each kept part goes: which of how many, what's to go and, once a part or two have
 * gone (`sentBytes` in `elapsedMs`), about how long the rest will take; and to keep the page open. */
export function sendingWords({ i, count, left, sentBytes = 0, elapsedMs = 0 }) {
	const rest = sentBytes > 0 && elapsedMs >= 5000 ? Math.max(1, Math.ceil(left / (sentBytes / elapsedMs) / 60_000)) : null;
	const time = rest ? `, about ${rest} ${rest === 1 ? "minute" : "minutes"}` : "";
	return `Sending what was still on this phone: part ${i} of ${count}, ${mb(left)} MB to go${time}. Keep this page open: don't refresh or close it.`;
}
const earlierKey = (gameId) => `${stateKey(gameId)}:kept`;
/** Whether an earlier segment of the game is noted as still having footage on this phone. */
export const earlierNoted = (gameId) => { const note = load(earlierKey(gameId)); return Array.isArray(note) && note.length > 0; };
// A failure of the phone's own storage, told apart from the network's: the page says the phone's copy couldn't be read.
const fromPhone = async (job) => {
	try {
		return await job();
	} catch (err) {
		throw Object.assign(err instanceof Error ? err : new Error(String(err)), { storage: true });
	}
};
const storeKey = (s) => `${s.videoId}/${s.segment ?? 1}`;
const segmentOf = (s) => s.segment ?? 1;

/** Forgets the game's notes: its recording is saved or deleted, or was by another phone. */
export function forgetNotes(gameId) {
	forget(stateKey(gameId));
	forget(earlierKey(gameId));
}

/**
 * The site no longer has the noted recording open (saved or deleted, here or elsewhere), so nothing this phone kept of
 * it can go up any more: the notes are forgotten at once (a new recording may take the game's note next), then every
 * segment's kept footage is cleared.
 */
export async function dropKept(gameId) {
	const state = load(stateKey(gameId));
	forgetNotes(gameId);
	if (!state?.videoId) return;
	const store = await openStore();
	for (let n = 1; n <= segmentOf(state); n++) await store?.clear(`${state.videoId}/${n}`);
}

/**
 * What this phone still holds for the recording in the game's note (`state`) and for its earlier segments. `bytes`: all
 * of it; `own`: the noted segment's share. `send(tell, movingOn)` sends it, earliest segment first, each part noted as
 * it lands; asked twice, it's sent once. `movingOn`: a new segment is about to take the game's note, so this one is
 * noted with the earlier ones first. `left()`: the bytes not yet in storage. `clear()` drops it all.
 */
export async function keptOnPhone(gameId, state, mime) {
	const store = await openStore({ strict: true });
	state.etags ??= {};
	const note = load(earlierKey(gameId));
	const noted = (Array.isArray(note) ? note : []).filter((s) => String(s.videoId) === String(state.videoId));
	// Noted as moving on, but the next segment never started: the parts that landed since are in that note, and go
	// into the game's own before anything else, so the tail is numbered after them whenever a page closes.
	const twin = noted.find((s) => segmentOf(s) === segmentOf(state));
	if (twin) {
		Object.assign(state.etags, twin.etags);
		save(stateKey(gameId), state);
	}
	let earlier = noted.filter((s) => s !== twin);
	const plans = new Map();
	for (const s of [...earlier, state]) plans.set(s, await leftovers(store, storeKey(s), (s.etags ??= {}), mime, s.partSize ?? PART_SIZE));
	const bytes = [...plans.values()].reduce((sum, p) => sum + p.bytes, 0);
	const noteEarlier = () => (earlier.length ? save(earlierKey(gameId), earlier) : forget(earlierKey(gameId)));
	const logProblem = (what) => api(`/api/live/${gameId}/events`, { events: [{ s: 0, what: what.slice(0, 160), p: true }] }).catch((err) => console.warn(`live log: ${err}`));
	// Letting go of a part that has landed: it's in storage, so a failure here mustn't stop the send or have the part
	// read again (a tail read again would go up a second time under the next number).
	const tidy = (job, what) => fromPhone(job).catch((err) => { console.warn(`recording store: ${err}`); logProblem(`recording store couldn't clear ${what}: ${err.message ?? err}`); });
	const left = () => [...plans.values()].reduce((sum, p) => sum + p.parts.reduce((s, x) => s + x.size, 0) + (p.tail?.blob.size ?? 0), 0);
	async function sendAll(tell, movingOn) {
		if (movingOn && plans.get(state).bytes > 0 && !earlier.includes(state)) earlier = [...earlier, state];
		noteEarlier();
		const count = [...plans.values()].reduce((sum, p) => sum + p.parts.length + (p.tail ? 1 : 0), 0);
		const started = Date.now();
		let i = 0, sentBytes = 0;
		for (const [s, plan] of plans) {
			// Each leaves the plan as it lands, so a send that's refused part way and asked for again sends only the rest.
			for (let next; (next = plan.parts[0] ?? plan.tail); ) {
				const { n } = next;
				tell(sendingWords({ i: ++i, count, left: left(), sentBytes, elapsedMs: Date.now() - started }), { sent: i - 1, count });
				// Read from the phone now, one part at a time: all of them at once can be more than the page can hold.
				const blob = next.blob ?? await fromPhone(() => store.getPart(storeKey(s), n));
				if (!blob) logProblem(`kept part ${n} of segment ${segmentOf(s)} was gone from the phone`);
				if (blob) {
					// A fresh link each try: one from before a night's wait has run out (403).
					s.etags[n] = await keepTrying(async () => {
						const { urls } = await api(`/api/uploads/${s.videoId}/part-urls`, { partNumbers: [n], segment: segmentOf(s) });
						return putPart(urls[n], blob, undefined, PART_TIMEOUT_MS);
					}, () => {});
					sentBytes += blob.size;
				}
				if (earlier.includes(s)) noteEarlier();
				else save(stateKey(gameId), s);
				await tidy(() => store.delPart(storeKey(s), n), `part ${n}`);
				if (next === plan.tail) plan.tail = null;
				else plan.parts.shift();
			}
			plan.bytes = 0;
			await tidy(() => store?.clear(storeKey(s)), `segment ${segmentOf(s)}`);
			earlier = earlier.filter((e) => e !== s);
			noteEarlier();
		}
		if (count > 0) tell("Sent what was on this phone.", { sent: count, count });
	}
	let going = null;
	return {
		bytes, own: plans.get(state).bytes,
		send: (tell, movingOn = false) => (going ??= sendAll(tell, movingOn).finally(() => { going = null; })),
		left,
		clear: () => Promise.all([...plans.keys()].map((s) => store?.clear(storeKey(s)))),
	};
}
