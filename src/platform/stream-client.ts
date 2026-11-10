import { siteLabel, siteOf } from "./site-label.ts";

export type DownloadState = "none" | "inprogress" | "ready" | "error";

export interface StreamVideoState {
	readyToStream: boolean;
	state: string;
	errorReason: string;
	durationSeconds: number;
}

/** The Stream operations the app needs. Everything else in Stream is out of scope. */
export interface StreamPort {
	uploadFromUrl(url: string, options: { scheduledDeletion?: string; meta: Record<string, string> }): Promise<string>;
	/** Null when Stream no longer has the video (deleted there by hand, say). */
	details(uid: string): Promise<StreamVideoState | null>;
	generateDownload(uid: string): Promise<void>;
	downloadStatus(uid: string): Promise<DownloadState>;
	deleteVideo(uid: string): Promise<"deleted" | "already_gone">;
	/** Every video in the Stream account (clips too), for the daily orphan sweep; `site`: "staging" for staging's;
	 * `liveInput`: the input a recording of a live broadcast was made from. */
	listVideos(): Promise<Array<{ uid: string; created: string; site: string | null; liveInput: string | null }>>;
	/** Puts the site's metadata on a video Stream made by itself (a live recording keeps only its name), and staging's
	 * label on staging. */
	label(uid: string, meta: Record<string, string>): Promise<void>;
}

/** Stream's list answers this many at most. */
const PAGE = 1000;

interface ApiBody<T> { success: boolean; result?: T; errors?: Array<{ message?: string }> }
interface VideoResult { uid?: string; readyToStream?: boolean; duration?: number; status?: { state?: string; errorReasonCode?: string; errorReasonText?: string } }
interface DownloadsResult { default?: { status?: DownloadState } }

function parseBody<T>(text: string): ApiBody<T> {
	try {
		return JSON.parse(text) as ApiBody<T>;
	} catch {
		return { success: false, errors: [{ message: "the reply wasn't JSON" }] };
	}
}

/**
 * Stream through its REST API with a Stream-only token, so Stream can live in a different Cloudflare account from
 * the Worker (the Worker binding only reaches its own account). `site`: "staging" on staging, which labels what it
 * makes (the account's Stream is shared with the live site).
 */
export function createStreamClient(config: { accountId: string; apiToken: string; fetch?: typeof fetch; site?: string | null }): StreamPort {
	const doFetch = config.fetch ?? fetch;
	const base = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/stream`;

	/** Null when Stream says the video (or its download) doesn't exist; any other failure throws. */
	async function call<T>(path: string, init: RequestInit = {}): Promise<T | null> {
		const res = await doFetch(`${base}${path}`, {
			...init,
			headers: { Authorization: `Bearer ${config.apiToken}`, "Content-Type": "application/json" },
			signal: AbortSignal.timeout(15_000),
		});
		if (res.status === 404) return null;
		const text = await res.text();
		// A delete can answer with an empty body; anything else that isn't JSON (a Cloudflare error page) is a failure.
		const body = (text ? parseBody<T>(text) : { success: res.ok }) as ApiBody<T>;
		if (!res.ok || !body.success) {
			throw new Error(`Stream ${init.method ?? "GET"} ${path.split("/")[1] ?? ""} failed (${res.status}): ${body.errors?.[0]?.message ?? "no details"}`);
		}
		return (body.result ?? {}) as T;
	}

	return {
		async uploadFromUrl(url, options) {
			const video = await call<VideoResult>("/copy", {
				method: "POST",
				body: JSON.stringify({ url, requireSignedURLs: true, scheduledDeletion: options.scheduledDeletion, meta: { ...options.meta, ...siteLabel(config.site) } }),
			});
			if (!video?.uid) throw new Error("Stream copy returned no video id");
			return video.uid;
		},
		async details(uid) {
			const v = await call<VideoResult>(`/${uid}`);
			if (!v) return null;
			return {
				readyToStream: v.readyToStream ?? false,
				state: v.status?.state ?? "",
				errorReason: v.status?.errorReasonText || v.status?.errorReasonCode || "",
				durationSeconds: Math.round(v.duration ?? -1),
			};
		},
		async generateDownload(uid) {
			if (!(await call<unknown>(`/${uid}/downloads`, { method: "POST" }))) throw new Error(`Stream video ${uid} not found`);
		},
		async downloadStatus(uid) {
			return (await call<DownloadsResult>(`/${uid}/downloads`))?.default?.status ?? "none";
		},
		async deleteVideo(uid) {
			return (await call<unknown>(`/${uid}`, { method: "DELETE" })) === null ? "already_gone" : "deleted";
		},
		async label(uid, meta) {
			await call<unknown>(`/${uid}`, { method: "POST", body: JSON.stringify({ meta: { ...meta, ...siteLabel(config.site) } }) });
		},
		async listVideos() {
			// Stream lists up to 1,000 videos a page, newest first (clips count too): the next page is those made before the
			// oldest listed, until a page comes back short.
			type Listed = Array<{ uid?: string; created?: string; meta?: Record<string, unknown>; liveInput?: string | null }>;
			const all = new Map<string, { uid: string; created: string; site: string | null; liveInput: string | null }>();
			let before: string | undefined;
			for (let page = 0; page < 20; page++) {
				const list = (await call<Listed>(before ? `?before=${encodeURIComponent(before)}` : "")) ?? [];
				for (const v of list) if (v.uid && v.created) all.set(v.uid, { uid: v.uid, created: v.created, site: siteOf(v.meta), liveInput: v.liveInput ?? null });
				before = list.at(-1)?.created;
				if (list.length < PAGE || !before) break;
			}
			return [...all.values()];
		},
	};
}
