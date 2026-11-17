// The Worker answers only on its own address: the live site on the club's domain, staging on staging's, cf dev on localhost.
// Any other address that reaches it (a version's workers.dev preview URL, say) sits outside the zone's WAF, rate limit,
// human check and maintenance page, so it gets a bare 404: no page, no cookie.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { handleRequest } from "../../src/app/handle-request.ts";
import { loadConfig } from "../../src/app/config.ts";
import { buildRouter } from "../../src/app/routes.ts";
import { buildAdminRouter } from "../../src/features/admin/admin-routes.ts";
import { MANAGER } from "../helpers/app.ts";
import { createTestDeps, type TestDeps } from "../helpers/fakes.ts";

const STAGING_HOST = "staging-courtside.saints-club.workers.dev";
const VERSION_URL = "0123abcd-courtside.saints-club.workers.dev";
const staging = (deps: TestDeps): TestDeps => ({ ...deps, config: { ...deps.config, staging: true, siteHost: STAGING_HOST } });

const call = (deps: TestDeps, url: string, init: RequestInit = {}, who: string | null = MANAGER) =>
	handleRequest(new Request(url, { ...init, headers: { Origin: new URL(url).origin, Cookie: `team=${deps.team.id}`, ...init.headers } }), deps,
		async () => who ?? (() => { throw new Error("signed out"); })(), buildRouter(), buildAdminRouter());

async function expectBare404(res: Response) {
	expect(res.status).toBe(404);
	expect(res.headers.get("Set-Cookie")).toBeNull();
	expect(res.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
	expect(res.headers.get("Cache-Control")).toBe("no-store");
	const body = await res.text();
	expect(body).toBe("Not found");
}

describe("the host guard", () => {
	it("the live site, signed in, gets nothing on a version's workers.dev preview URL, and its pages on the club's domain", async () => {
		const deps = createTestDeps();
		await expectBare404(await call(deps, `https://${VERSION_URL}/`));
		await expectBare404(await call(deps, `https://${VERSION_URL}/games`));
		const home = await call(deps, "https://saints.example/");
		expect(home.status).toBe(200);
		expect(await home.text()).toContain("<html");
	});

	it("refuses there before anything else: the sign-in page, its files, a post, the launch screen and security.txt", async () => {
		const deps = createTestDeps();
		for (const path of ["/signin", "/app.css", "/robots.txt", "/?app", "/.well-known/security.txt", "/admin"]) {
			await expectBare404(await call(deps, `https://${VERSION_URL}${path}`, {}, null));
		}
		await expectBare404(await call(deps, `https://${VERSION_URL}/signin`, { method: "POST", body: new URLSearchParams({ email: MANAGER }) }, null));
		expect(deps.email.sent).toEqual([]);
	});

	it("the live site doesn't answer on localhost or another name either", async () => {
		const deps = createTestDeps();
		for (const host of ["localhost", "www.saints.example", STAGING_HOST, "courtside.saints-club.workers.dev"]) {
			await expectBare404(await call(deps, `https://${host}/`));
		}
	});

	it("staging answers only on staging's address, never on the club's domain or a preview URL", async () => {
		const deps = staging(createTestDeps());
		await expectBare404(await call(deps, "https://saints.example/"));
		await expectBare404(await call(deps, `https://${VERSION_URL}/`));
		const home = await call(deps, `https://${STAGING_HOST}/`);
		expect(home.status).toBe(200);
		expect(await home.text()).toContain("stagingstrip");
	});

	it("cf dev answers on localhost, whatever the port", async () => {
		const deps = createTestDeps();
		const dev = { ...deps, config: { ...deps.config, siteHost: "localhost" } };
		expect((await call(dev, "http://localhost:5173/")).status).toBe(200);
		await expectBare404(await call(dev, "https://saints.example/"));
	});

	it("reads its one address from SITE_HOST, and won't start without it", () => {
		const env = {
			ACCOUNT_ID: "a", STREAM_CUSTOMER_CODE: "c", R2_BUCKET: "b", STREAM_KEY_ID: "k", STREAM_KEY_JWK: "j", R2_ACCESS_KEY_ID: "r",
			R2_SECRET_ACCESS_KEY: "s", STREAM_API_TOKEN: "t", TURNSTILE_SITE_KEY: "0x4", TURNSTILE_SECRET: "ts",
		};
		expect(loadConfig({ ...env, SITE_HOST: "saints.example" }).siteHost).toBe("saints.example");
		expect(() => loadConfig(env)).toThrow(/SITE_HOST/);
	});

	it("the config gives cf dev localhost, staging its own address and the live site the club's domain", () => {
		const text = readFileSync("cloudflare.config.ts", "utf8");
		expect(text).toMatch(/SITE_HOST: bindings\.text\(isDev \? "localhost" : \w+ \? DEPLOY\.staging\.host : club\.domain\)/);
		expect(readFileSync("deploy.config.ts", "utf8")).toMatch(/staging: \{[^}]*\bhost: "staging-courtside\.REPLACE_WITH_WORKERS_SUBDOMAIN\.workers\.dev"/);
	});
});
