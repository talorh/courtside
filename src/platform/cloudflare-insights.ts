// Cloudflare's own figures, with the read-only account token courtside-insights-read (Account Analytics and the club's domain's
// Analytics): for Platform (its last 30 days) and Insights' Alerts (the last day), the Worker, its database, the
// originals bucket, Stream, Workers AI and the zone in one GraphQL query; for Costs, Stream's minutes watched by video
// and day. Thin, like every platform client.

export interface CloudflareFigures {
	workers: { requests: number; errors: number; subrequests: number; cpuP50Ms: number; cpuP99Ms: number };
	d1: { rowsRead: number; rowsWritten: number; queries: number; sizeBytes: number | null };
	r2: { bytes: number; objects: number };
	streamMinutesWatched: number;
	aiNeurons: number;
	zone: { requests: number; threats: number };
}

/** Minutes watched of one Stream video (or live input) on one UTC day. */
export interface MinutesWatched { uid: string; date: string; minutes: number }

export interface CloudflareInsights {
	figures(since: Date, until: Date): Promise<CloudflareFigures>;
	/** Stream's minutes watched, by video and day, for the Costs page. */
	minutesByVideo(sinceDate: string, untilDate: string): Promise<MinutesWatched[]>;
}

const API = "https://api.cloudflare.com/client/v4";

const QUERY = `query($a: string!, $z: string!, $since: Time!, $until: Time!, $sinceDate: Date!, $untilDate: Date!, $script: string!, $db: string!, $bucket: string!) {
 viewer {
  accounts(filter: {accountTag: $a}) {
   workers: workersInvocationsAdaptive(limit: 1, filter: {datetime_geq: $since, datetime_leq: $until, scriptName: $script}) { sum { requests errors subrequests } quantiles { cpuTimeP50 cpuTimeP99 } }
   d1: d1AnalyticsAdaptiveGroups(limit: 1, filter: {date_geq: $sinceDate, date_leq: $untilDate, databaseId: $db}) { sum { readQueries writeQueries rowsRead rowsWritten } }
   d1size: d1StorageAdaptiveGroups(limit: 1, filter: {date_geq: $sinceDate, date_leq: $untilDate, databaseId: $db}) { max { databaseSizeBytes } }
   r2: r2StorageAdaptiveGroups(limit: 1, filter: {datetime_geq: $since, datetime_leq: $until, bucketName: $bucket}) { max { payloadSize objectCount } }
   stream: streamMinutesViewedAdaptiveGroups(limit: 1, filter: {date_geq: $sinceDate, date_leq: $untilDate}) { sum { minutesViewed } }
   ai: aiInferenceAdaptiveGroups(limit: 1, filter: {datetime_geq: $since, datetime_leq: $until}) { sum { totalNeurons } }
  }
  zones(filter: {zoneTag: $z}) { http: httpRequests1dGroups(limit: 31, filter: {date_geq: $sinceDate, date_leq: $untilDate}) { sum { requests threats } } }
 }
}`;

type Num = number | null | undefined;
interface Analytics {
	accounts: Array<{
		workers: Array<{ sum: { requests: Num; errors: Num; subrequests: Num }; quantiles: { cpuTimeP50: Num; cpuTimeP99: Num } }>;
		d1: Array<{ sum: { readQueries: Num; writeQueries: Num; rowsRead: Num; rowsWritten: Num } }>; d1size: Array<{ max: { databaseSizeBytes: Num } }>;
		r2: Array<{ max: { payloadSize: Num; objectCount: Num } }>; stream: Array<{ sum: { minutesViewed: Num } }>; ai: Array<{ sum: { totalNeurons: Num } }>;
	}>;
	zones: Array<{ http: Array<{ sum: { requests: Num; threats: Num } }> }>;
}

const BY_VIDEO = `query($a: string!, $s: Date!, $u: Date!) { viewer { accounts(filter: {accountTag: $a}) {
 stream: streamMinutesViewedAdaptiveGroups(limit: 10000, filter: {date_geq: $s, date_leq: $u}) { sum { minutesViewed } dimensions { uid date } }
} } }`;

const n = (v: Num) => v ?? 0;

export function createCloudflareInsights(o: { accountId: string; zoneId: string; databaseId: string; bucket: string; scriptName: string; token: string; fetch?: typeof fetch }): CloudflareInsights {
	const doFetch = o.fetch ?? fetch;
	const headers = { Authorization: `Bearer ${o.token}`, "Content-Type": "application/json" };
	async function ask<T>(query: string, variables: Record<string, string>): Promise<T> {
		const res = await doFetch(`${API}/graphql`, { method: "POST", headers, body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(15_000) });
		const body = (await res.json().catch(() => ({}))) as { data?: { viewer?: T } | null; errors?: Array<{ message?: string }> };
		const viewer = body.data?.viewer;
		if (!viewer || body.errors?.length) throw new Error(`Cloudflare's analytics: ${body.errors?.map((e) => e.message).join("; ") || `HTTP ${res.status}`}`);
		return viewer;
	}
	return {
		async figures(since, until) {
			const viewer = await ask<Analytics>(QUERY, {
				a: o.accountId, z: o.zoneId, since: since.toISOString(), until: until.toISOString(), sinceDate: since.toISOString().slice(0, 10),
				untilDate: until.toISOString().slice(0, 10), script: o.scriptName, db: o.databaseId, bucket: o.bucket,
			});
			const a = viewer.accounts[0], w = a?.workers[0], d = a?.d1[0]?.sum;
			const http = viewer.zones[0]?.http ?? [];
			return {
				workers: { requests: n(w?.sum.requests), errors: n(w?.sum.errors), subrequests: n(w?.sum.subrequests), cpuP50Ms: n(w?.quantiles.cpuTimeP50) / 1000, cpuP99Ms: n(w?.quantiles.cpuTimeP99) / 1000 },
				d1: { rowsRead: n(d?.rowsRead), rowsWritten: n(d?.rowsWritten), queries: n(d?.readQueries) + n(d?.writeQueries), sizeBytes: a?.d1size[0]?.max.databaseSizeBytes ?? null },
				r2: { bytes: n(a?.r2[0]?.max.payloadSize), objects: n(a?.r2[0]?.max.objectCount) },
				streamMinutesWatched: n(a?.stream[0]?.sum.minutesViewed), aiNeurons: n(a?.ai[0]?.sum.totalNeurons),
				zone: { requests: http.reduce((s, h) => s + n(h.sum.requests), 0), threats: http.reduce((s, h) => s + n(h.sum.threats), 0) },
			};
		},
		async minutesByVideo(sinceDate, untilDate) {
			type Groups = { accounts: Array<{ stream: Array<{ sum: { minutesViewed: Num }; dimensions: { uid: string; date: string } }> }> };
			const viewer = await ask<Groups>(BY_VIDEO, { a: o.accountId, s: sinceDate, u: untilDate });
			return (viewer.accounts[0]?.stream ?? []).map((g) => ({ uid: g.dimensions.uid, date: g.dimensions.date, minutes: n(g.sum.minutesViewed) }));
		},
	};
}
