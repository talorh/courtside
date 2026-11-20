// A stand-in IndexedDB for the page scripts' tests: just what golive-store.js uses (one database, object stores keyed
// by `k` with one index each). Like the real thing, a request takes effect when it's made and answers a moment later.

type Row = Record<string, unknown> & { k: string };

function request<T>(result: T) {
	const req: { result: T; onsuccess: (() => void) | null; onerror: (() => void) | null } = { result, onsuccess: null, onerror: null };
	queueMicrotask(() => req.onsuccess?.());
	return req;
}

type Hooks = { failGets: boolean; failDeletes: boolean };

function objectStore(rows: Map<string, Row>, hooks: Hooks = { failGets: false, failDeletes: false }) {
	const matching = (field: string, value: unknown) => [...rows.values()].filter((r) => r[field] === value);
	return {
		createIndex: () => {},
		put: (row: Row) => request(void rows.set(row.k, row)),
		delete: (k: string) => {
			if (hooks.failDeletes) throw new DOMException("The database connection is closing.", "InvalidStateError");
			return request(void rows.delete(k));
		},
		get: (k: string) => {
			if (hooks.failGets) throw new DOMException("The database connection is closing.", "InvalidStateError");
			return request(rows.get(k));
		},
		index: (field: string) => ({
			getAll: (value: unknown) => request(matching(field, value)),
			getAllKeys: (value: unknown) => request(matching(field, value).map((r) => r.k)),
		}),
	};
}

/** `rows(name)`: what an object store holds now, in key order. `transactions`: the stores each transaction was opened
 * over, in order. `failGets`, `failDeletes`: every single-row read, or delete, fails, as when the browser lets go of
 * its database part way. */
export function fakeIndexedDb() {
	const stores = new Map<string, Map<string, Row>>();
	const transactions: string[][] = [];
	const hooks: Hooks = { failGets: false, failDeletes: false };
	const db = {
		createObjectStore: (name: string) => { stores.set(name, new Map()); return objectStore(stores.get(name)!, hooks); },
		transaction: (names: string | string[]) => {
			transactions.push([names].flat());
			return { objectStore: (name: string) => objectStore(stores.get(name)!, hooks) };
		},
	};
	return {
		open() {
			const req = Object.assign(request(db), { onupgradeneeded: null as (() => void) | null });
			if (stores.size === 0) queueMicrotask(() => req.onupgradeneeded?.());
			return req;
		},
		transactions,
		get failGets() { return hooks.failGets; },
		set failGets(on: boolean) { hooks.failGets = on; },
		get failDeletes() { return hooks.failDeletes; },
		set failDeletes(on: boolean) { hooks.failDeletes = on; },
		rows: (name: string) => [...(stores.get(name)?.values() ?? [])].sort((a, b) => a.k.localeCompare(b.k)),
	};
}
