// Stream Live inputs (and storage usage) aren't on the Worker binding either, so they use the REST API with the Stream-only token.
import { siteLabel, siteOf } from "./site-label.ts";
import { type AppLivePort, appLive, STALE_SECONDS } from "./stream-live-app.ts";

/** A game's live input. The WHIP address is secret (it lets anyone broadcast to the game): never log it. */
export interface LiveInput {
	uid: string;
	/** WHIP address the Go live page streams to. */
	whipUrl: string;
}

export interface LivePort extends AppLivePort {
	/** Signed playback only, so live viewing stays members-only. `teamId` goes in the input's metadata, as uploads, clips
	 * and photos carry theirs. */
	createInput(name: string, teamId: string): Promise<LiveInput>;
	/** Null when Stream no longer has the input (deleted). */
	getInput(uid: string): Promise<LiveInput | null>;
	/** Is a phone sending to the input right now? Never once Stream no longer has it, nor a status it last saw minutes ago. */
	isConnected(uid: string): Promise<boolean>;
	/** Stops the input accepting broadcasts (done already if Stream no longer has it). */
	disableInput(uid: string): Promise<void>;
	/** Accepts broadcasts again (streaming again after a test), same address. */
	enableInput(uid: string): Promise<void>;
	/** Every live input in the Stream account (`site`: "staging" for staging's), and removing one, for the daily orphan sweep. */
	listInputs(): Promise<Array<{ uid: string; created: string; site: string | null }>>;
	deleteInput(uid: string): Promise<"deleted" | "already_gone">;
	/** Stream storage for the whole account: minutes used and the plan's limit (uploads and live stop when full). */
	storage(): Promise<{ usedMinutes: number; limitMinutes: number }>;
}

interface ApiBody<T> { success: boolean; result?: T; errors?: Array<{ message?: string }> }
interface InputResult {
	uid?: string;
	webRTC?: { url?: string };
	status?: { current?: { state?: string; statusLastSeen?: string } } | null;
}

export function createLiveClient(config: { accountId: string; apiToken: string; fetch?: typeof fetch; site?: string | null; now?: () => Date }): LivePort {
	const doFetch = config.fetch ?? fetch;
	const now = config.now ?? (() => new Date());
	const base = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/stream`;

	/** Null when Stream says there's no such input (404); any other failure throws. */
	async function callOrMissing<T>(path: string, init: RequestInit = {}): Promise<T | null> {
		const res = await doFetch(`${base}${path}`, {
			...init,
			headers: { Authorization: `Bearer ${config.apiToken}`, "Content-Type": "application/json" },
			signal: AbortSignal.timeout(15_000),
		});
		if (res.status === 404) return null;
		const body = (await res.json().catch(() => ({ success: false }))) as ApiBody<T>;
		if (!res.ok || !body.success || body.result === undefined) {
			throw new Error(`Stream live ${init.method ?? "GET"} failed (${res.status}): ${body.errors?.[0]?.message ?? "no details"}`);
		}
		return body.result;
	}

	async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
		const result = await callOrMissing<T>(path, init);
		if (result === null) throw new Error(`Stream live ${init.method ?? "GET"} failed (404): no such live input`);
		return result;
	}

	const toInput = (r: InputResult): LiveInput => {
		if (!r.uid || !r.webRTC?.url) throw new Error("Stream live input response is missing its WebRTC address");
		return { uid: r.uid, whipUrl: r.webRTC.url };
	};

	return {
		...appLive({ call, callOrMissing, now }),
		// Stream can't record a browser (WebRTC) stream, so nothing is recorded here: the phone records the game itself.
		// The recording settings are only for requireSignedURLs, which keeps live viewing to signed (members') links.
		async createInput(name, teamId) {
			return toInput(await call<InputResult>("/live_inputs", {
				method: "POST",
				body: JSON.stringify({ meta: { name, teamId, ...siteLabel(config.site) }, recording: { mode: "automatic", requireSignedURLs: true } }),
			}));
		},
		async getInput(uid) {
			const r = await callOrMissing<InputResult>(`/live_inputs/${uid}`);
			return r && toInput(r);
		},
		async isConnected(uid) {
			const current = (await callOrMissing<InputResult>(`/live_inputs/${uid}`))?.status?.current;
			if (current?.state !== "connected") return false;
			return !current.statusLastSeen || now().getTime() - Date.parse(current.statusLastSeen) < STALE_SECONDS * 1000;
		},
		async disableInput(uid) {
			await callOrMissing<unknown>(`/live_inputs/${uid}`, { method: "PUT", body: JSON.stringify({ enabled: false }) });
		},
		async enableInput(uid) {
			await call<unknown>(`/live_inputs/${uid}`, { method: "PUT", body: JSON.stringify({ enabled: true }) });
		},
		async listInputs() {
			type Listed = Array<{ uid?: string; created?: string; meta?: Record<string, unknown> }>;
			// A plain list, or { liveInputs } when Stream adds counts.
			const r = await call<Listed | { liveInputs?: Listed }>("/live_inputs");
			const list = Array.isArray(r) ? r : r.liveInputs ?? [];
			return list.filter((i) => i.uid && i.created).map((i) => ({ uid: i.uid!, created: i.created!, site: siteOf(i.meta) }));
		},
		async deleteInput(uid) {
			const res = await doFetch(`${base}/live_inputs/${uid}`, {
				method: "DELETE", headers: { Authorization: `Bearer ${config.apiToken}` }, signal: AbortSignal.timeout(15_000),
			});
			if (res.status === 404) return "already_gone";
			if (!res.ok) throw new Error(`Stream live DELETE failed (${res.status})`);
			return "deleted";
		},
		async storage() {
			const r = await call<{ totalStorageMinutes?: number; totalStorageMinutesLimit?: number }>("/storage-usage");
			return { usedMinutes: r.totalStorageMinutes ?? 0, limitMinutes: r.totalStorageMinutesLimit ?? 0 };
		},
	};
}
