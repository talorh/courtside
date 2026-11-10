/**
 * Wraps a test database to count what D1 limits and the node:sqlite shim doesn't: trips to the database (a batch is
 * one), statements in the biggest batch, and the most values bound to one statement (D1 allows 100).
 */
export function countingDb(real: D1Database) {
	const counter = { trips: 0, biggestBatch: 0, mostParams: 0 };
	type S = D1PreparedStatement & { inner?: D1PreparedStatement };
	const wrap = (inner: D1PreparedStatement): S => ({
		inner,
		bind: (...v: unknown[]) => ((counter.mostParams = Math.max(counter.mostParams, v.length)), wrap(inner.bind(...v))),
		all: (...a: []) => (counter.trips++, inner.all(...a)), first: (c?: string) => (counter.trips++, inner.first(c as string)), run: () => (counter.trips++, inner.run()),
	}) as unknown as S;
	const db = {
		prepare: (sql: string) => wrap(real.prepare(sql)),
		batch: (s: S[]) => ((counter.trips++, counter.biggestBatch = Math.max(counter.biggestBatch, s.length)), real.batch(s.map((x) => x.inner ?? x))),
	};
	return { db: db as unknown as D1Database, counter };
}
