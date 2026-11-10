import { describe, expect, it } from "vitest";
import { Router } from "../../src/app/router.ts";
import { buildRouter } from "../../src/app/routes.ts";

const ok = async () => new Response("ok");

describe("Router", () => {
	const router = new Router();
	router.get("/games/:id", "watcher", ok);
	router.post("/fixture/:id/delete", "manager", ok);

	it("matches params and roles", () => {
		expect(router.match("GET", "/games/42")).toMatchObject({ params: { id: "42" }, minRole: "watcher" });
		expect(router.match("POST", "/fixture/7/delete")?.minRole).toBe("manager");
	});
	it("serves HEAD from GET routes", () => {
		expect(router.match("HEAD", "/games/1")).not.toBeNull();
	});
	it("returns null for unknown paths or methods", () => {
		expect(router.match("GET", "/games")).toBeNull();
		expect(router.match("POST", "/games/1")).toBeNull();
	});
});

describe("router: malformed paths", () => {
	it("treats a badly encoded segment as no match instead of throwing", () => {
		const router = new Router();
		router.get("/games/:id", "watcher", async () => new Response("ok"));
		expect(router.match("GET", "/games/%E0%A4%A")).toBeNull();
	});
	it("no site route is hidden by an earlier one (e.g. /fixture/:id taking /fixture/playhq)", () => {
		const routes = (buildRouter() as unknown as { routes: Array<{ method: string; parts: string[] }> }).routes;
		const hidden = routes.flatMap((a, i) => routes.slice(i + 1)
			.filter((b) => a.method === b.method && a.parts.length === b.parts.length && a.parts.every((p, k) => p.startsWith(":") || p === b.parts[k]))
			.map((b) => `${b.method} /${b.parts.join("/")}`));
		expect(hidden).toEqual([]);
	});
});
