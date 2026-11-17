// What a failed call to Cloudflare's API says: its first error's code and message (the code is what Cloudflare's docs
// and support go by), and, for a call that never answered, which one it was.
import { FetchBudgetSpent } from "./fetch-budget.ts";

export type ApiErrors = Array<{ code?: number; message?: string }> | undefined;

export const firstError = (errors: ApiErrors) => {
	const e = errors?.[0];
	return e ? [e.code, e.message].filter((x) => x !== undefined && x !== "").join(" ") || "no details" : "no details";
};

/** A fetch whose failure to answer (a timeout, a dropped connection) names the call it was. The run's budget refusing
 * the call stays that refusal (FetchBudgetSpent): the work waits for the next run, it hasn't failed. */
export const answering = (doFetch: typeof fetch, call: string) => (url: string, init: RequestInit) =>
	doFetch(url, init).catch((err: unknown) => {
		if (err instanceof FetchBudgetSpent) throw err;
		throw new Error(`${call} didn't answer: ${err instanceof Error ? err.name : String(err)}`, { cause: err });
	});
