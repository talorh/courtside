// Go live: what closed pages left on this phone for a recording (golive-store.js), and sending it. The game's note
// (golive-rec.js) remembers one segment: the one being recorded. So when a page carries on while an earlier segment's
// kept parts are still going up, that segment is noted beside it (":kept") with each part that lands. A page closed
// again part way still knows them, and every part still goes up under its own segment and number.
import { stateKey } from "./golive-rec.js";
import { leftovers, openStore } from "./golive-store.js";
import { api, keepTrying, putPart } from "./upload-net.js";
import { forget, load, save } from "./upload-state.js";

const PART_TIMEOUT_MS = 5 * 60_000;
// What a recording's bytes are worth in minutes (2.5 Mbps, what the page asks for).
export const minutesOf = (bytes) => Math.round((bytes * 8) / 2_500_000 / 60);
const earlierKey = (gameId) => `${stateKey(gameId)}:kept`;
const storeKey = (s) => `${s.videoId}/${s.segment ?? 1}`;
const segmentOf = (s) => s.segment ?? 1;

/** Forgets the game's notes: its recording is saved or deleted, or was by another phone. */
export function forgetNotes(gameId) {
	forget(stateKey(gameId));
	forget(earlierKey(gameId));
}

/**
 * What this phone still holds for the recording in the game's note (`state`) and for its earlier segments. `bytes`: all
 * of it; `own`: the noted segment's share. `send(tell, movingOn)` sends it, earliest segment first, each part noted as
 * it lands; asked twice, it's sent once. `movingOn`: a new segment is about to take the game's note, so this one is
 * noted with the earlier ones first. `clear()` drops it all.
 */
export async function keptOnPhone(gameId, state, mime) {
	const store = await openStore();
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
	for (const s of [...earlier, state]) plans.set(s, await leftovers(store, storeKey(s), (s.etags ??= {}), mime));
	const bytes = [...plans.values()].reduce((sum, p) => sum + p.bytes, 0);
	const noteEarlier = () => (earlier.length ? save(earlierKey(gameId), earlier) : forget(earlierKey(gameId)));
	async function sendAll(tell, movingOn) {
		if (movingOn && plans.get(state).bytes > 0 && !earlier.includes(state)) earlier = [...earlier, state];
		noteEarlier();
		const count = [...plans.values()].reduce((sum, p) => sum + p.parts.length + (p.tail ? 1 : 0), 0);
		let i = 0;
		for (const [s, plan] of plans) {
			// Each leaves the plan as it lands, so a send that's refused part way and asked for again sends only the rest.
			for (let next; (next = plan.parts[0] ?? plan.tail); ) {
				const { n, blob } = next;
				tell(`Sending what was still on this phone: part ${++i} of ${count}…`);
				const { urls } = await keepTrying(() => api(`/api/uploads/${s.videoId}/part-urls`, { partNumbers: [n], segment: segmentOf(s) }), () => {});
				s.etags[n] = await keepTrying(() => putPart(urls[n], blob, undefined, PART_TIMEOUT_MS), () => {});
				if (earlier.includes(s)) noteEarlier();
				else save(stateKey(gameId), s);
				await store.delPart(storeKey(s), n);
				if (next === plan.tail) plan.tail = null;
				else plan.parts.shift();
			}
			plan.bytes = 0;
			await store?.clear(storeKey(s));
			earlier = earlier.filter((e) => e !== s);
			noteEarlier();
		}
	}
	let going = null;
	return {
		bytes, own: plans.get(state).bytes,
		send: (tell, movingOn = false) => (going ??= sendAll(tell, movingOn).finally(() => { going = null; })),
		clear: () => Promise.all([...plans.keys()].map((s) => store?.clear(storeKey(s)))),
	};
}
