/** A run's outside calls are used up: what's left waits for the next run (every step is safe to re-run). */
export class FetchBudgetSpent extends Error {
	constructor() {
		super("This run's outside calls are used up; the rest waits for the next run.");
		this.name = "FetchBudgetSpent";
	}
}

/**
 * A cron run's outside calls (subrequests) are budgeted, and its steps share them (src/index.ts sets the number). This
 * counts them across every platform client and refuses the ones past `limit`, so a busy run leaves the rest for the
 * next one instead of failing part way.
 */
export function createFetchBudget(limit: number, inner: typeof fetch = fetch) {
	let used = 0;
	const budgeted = ((input: RequestInfo | URL, init?: RequestInit) => {
		if (used >= limit) return Promise.reject(new FetchBudgetSpent());
		used++;
		return inner(input, init);
	}) as typeof fetch;
	return { fetch: budgeted, used: () => used };
}
