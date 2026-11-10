// Problems: anything that failed, the site's own or a phone's, a line each in the admin Log (its Problems), beside the
// Worker's logs. Writing one never fails what it's about: a problem that can't be written goes to the Worker's logs
// alone. An outage is a line, not thousands: the same problem again within half an hour counts on its line.
import type { AppDeps } from "../../app/deps.ts";
import { addDays } from "../../shared/time.ts";
import { KINDS } from "./alert-kinds.ts";
import type { AlertKind } from "./alerts-repository.ts";
import { type ProblemKind, problemStatements } from "./problems-repository.ts";

const REPEAT_MS = 30 * 60_000;
const MAX_WHAT = 200, MAX_DETAIL = 300;

/** `who`: the person it happened to (their email), or "site" (the default) when it's the site's own or nobody's signed
 * in. `what` says what failed in words; `error` (or `detail`) why, from the error. The device is the request's it
 * happened in (none in a job), even for the site's own: which phone was in use when it failed. */
export interface Problem { kind: ProblemKind; teamId: string | null; who?: string; what: string; error?: unknown; detail?: string }

const said = (err: unknown) => {
	if (!(err instanceof Error)) return err === undefined ? "" : String(err);
	const cause = err.cause instanceof Error ? `: ${err.cause.message}` : "";
	return `${err.message}${cause}`;
};

export async function logProblem(deps: Pick<AppDeps, "db" | "now" | "device">, p: Problem): Promise<void> {
	const now = deps.now(), who = p.who || "site";
	const row = {
		kind: p.kind, teamId: p.teamId, who, what: p.what.slice(0, MAX_WHAT), detail: (p.detail ?? said(p.error)).slice(0, MAX_DETAIL),
		device: deps.device, at: now.toISOString(),
	};
	try {
		await deps.db.batch(problemStatements(deps.db, row, new Date(now.getTime() - REPEAT_MS).toISOString(), addDays(now, -1).toISOString()));
	} catch (err) {
		console.error(JSON.stringify({ event: "problem_log_failed", teamId: p.teamId, kind: p.kind, error: String(err) }));
	}
}

/** An alert for the admins (alerts-service.ts) that couldn't be raised or cleared. */
export async function alertFailed(deps: Pick<AppDeps, "db" | "now" | "device">, kind: AlertKind, err: unknown): Promise<void> {
	console.error(JSON.stringify({ event: "alert_failed", teamId: null, kind, error: String(err) }));
	const name = KINDS.find((k) => k.kind === kind)?.label ?? kind;
	await logProblem(deps, { kind: "site_problem", teamId: null, what: `The admins' alert for ${name} couldn't be updated`, error: err });
}
