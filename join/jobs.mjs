// The joiner's jobs. A game's join takes minutes, longer than a request should be held, so a join runs on after the ask
// that began it and the site asks again for how it went. A job is known by where its file goes; jobs run one at a
// time (the instance has half a CPU and one disk), each stopped at a limit. A finished job is told once, then forgotten:
// a failed one begins again on the next ask that may start it. Plain Node, so the tests run it without a container
// (tests/join/jobs.test.ts).

// A whole game joins in well under this; the site's links last longer.
const LIMIT_MS = 40 * 60_000;

/** The job a request is for: its output link's path (the bucket and key), which stays the same however it's signed. */
export const jobId = (output) => new URL(output).pathname;

/**
 * `run(req, signal)` does a join and resolves with { ok: true, bytes, seconds, took } or { ok: false, reason }.
 * Returns { ask(req), idle() }: ask answers at once (running, done, failed, or none when `req.start` is false and no
 * such job is known); idle resolves once nothing is running or waiting.
 */
export function createJobs(run, { limitMs = LIMIT_MS, log = (line) => console.log(JSON.stringify(line)) } = {}) {
	const jobs = new Map();
	let turn = Promise.resolve();

	async function work(id, req) {
		const signal = AbortSignal.timeout(limitMs);
		let result;
		try {
			result = await run(req, signal);
		} catch (err) {
			result = { ok: false, reason: err instanceof Error ? err.message : String(err) };
		}
		if (!result.ok && signal.aborted) result = { ok: false, reason: `the join took over ${Math.round(limitMs / 60_000)} minutes and was stopped` };
		jobs.set(id, result.ok ? { ...result, state: "done" } : { ok: false, state: "failed", reason: result.reason });
		const { ok, ...rest } = result;
		log({ event: ok ? "join_done" : "join_failed", job: id, ...rest });
	}

	return {
		ask(req) {
			const id = jobId(req.output);
			const job = jobs.get(id);
			if (!job) {
				if (!req.start) return { ok: true, state: "none" };
				jobs.set(id, { ok: true, state: "running" });
				turn = turn.then(() => work(id, req));
				return { ok: true, state: "running", started: true };
			}
			if (job.state !== "running") jobs.delete(id);
			return job;
		},
		idle: () => turn,
	};
}
