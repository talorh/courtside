// The joiner: a second Worker (join/) whose Durable Object carries an ffmpeg container that joins a carried-on
// recording's segments into one file. The site hands it links and nothing else: no team, no database. A join takes
// minutes, so it isn't waited for: one ask begins it and is answered at once, and later asks say how it's going.
// Null in cf dev and wherever the binding isn't there (features/live/join-service.ts then waits and says so).

/** `start`: begin the join if the joiner has none for this output. False only asks how one already begun is going. */
export interface JoinRequest { segments: string[]; output: string; container: "mp4" | "webm"; start: boolean }

/** A finished join, as the nightly check waits for one. */
export type JoinResult = { ok: true; bytes: number; seconds: number } | { ok: false; reason: string };

/** How the join for an output is going. A finished one (done or failed) is told once, then forgotten: `none`. */
export type JoinAnswer =
	| { ok: true; state: "running"; started?: boolean }
	| { ok: true; state: "none" }
	| { ok: true; state: "done"; bytes: number; seconds: number }
	| { ok: false; reason: string; state?: "failed" };

export interface JoinerPort {
	join(req: JoinRequest): Promise<JoinAnswer>;
	/** The nightly check: two tiny files shipped in the image, joined; how long it took. */
	selfTest(): Promise<JoinResult>;
}

// An ask is answered at once; the minute allows for a container that was asleep and has to start.
const ASK_TIMEOUT_MS = 60_000;

/** One Durable Object, "joiner", for the whole site: one join at a time, as the container is one instance. */
export function createJoiner(ns: DurableObjectNamespace): JoinerPort {
	const call = async <T extends { ok: boolean }>(path: string, body: unknown): Promise<T> => {
		const stub = ns.get(ns.idFromName("joiner"));
		const res = await stub.fetch(`https://joiner${path}`, {
			method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(ASK_TIMEOUT_MS),
		});
		const json = (await res.json().catch(() => null)) as T | null;
		if (!json || typeof json.ok !== "boolean") throw new Error(`joiner ${path}: HTTP ${res.status} with no answer`);
		return json;
	};
	return { join: (req) => call<JoinAnswer>("/join", req), selfTest: () => call<JoinResult>("/self-test", {}) };
}
