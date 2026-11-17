// Which step or record a collected failure was for (a job's step, a video, a game), kept beside the error itself so its
// identity, class and message don't change: the job's log line and the admin Log's problem name it.
const WHERE = new WeakMap<object, Record<string, unknown>>();

/** Notes ids on a failure (the ids noted first, the most specific, are kept); returns the failure as it was. */
export function tagFailure<E>(err: E, ids: Record<string, unknown>): E {
	if (err !== null && typeof err === "object") WHERE.set(err, { ...ids, ...WHERE.get(err) });
	return err;
}

export const failureIds = (err: unknown): Record<string, unknown> => (err !== null && typeof err === "object" ? WHERE.get(err) : undefined) ?? {};
