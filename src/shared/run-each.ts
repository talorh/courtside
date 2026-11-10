export interface EachResult {
	succeeded: number;
	errors: unknown[];
}

/**
 * Runs fn over items one at a time (keeps subrequests low) and collects failures instead of stopping,
 * so one bad record can't block the rest. Callers MUST surface `errors`; the cron job rethrows them.
 */
export async function runEach<T>(items: T[], fn: (item: T) => Promise<void>): Promise<EachResult> {
	const errors: unknown[] = [];
	let succeeded = 0;
	for (const item of items) {
		try {
			await fn(item);
			succeeded++;
		} catch (err) {
			errors.push(err);
		}
	}
	return { succeeded, errors };
}
