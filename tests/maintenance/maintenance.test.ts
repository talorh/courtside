import { describe, expect, it } from "vitest";
import { handleMaintenance } from "../../maintenance/handler.ts";
import { LOGO } from "../../maintenance/logo.ts";
import { maintenanceJson, maintenancePage, MAINTENANCE_HEADERS } from "../../maintenance/page.ts";

const ENV = { ADMIN_EMAILS: "sam@saints.example, second.admin@example.com" };
const signedInAs = (email: string) => async () => email;
const notSignedIn = async (): Promise<string> => { throw new Error("Please sign in again."); };
const page = (body: string, headers: Record<string, string> = { "Content-Type": "text/html; charset=utf-8" }) => new Response(body, { status: 200, headers });

function run(path: string, authenticate: (req: Request) => Promise<string>, upstream = async (_req: Request) => page("<!doctype html><html><body class=\"x\"><main>Home</main></body></html>"), init: RequestInit = {}) {
	const calls: Request[] = [];
	const req = new Request(`https://saints.example${path}`, init);
	const res = handleMaintenance(req, ENV, { authenticate, upstream: async (r) => { calls.push(r); return upstream(r); } });
	return { req, calls, res };
}

describe("the maintenance page", () => {
	it("says the site will be back soon (never a time), that nothing's lost, and how to try again, with the logo and both themes", () => {
		const html = maintenancePage();
		expect(html).toContain('<meta name="robots" content="noindex,nofollow">');
		expect(html).toContain("<title>Back soon · Courtside</title>");
		expect(html).toContain("Time out!");
		expect(html).toContain("We&#39;re upgrading the site. We&#39;ll be back soon."); // the apostrophes escaped, as everywhere on the site
		expect(html).not.toMatch(/Back by/);
		expect(html).toContain('font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif'); // the styles as written
		expect(html).toContain("Your videos and photos are safe.");
		expect(html).toContain('<meta http-equiv="refresh" content="60">');
		expect(html).toMatch(/<a class="btn" href="">Try again<\/a>/);
		expect(html).toContain('src="data:image/png;base64,');
		expect(html).toContain("prefers-color-scheme: dark");
	});

	it("answers API calls in the site's JSON shape", () => {
		expect(maintenanceJson()).toEqual({ ok: false, error: { code: "maintenance", message: "We're upgrading the site. We'll be back soon." } });
	});

	it("has a real PNG logo", () => {
		const bytes = Buffer.from(LOGO.replace("data:image/png;base64,", ""), "base64");
		expect([...bytes.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
	});
});

describe("the maintenance Worker", () => {
	it("gives someone not signed in the page: 503, try later, never stored or indexed, and a CSP with no scripts", async () => {
		const { res, calls } = run("/", notSignedIn);
		const r = await res;
		expect(r.status).toBe(503);
		expect(r.headers.get("Retry-After")).toBe("1800");
		expect(r.headers.get("Cache-Control")).toBe("no-store");
		expect(r.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
		expect(r.headers.get("X-Content-Type-Options")).toBe("nosniff");
		expect(r.headers.get("Strict-Transport-Security")).toContain("max-age=");
		expect(r.headers.get("Content-Security-Policy")).toBe(MAINTENANCE_HEADERS["Content-Security-Policy"]);
		expect(r.headers.get("Content-Security-Policy")).not.toContain("script-src");
		expect(await r.text()).toContain("Time out!");
		expect(calls).toHaveLength(0);
	});

	it("gives a signed-in member who isn't an admin the page too, and the JSON for API calls", async () => {
		const pageRes = await run("/games/12", signedInAs("parent@example.com")).res;
		expect(pageRes.status).toBe(503);
		expect(pageRes.headers.get("Content-Type")).toContain("text/html");
		for (const path of ["/api/uploads", "/api/photos"]) {
			const r = await run(path, signedInAs("parent@example.com")).res;
			expect(r.status).toBe(503);
			expect(r.headers.get("Content-Type")).toContain("application/json");
			expect(await r.json()).toEqual(maintenanceJson());
		}
	});

	it("passes an admin through to the real site (any case of their email), with a banner on pages", async () => {
		const { res, calls, req } = run("/members", signedInAs("Sam@Saints.Example"));
		const r = await res;
		expect(calls).toEqual([req]);
		expect(r.status).toBe(200);
		const body = await r.text();
		expect(body).toMatch(/<body class="x"><div class="note warn" role="status"><b>Maintenance is on:<\/b> only admins can see the site\./);
		expect(body).toContain("<main>Home</main>");
	});

	it("leaves an admin's JSON, images and redirects exactly as the site sent them", async () => {
		const json = await run("/api/clips/3/download", signedInAs("second.admin@example.com"), async () => page('{"ok":true}', { "Content-Type": "application/json" })).res;
		expect(await json.text()).toBe('{"ok":true}');
		const redirect = await run("/fixture", signedInAs("second.admin@example.com"), async () => new Response(null, { status: 302, headers: { Location: "/" } })).res;
		expect(redirect.status).toBe(302);
		expect(redirect.headers.get("Location")).toBe("/");
	});

	it("passes an admin's POST on unchanged", async () => {
		const { res, calls, req } = run("/members", signedInAs("sam@saints.example"), undefined, { method: "POST", body: "name=x" });
		await res;
		expect(calls).toEqual([req]);
		expect(calls[0]?.method).toBe("POST");
	});

	it("never lets a failed sign-in check through, even with an admin's email in a header", async () => {
		const { res, calls } = run("/", notSignedIn, undefined, { headers: { "Cf-Access-Authenticated-User-Email": "sam@saints.example" } });
		expect((await res).status).toBe(503);
		expect(calls).toHaveLength(0);
	});
});
