// The joiner's jobs. A game's join takes minutes, longer than a request should be held, so a join runs on after the ask
// that began it and the site asks again for how it went. A job is known by where its file goes; jobs run one at a
// time (the instance has half a CPU and one disk), each stopped at a limit. The joiner is every team's, so the jobs
// waiting are taken one team at a time in turn, and each runs with the links of the latest ask for it (the site asks
// every few minutes, and a link signed when the job was first asked for may have run out by its turn). A finished job is
// told once, then forgotten: a failed one begins again on the next ask that may start it. Plain Node, so the tests run
// it without a container (tests/join/jobs.test.ts).

// A whole game joins in well under this; the site's links last longer.
const LIMIT_MS = 40 * 60_000;
// A join that failed is an error line in the Worker's logs; the rest, the usual line.
const logLine = (line) => (line.event === "join_failed" ? console.error : console.log)(JSON.stringify(line));

/** The job a request is for: its output link's path (the bucket and key), which stays the same however it's signed. */
export const jobId = (output) => new URL(output).pathname;

/** Whose job it is: the bucket and team in its path (/<bucket>/originals/<teamId>/...), so staging's teams are their own. */
const teamOf = (id) => /^\/[^/]+\/originals\/[^/]+\//.exec(id)?.[0] ?? id;

/**
 * `run(req, signal)` does a join and resolves with { ok: true, bytes, seconds, took } or { ok: false, reason }.
 * Returns { ask(req), idle() }: ask answers at once (running, done, failed, or none when `req.start` is false and no
 * such job is known); idle resolves once nothing is running or waiting.
 */
export function createJobs(run, { limitMs = LIMIT_MS, log = logLine } = {}) {
	const jobs = new Map();
	// The jobs not begun yet, in the order first asked for, each with its latest ask; the turn each team last had.
	const waiting = new Map();
	const served = new Map();
	let turns = 0;
	let turn = Promise.resolve();

	/** The next job: the earliest asked for of the team whose last turn is longest ago (or that hasn't had one). */
	function next() {
		let id = null, last = Infinity;
		for (const waitingId of waiting.keys()) {
			const had = served.get(teamOf(waitingId)) ?? -1;
			if (had < last) { id = waitingId; last = had; }
		}
		const req = waiting.get(id);
		waiting.delete(id);
		served.set(teamOf(id), ++turns);
		return work(id, req);
	}

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
				waiting.set(id, req);
				// One turn for each job asked for; each turn takes whichever job is next.
				turn = turn.then(next);
				return { ok: true, state: "running", started: true };
			}
			if (waiting.has(id)) waiting.set(id, req);
			if (job.state !== "running") jobs.delete(id);
			return job;
		},
		idle: () => turn,
	};
}
