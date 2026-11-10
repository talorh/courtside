// An external app's side of a Stream live input: its RTMPS address, whether the app is sending, and the recordings Stream
// makes of what it sends (a browser's WebRTC stream has none of these: Stream can't record it).

export type RecordingState = "live" | "processing" | "ready" | "error";

/** One broadcast to an input, as Stream recorded it. `live` until Stream has finished it. */
export interface LiveRecording {
	uid: string;
	state: RecordingState;
	durationSeconds: number;
	createdAt: string;
}

export interface AppLivePort {
	/** Where an external app sends its stream. The key is secret (it lets anyone broadcast to the game): never log it.
	 * Null once Stream no longer has the input. */
	appAddress(uid: string): Promise<{ url: string; streamKey: string } | null>;
	/** Is an external app sending to the input right now? Never a browser's stream, nor a status Stream last saw minutes ago. */
	appConnected(uid: string): Promise<boolean>;
	/** Every broadcast Stream recorded from the input, in Stream's order. None once Stream no longer has the input. */
	recordings(uid: string): Promise<LiveRecording[]>;
	/** How long an external app can drop out before Stream starts a new recording (0: every reconnect is a new one). */
	keepTogether(uid: string, seconds: number): Promise<void>;
}

// Stream keeps saying "connected" for a while after the sender has gone; it stamps the status every few seconds while
// something is really arriving.
export const STALE_SECONDS = 120;

interface AppInputResult {
	rtmps?: { url?: string; streamKey?: string };
	status?: { current?: { state?: string; ingestProtocol?: string; statusLastSeen?: string } } | null;
}
interface VideoResult { uid?: string; status?: { state?: string }; duration?: number; created?: string }

const stateOf = (s: string | undefined): RecordingState =>
	s === "live-inprogress" ? "live" : s === "ready" ? "ready" : s === "error" ? "error" : "processing";

interface Calls {
	call<T>(path: string, init?: RequestInit): Promise<T>;
	callOrMissing<T>(path: string, init?: RequestInit): Promise<T | null>;
	now: () => Date;
}

export function appLive({ call, callOrMissing, now }: Calls): AppLivePort {
	return {
		async appAddress(uid) {
			const r = await callOrMissing<AppInputResult>(`/live_inputs/${uid}`);
			if (!r) return null;
			if (!r.rtmps?.url || !r.rtmps.streamKey) throw new Error("Stream live input response is missing its RTMPS address");
			return { url: r.rtmps.url, streamKey: r.rtmps.streamKey };
		},
		async appConnected(uid) {
			const current = (await callOrMissing<AppInputResult>(`/live_inputs/${uid}`))?.status?.current;
			if (current?.state !== "connected" || current.ingestProtocol === "webrtc") return false;
			return !current.statusLastSeen || now().getTime() - Date.parse(current.statusLastSeen) < STALE_SECONDS * 1000;
		},
		async recordings(uid) {
			const list = (await callOrMissing<VideoResult[]>(`/live_inputs/${uid}/videos`)) ?? [];
			return list.filter((v) => v.uid).map((v) => ({
				uid: v.uid!, state: stateOf(v.status?.state), durationSeconds: Math.max(0, v.duration ?? 0), createdAt: v.created ?? "",
			}));
		},
		// The whole recording object, as Stream replaces it: still recorded, still signed links only.
		async keepTogether(uid, seconds) {
			await call<unknown>(`/live_inputs/${uid}`, {
				method: "PUT", body: JSON.stringify({ recording: { mode: "automatic", requireSignedURLs: true, timeoutSeconds: seconds } }),
			});
		},
	};
}
