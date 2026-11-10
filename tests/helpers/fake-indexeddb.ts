// A stand-in IndexedDB for the page scripts' tests: just what golive-store.js uses (one database, object stores keyed
// by `k` with one index each). Like the real thing, a request takes effect when it's made and answers a moment later.

type Row = Record<string, unknown> & { k: string };

function request<T>(result: T) {
	const req: { result: T; onsuccess: (() => void) | null; onerror: (() => void) | null } = { result, onsuccess: null, onerror: null };
	queueMicrotask(() => req.onsuccess?.());
	return req;
}

function objectStore(rows: Map<string, Row>) {
	const matching = (field: string, value: unknown) => [...rows.values()].filter((r) => r[field] === value);
	return {
		createIndex: () => {},
		put: (row: Row) => request(void rows.set(row.k, row)),
		delete: (k: string) => request(void rows.delete(k)),
		index: (field: string) => ({
			getAll: (value: unknown) => request(matching(field, value)),
			getAllKeys: (value: unknown) => request(matching(field, value).map((r) => r.k)),
		}),
	};
}

/** `rows(name)`: what an object store holds now, in key order. */
export function fakeIndexedDb() {
	const stores = new Map<string, Map<string, Row>>();
	const db = {
		createObjectStore: (name: string) => { stores.set(name, new Map()); return objectStore(stores.get(name)!); },
		transaction: (name: string) => ({ objectStore: () => objectStore(stores.get(name)!) }),
	};
	return {
		open() {
			const req = Object.assign(request(db), { onupgradeneeded: null as (() => void) | null });
			if (stores.size === 0) queueMicrotask(() => req.onupgradeneeded?.());
			return req;
		},
		rows: (name: string) => [...(stores.get(name)?.values() ?? [])].sort((a, b) => a.k.localeCompare(b.k)),
	};
}
