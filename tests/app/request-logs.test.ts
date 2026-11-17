import { afterEach, describe, expect, it, vi } from "vitest";
import { conflict, HttpError } from "../../src/app/errors.ts";
import { Router } from "../../src/app/router.ts";
import { makeClient, ORIGIN } from "../helpers/app.ts";
import { createTestDeps } from "../helpers/fakes.ts";

const RAY = "8f1c2a3b4c5d6e7f-MEL";

function testRouter() {
	const router = new Router();
	router.get("/boom/:id", "watcher", async () => { throw new Error("secret detail"); });
	router.get("/clip", "watcher", async () => { throw new HttpError(502, "stream_failed", "Stream didn't answer.", { cause: new Error("Stream POST /clip failed (500): 10001 internal") }); });
	router.get("/admin-only", "manager", async () => new Response("manager"));
	router.post("/api/thing", "watcher", async () => { throw conflict("Already done."); });
	return router;
}

const lines = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.map((c) => JSON.parse(String(c[0])) as Record<string, unknown>);

afterEach(() => vi.restoreAllMocks());

describe("a failed request in the Worker's logs", () => {
	it("a server error says what was asked, by whom, its Ray ID, and the cause behind the message", async () => {
		const deps = createTestDeps();
		const errors = vi.spyOn(console, "error").mockImplementation(() => {});
		const client = makeClient(deps, undefined, testRouter());
		const res = await client("/clip", { headers: { "cf-ray": RAY } });
		expect(res.status).toBe(502);
		const memberId = (await deps.db.prepare("SELECT id FROM members WHERE team_id = ? LIMIT 1").bind(deps.team.id).first<{ id: number }>())!.id;
		expect(lines(errors)[0]).toMatchObject({
			event: "request_error", teamId: deps.team.id, memberId, method: "GET", path: "/clip", status: 502, code: "stream_failed",
			ray: "8f1c2a3b4c5d6e7f", error: "HttpError: Stream didn't answer.", cause: "Error: Stream POST /clip failed (500): 10001 internal",
		});
		await client("/boom/12", { headers: { "cf-ray": RAY } });
		expect(lines(errors)[1]).toMatchObject({ event: "request_error", path: "/boom/12", status: 500, error: "Error: secret detail", stack: expect.stringContaining("secret detail") });
	});

	it("the error page gives a reference to quote, the Ray ID the log line carries", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const res = await makeClient(createTestDeps(), undefined, testRouter())("/boom/1", { headers: { "cf-ray": RAY } });
		expect(await res.text()).toContain("Reference 8f1c2a3b4c5d6e7f");
	});

	it("a refused request is a line with its status and code, never its message (it can name a person); not for a plain not found, or anyone not signed in", async () => {
		const deps = createTestDeps();
		const warned = vi.spyOn(console, "warn").mockImplementation(() => {});
		await deps.db.prepare("INSERT INTO members (team_id, email, role) VALUES (?, 'p@x.com', 'watcher')").bind(deps.team.id).run();
		const watcher = makeClient(deps, "p@x.com", testRouter());
		expect((await watcher("/admin-only")).status).toBe(403);
		expect((await watcher("/api/thing", { method: "POST", headers: { Origin: ORIGIN } })).status).toBe(409);
		expect((await watcher("/nope")).status).toBe(404);
		// Before the sign-in's looked at: a bot's post from anywhere.
		expect((await watcher("/api/thing", { method: "POST", headers: { Origin: "https://evil.test" } })).status).toBe(403);
		expect(lines(warned)).toEqual([
			{ event: "request_refused", teamId: deps.team.id, memberId: expect.any(Number), method: "GET", path: "/admin-only", ray: null, status: 403, code: "forbidden" },
			{ event: "request_refused", teamId: deps.team.id, memberId: expect.any(Number), method: "POST", path: "/api/thing", ray: null, status: 409, code: "conflict" },
		]);
	});
});
