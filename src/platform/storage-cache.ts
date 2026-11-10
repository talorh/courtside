import type { LivePort } from "./stream-live.ts";

type Usage = Awaited<ReturnType<LivePort["storage"]>>;

/** How long one Stream storage answer is reused. It only feeds the admins' low-storage banner. */
export const STORAGE_CACHE_MS = 10 * 60_000;

/** One per Worker instance (made in src/index.ts), so admin pages skip a ~300 ms Stream call most of the time. */
export interface StorageCache {
	value: Usage | null;
	at: number;
}

export const newStorageCache = (): StorageCache => ({ value: null, at: 0 });

/** The same live client, but storage() answers from the cache while it's fresh. Failures aren't kept. */
export function withCachedStorage(live: LivePort, cache: StorageCache, now: () => Date): LivePort {
	return {
		createInput: (name, teamId) => live.createInput(name, teamId),
		getInput: (uid) => live.getInput(uid),
		isConnected: (uid) => live.isConnected(uid),
		disableInput: (uid) => live.disableInput(uid),
		enableInput: (uid) => live.enableInput(uid),
		listInputs: () => live.listInputs(),
		deleteInput: (uid) => live.deleteInput(uid),
		appAddress: (uid) => live.appAddress(uid),
		appConnected: (uid) => live.appConnected(uid),
		recordings: (uid) => live.recordings(uid),
		keepTogether: (uid, seconds) => live.keepTogether(uid, seconds),
		async storage() {
			const t = now().getTime();
			if (cache.value && t - cache.at < STORAGE_CACHE_MS) return cache.value;
			const value = await live.storage();
			cache.value = value;
			cache.at = t;
			return value;
		},
	};
}
