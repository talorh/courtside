import { describe, expect, it } from "vitest";
import { handleRequest } from "../../src/app/handle-request.ts";
import { Router } from "../../src/app/router.ts";
import { buildAdminRouter } from "../../src/features/admin/admin-routes.ts";
import { MANAGER } from "../helpers/app.ts";
import { createTestDeps } from "../helpers/fakes.ts";

// Writes a page doesn't need to wait for: a member's "last seen", and a server error's count. With `defer` (the Worker's
// ctx.waitUntil), the page is answered first and the write finishes after it; without one (the tests), it's awaited.
/** Holds every run() of statements whose SQL has `marker` until `release()`: the test database answers at once, so this
 * is how the test sees whether the page waited for the write. */
function gate(deps: ReturnType<typeof createTestDeps>, marker: string): () => void {
	let release = () => {};
	const open = new Promise<void>((resolve) => { release = resolve; });
	const real = deps.db.prepare.bind(deps.db);
	deps.db.prepare = ((sql: string) => {
		const statement = real(sql);
		if (!sql.includes(marker)) return statement;
		return { bind: (...args: unknown[]) => { const bound = statement.bind(...args); return { run: async () => { await open; return bound.run(); } }; } };
	}) as typeof deps.db.prepare;
	return release;
}

function pageRouter() {
	const router = new Router();
	router.get("/hello", "watcher", async () => new Response("hi"));
	router.get("/boom", "watcher", async () => { throw new Error("secret detail"); });
	return router;
}

describe("writes deferred past the response", () => {
	it("a page is answered before the member's last seen is written, and the write still lands", async () => {
		const deps = createTestDeps();
		const deferred: Promise<unknown>[] = [];
		deps.defer = (work) => void deferred.push(work);
		const lastSeen = () => deps.db.prepare("SELECT last_seen_at FROM members WHERE team_id = ? AND email = ?").bind(deps.team.id, MANAGER).first<string | null>("last_seen_at");
		const release = gate(deps, "UPDATE members SET last_seen_at");
		const res = await handleRequest(new Request("https://saints.example/hello"), deps, async () => MANAGER, pageRouter(), buildAdminRouter());
		expect([res.status, await res.text()]).toEqual([200, "hi"]);
		expect(deferred).toHaveLength(1);
		expect(await lastSeen()).toBeNull();
		release();
		await Promise.all(deferred);
		expect(await lastSeen()).toBe(deps.now().toISOString());
	});
	it("a server error's count is deferred the same way, and without defer both are awaited", async () => {
		const withDefer = createTestDeps();
		const deferred: Promise<unknown>[] = [];
		withDefer.defer = (work) => void deferred.push(work);
		const count = (deps: typeof withDefer) => deps.db.prepare("SELECT COALESCE(SUM(n), 0) AS n FROM server_errors").first<number>("n");
		const release = gate(withDefer, "INSERT INTO server_errors");
		expect((await handleRequest(new Request("https://saints.example/boom"), withDefer, async () => MANAGER, pageRouter(), buildAdminRouter())).status).toBe(500);
		expect(await count(withDefer)).toBe(0);
		release();
		await Promise.all(deferred);
		expect(await count(withDefer)).toBe(1);
		const plain = createTestDeps();
		expect((await handleRequest(new Request("https://saints.example/boom"), plain, async () => MANAGER, pageRouter(), buildAdminRouter())).status).toBe(500);
		expect(await count(plain)).toBe(1);
	});
});
