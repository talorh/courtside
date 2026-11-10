// Go live: the recording kept on the phone itself while it waits to go up. Each part cut from the recording, and the
// tail not yet long enough to be a part, sit in the browser's own storage (IndexedDB) until storage has them, so a page
// that dies mid-game (Safari closed, the tab killed) loses nothing it recorded: the next Go live page sends what's left
// (golive-kept.js). Without IndexedDB (an old browser, storage blocked) nothing is kept, as before.
const DB = "courtside-live", PARTS = "parts", TAIL = "tail";

const done = (req) => new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });

// A browser that never answers the open (another tab holding the database, say) mustn't hold up Save or Carry on.
const OPEN_MS = 5000;

function open() {
	const req = indexedDB.open(DB, 1);
	req.onupgradeneeded = () => {
		for (const name of [PARTS, TAIL]) req.result.createObjectStore(name, { keyPath: "k" }).createIndex("key", "key");
	};
	return Promise.race([done(req), new Promise((_, reject) => setTimeout(() => reject(new Error("storage didn't open")), OPEN_MS))]);
}

/**
 * The store: `key` names a recording's segment ("41/1": video 41, segment 1). Everything asked of it runs one after
 * another, in the order asked, so a tail cleared after a piece was kept never keeps that piece. Null when the browser
 * has no storage for it.
 */
export async function openStore() {
	try {
		const db = await open();
		let turn = Promise.resolve();
		const next = (job) => { const run = turn.then(job); turn = run.catch(() => {}); return run; };
		const tx = (name, mode, op) => next(() => done(op(db.transaction(name, mode).objectStore(name))));
		const list = (name, key) => tx(name, "readonly", (s) => s.index("key").getAll(key));
		const clearOf = (name, key) => next(async () => {
			const s = db.transaction(name, "readwrite").objectStore(name);
			for (const k of await done(s.index("key").getAllKeys(key))) s.delete(k);
		});
		// Kept as bytes, not Blobs: every browser stores those, and a Blob can point at a file the browser has let go of.
		const asBlob = (bytes, type) => new Blob([bytes], { type });
		// A write takes its turn when it's asked for, not once its bytes are read: a later clear can't run ahead of it.
		const put = (name, record, blob) => next(async () => {
			const bytes = await blob.arrayBuffer();
			await done(db.transaction(name, "readwrite").objectStore(name).put({ ...record, bytes, type: blob.type }));
		});
		return {
			putPart: (key, n, blob) => put(PARTS, { k: `${key}/${n}`, key, n }, blob),
			delPart: (key, n) => tx(PARTS, "readwrite", (s) => s.delete(`${key}/${n}`)),
			/** The parts kept for the segment, lowest number first. */
			listParts: async (key) => (await list(PARTS, key)).sort((a, b) => a.n - b.n).map(({ n, bytes, type }) => ({ n, blob: asBlob(bytes, type) })),
			putTail: (key, seq, blob) => put(TAIL, { k: `${key}/${String(seq).padStart(6, "0")}`, key, seq }, blob),
			clearTail: (key) => clearOf(TAIL, key),
			/** The tail's pieces in order: together, what came after the last part cut. */
			listTail: async (key) => (await list(TAIL, key)).sort((a, b) => a.seq - b.seq).map(({ bytes, type }) => asBlob(bytes, type)),
			clear: (key) => Promise.all([clearOf(PARTS, key), clearOf(TAIL, key)]),
		};
	} catch (err) {
		console.warn(`recording store: ${err}`);
		return null;
	}
}

/**
 * The keeper for one segment's recording: the page hands it what it records, and the next page reads back what storage
 * never got. Nothing it does can fail the recording: a store that fails only means nothing is kept.
 */
export function keeper(videoId, segment) {
	const key = `${videoId}/${segment}`;
	let store = null, seq = 0;
	const ready = openStore().then((s) => { store = s; return store?.clear(key); });
	const quiet = (job) => ready.then(() => store && job()).catch((err) => console.warn(`recording store: ${err}`));
	return {
		chunk: (blob) => quiet(() => store.putTail(key, seq++, blob)),
		part: (n, blob) => quiet(() => store.putPart(key, n, blob)),
		/** After a cut: the tail starts again from what's left over. */
		cutTail(rest) {
			seq = 0;
			const first = seq++;
			return quiet(async () => { await store.clearTail(key); if (rest.size > 0) await store.putTail(key, first, rest); });
		},
		sent: (n) => quiet(() => store.delPart(key, n)),
		clear: () => quiet(() => store.clear(key)),
	};
}

/**
 * What a page that died left behind for the next one to send: the parts kept that storage never confirmed (`etags`
 * has the confirmed ones, by part number), lowest first, then the tail as one more part after the highest number known.
 * `bytes`: all of it, for the minutes it's worth.
 */
export function recoveryPlan(stored, etags, mime) {
	const parts = stored.parts.filter((p) => !(p.n in etags)).sort((a, b) => a.n - b.n);
	const known = [...Object.keys(etags).map(Number), ...stored.parts.map((p) => p.n)];
	const tailBytes = stored.tail.reduce((sum, b) => sum + b.size, 0);
	const tail = tailBytes > 0 ? { n: Math.max(0, ...known) + 1, blob: new Blob(stored.tail, { type: mime }) } : null;
	return { parts, tail, bytes: parts.reduce((sum, p) => sum + p.blob.size, 0) + tailBytes };
}

/** What `store` holds for the segment, as a plan. */
export async function leftovers(store, key, etags, mime) {
	if (!store) return { parts: [], tail: null, bytes: 0 };
	return recoveryPlan({ parts: await store.listParts(key), tail: await store.listTail(key) }, etags, mime);
}
