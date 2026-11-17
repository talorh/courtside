// A cron run's own line in the Worker's logs: which trigger, how long it took, and whether it failed (and how many
// things failed in it). Each failure has its own job_failed line (job-problems.ts).
export async function timedRun(cron: string, run: () => Promise<unknown>): Promise<void> {
	const started = Date.now();
	try {
		await run();
		console.log(JSON.stringify({ event: "cron_run", teamId: null, cron, ok: true, ms: Date.now() - started }));
	} catch (err) {
		const errorCount = err instanceof AggregateError ? err.errors.length : 1;
		console.error(JSON.stringify({ event: "cron_run", teamId: null, cron, ok: false, ms: Date.now() - started, errorCount, error: String(err) }));
		throw err;
	}
}
