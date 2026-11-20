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
 * has no storage for it, or when it won't open; `strict`: one that won't open is an error, so a page reading back what
 * the phone kept can tell "nothing kept" from "couldn't look".
 */
export async function openStore({ strict = false } = {}) {
	if (typeof indexedDB === "undefined" || !indexedDB) return null;
	try {
		const db = await open();
		let turn = Promise.resolve();
		const next = (job) => { const run = turn.then(job); turn = run.catch(() => {}); return run; };
		const tx = (name, mode, op) => next(() => done(op(db.transaction(name, mode).objectStore(name))));
		const list = (name, key) => tx(name, "readonly", (s) => s.index("key").getAll(key));
		const keysOf = (name, key) => tx(name, "readonly", (s) => s.index("key").getAllKeys(key));
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
		const partRow = (key, n, bytes, type) => ({ k: `${key}/${n}`, key, n, bytes, type });
		const tailRow = (key, seq, bytes, type) => ({ k: `${key}/${String(seq).padStart(6, "0")}`, key, seq, bytes, type });
		return {
			putPart: (key, n, blob) => put(PARTS, partRow(key, n), blob),
			delPart: (key, n) => tx(PARTS, "readwrite", (s) => s.delete(`${key}/${n}`)),
			/** The numbers of the parts kept for the segment, lowest first: not their bytes, which together can be most of a
			 * game, more than a phone's page can hold at once. */
			listParts: async (key) => (await keysOf(PARTS, key)).map((k) => ({ n: Number(String(k).slice(String(k).lastIndexOf("/") + 1)) })).sort((a, b) => a.n - b.n),
			/** One kept part's bytes, or null if it's gone (sent and let go). */
			getPart: async (key, n) => {
				const row = await tx(PARTS, "readonly", (s) => s.get(`${key}/${n}`));
				return row ? asBlob(row.bytes, row.type) : null;
			},
			putTail: (key, seq, blob) => put(TAIL, tailRow(key, seq), blob),
			/** Parts cut from the tail (`[{ n, blob }]`), and the tail started again as `rest`, in one transaction: a page that
			 * dies part way keeps the bytes either as the tail or as parts, never as both. */
			cutParts: (key, parts, rest) => next(async () => {
				const bytes = await Promise.all([...parts.map((p) => p.blob), rest].map((b) => b.arrayBuffer()));
				const t = db.transaction([PARTS, TAIL], "readwrite"), tail = t.objectStore(TAIL);
				const old = done(tail.index("key").getAllKeys(key)); // asked first, so it answers before the writes below
				const asked = parts.map((p, i) => done(t.objectStore(PARTS).put(partRow(key, p.n, bytes[i], p.blob.type))));
				for (const k of await old) asked.push(done(tail.delete(k)));
				if (rest.size > 0) asked.push(done(tail.put(tailRow(key, 0, bytes[bytes.length - 1], rest.type))));
				await Promise.all(asked);
			}),
			/** The tail's pieces in order: together, what came after the last part cut. */
			listTail: async (key) => (await list(TAIL, key)).sort((a, b) => a.seq - b.seq).map(({ bytes, type }) => asBlob(bytes, type)),
			clear: (key) => Promise.all([clearOf(PARTS, key), clearOf(TAIL, key)]),
		};
	} catch (err) {
		if (strict) throw err;
		console.warn(`recording store: ${err}`);
		return null;
	}
}

/**
 * The keeper for one segment's recording: the page hands it what it records, and the next page reads back what storage
 * never got. Nothing it does can fail the recording: a store that fails only means nothing is kept, and `onProblem(err)`
 * hears of it once (the page sends it to the site's log). `opened` answers whether the store opened at all: if not,
 * nothing of this recording is kept on the phone.
 */
export function keeper(videoId, segment, onProblem = () => {}) {
	const key = `${videoId}/${segment}`;
	let store = null, seq = 0, told = false;
	const tell = (err) => {
		console.warn(`recording store: ${err}`);
		if (!told) { told = true; onProblem(err); }
	};
	const ready = openStore({ strict: true }).then((s) => { store = s; return store?.clear(key); });
	ready.catch(tell);
	const quiet = (job) => ready.then(() => store && job(), () => null).catch((err) => { tell(err); return null; });
	return {
		opened: ready.then(() => store !== null, () => false),
		chunk: (blob) => quiet(() => store.putTail(key, seq++, blob)),
		/** Parts cut from the recording (`[{ n, blob }]`): kept, and the tail starts again from what's left over. */
		cut(parts, rest) {
			seq = 1; // what's left over is the tail's piece 0
			return quiet(() => store.cutParts(key, parts, rest));
		},
		sent: (n) => quiet(() => store.delPart(key, n)),
		clear: () => quiet(() => store.clear(key)),
	};
}

/**
 * What a page that died left behind for the next one to send: the parts kept that storage never confirmed (`etags`
 * has the confirmed ones, by part number), lowest first, each `partSize` (every part but a last one cut at End game
 * is), then the tail as one more part after the highest number known. `bytes`: all of it, for the minutes it's worth.
 */
export function recoveryPlan(stored, etags, mime, partSize) {
	const parts = stored.parts.filter((p) => !(p.n in etags)).sort((a, b) => a.n - b.n).map(({ n }) => ({ n, size: partSize }));
	const known = [...Object.keys(etags).map(Number), ...stored.parts.map((p) => p.n)];
	const tailBytes = stored.tail.reduce((sum, b) => sum + b.size, 0);
	const tail = tailBytes > 0 ? { n: Math.max(0, ...known) + 1, blob: new Blob(stored.tail, { type: mime }) } : null;
	return { parts, tail, bytes: parts.length * partSize + tailBytes };
}

/** What `store` holds for the segment, as a plan. */
export async function leftovers(store, key, etags, mime, partSize) {
	if (!store) return { parts: [], tail: null, bytes: 0 };
	return recoveryPlan({ parts: await store.listParts(key), tail: await store.listTail(key) }, etags, mime, partSize);
}
