// npm run logs (scripts/logs.mjs): the query it sends to Workers Observability, and how it shows each line. Pure, so
// it's tested (tests/scripts/logs.test.ts).
const USAGE = "npm run logs -- [--since 1h|30m|2d] [--team <id>] [--event <name>] [--game <id>] [--video <id>] [--ray <id>] [--request <id>] [--joiner] [--staging] [--all]";
const UNITS = { m: 60_000, h: 3_600_000, d: 86_400_000 };
const TEXT = { "--team": "teamId", "--event": "event", "--ray": "ray", "--request": "$metadata.requestId" };
const NUMBER = { "--game": "gameId", "--video": "videoId" };

/** The options from the command line, or { error } saying what's wrong and how to use it. `worker`: the site's Worker
 * (deploy.config.ts), whose video joiner is `<worker>-join`. */
export function parseLogsArgs(argv, worker) {
	const o = { sinceMs: UNITS.h, worker, staging: false, all: false, match: [] };
	for (let i = 0; i < argv.length; i++) {
		const flag = argv[i], value = argv[i + 1]?.startsWith("--") ? undefined : argv[i + 1];
		if (flag === "--all") o.all = true;
		else if (flag === "--joiner") o.worker = `${worker}-join`;
		else if (flag === "--staging") o.staging = true;
		else if (flag === "--since") {
			const m = /^(\d+)([mhd])$/.exec(value ?? "");
			if (!m) return { error: `--since takes a time like 30m, 3h or 2d. ${USAGE}` };
			o.sinceMs = Number(m[1]) * UNITS[m[2]];
			i++;
		} else if (flag in TEXT && value) {
			o.match.push({ key: TEXT[flag], operation: "eq", type: "string", value });
			i++;
		} else if (flag in NUMBER && /^\d+$/.test(value ?? "")) {
			o.match.push({ key: NUMBER[flag], operation: "eq", type: "number", value: Number(value) });
			i++;
		} else return { error: `${flag} isn't something it knows, or is missing its value. ${USAGE}` };
	}
	return o;
}

const levelIs = (value) => ({ key: "$metadata.level", operation: "eq", type: "string", value });

/** The body for `cf o11y telemetry query --body`: the Worker's lines (warnings and errors unless --all), newest first.
 * Staging is a Preview of the same Worker: its lines are the ones with a preview, kept out unless --staging. */
export function logsBody(o, nowMs) {
	const filters = [{ key: "$workers.scriptName", operation: "eq", type: "string", value: o.worker },
		o.staging ? { key: "$workers.preview.slug", operation: "eq", type: "string", value: "staging" } : { key: "$workers.preview.slug", operation: "is_null", type: "string" }];
	if (!o.all) filters.push({ kind: "group", filterCombination: "or", filters: [levelIs("error"), levelIs("warn")] });
	return {
		queryId: `logs-${nowMs}`, view: "events", limit: 100, timeframe: { from: nowMs - o.sinceMs, to: nowMs },
		parameters: { datasets: ["cloudflare-workers"], filters: [...filters, ...o.match] },
	};
}

const when = (ms, timeZone) => new Date(ms).toLocaleString("en-AU", {
	timeZone, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", second: "2-digit",
}).replace(/,/g, "");

/** One line: when (in the club's time zone), level, event, team, the line's other fields, and its request (--request
 * finds the rest). */
export function describeEvent(e, timeZone) {
	const meta = e.$metadata ?? {}, src = typeof e.source === "object" && e.source ? e.source : { message: meta.message ?? e.source };
	const { event, level, teamId, ...rest } = src;
	const request = e.$workers?.event?.request;
	if (request && !event) delete rest.message;
	const what = event ?? (request ? `${request.method} ${request.url} ${e.$workers?.event?.response?.status ?? ""}`.trim() : e.$workers?.outcome ?? "");
	return [when(e.timestamp, timeZone), meta.level ?? level ?? "log", what, teamId ?? "", JSON.stringify(rest), meta.requestId ? `request ${meta.requestId}` : ""]
		.filter((x) => x !== "" && x !== "{}").join("  ");
}
