import { tagFailure } from "./failure-ids.ts";

export interface EachResult {
	succeeded: number;
	errors: unknown[];
}

/**
 * Runs fn over items one at a time (keeps subrequests low) and collects failures instead of stopping,
 * so one bad record can't block the rest. Callers MUST surface `errors`; the cron job rethrows them. `idOf`: the
 * record's ids, noted on its failure (shared/failure-ids.ts) so the job's log line says which one it was.
 */
export async function runEach<T>(items: T[], fn: (item: T) => Promise<void>, idOf?: (item: T) => Record<string, unknown>): Promise<EachResult> {
	const errors: unknown[] = [];
	let succeeded = 0;
	for (const item of items) {
		try {
			await fn(item);
			succeeded++;
		} catch (err) {
			errors.push(idOf ? tagFailure(err, idOf(item)) : err);
		}
	}
	return { succeeded, errors };
}
