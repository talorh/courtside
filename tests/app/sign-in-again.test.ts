import { describe, expect, it } from "vitest";
import { unauthenticated } from "../../src/app/errors.ts";
import { handleRequest } from "../../src/app/handle-request.ts";
import { buildRouter } from "../../src/app/routes.ts";
import { buildAdminRouter } from "../../src/features/admin/admin-routes.ts";
import { createTestDeps } from "../helpers/fakes.ts";

// Signed out (no session, or one that's over; the site's own sign-in): a page goes to the sign-in page, which
// comes back to it after the code; a page script's call gets 401 JSON, which it shows as its own sign-in note.
describe("a request without a sign-in", () => {
	const refuse = async (): Promise<string> => { throw unauthenticated("Please sign in."); };
	const call = (path: string, init?: RequestInit) => handleRequest(new Request(`https://saints.example${path}`, init), createTestDeps(), refuse, buildRouter(), buildAdminRouter());

	it("sends a page to the sign-in page, remembering where it was going, and clears any stale session cookie", async () => {
		const res = await call("/games/12?tab=clips");
		expect(res.status).toBe(303);
		expect(res.headers.get("Location")).toBe("/signin?next=%2Fgames%2F12%3Ftab%3Dclips");
		expect(res.headers.getSetCookie()).toEqual(["courtside_session=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0"]);
	});
	it("leaves a page script's call to its own sign-in note (Go live and uploads have one): 401 JSON", async () => {
		const res = await call("/api/uploads", { method: "POST", headers: { Origin: "https://saints.example" }, body: "{}" });
		expect(res.status).toBe(401);
		expect(await res.json()).toEqual({ ok: false, error: { code: "unauthenticated", message: "Please sign in." } });
		expect(res.headers.getSetCookie()).toEqual([]);
	});
	it("a form posted after the sign-in ran out gets the error page with Sign in again, pointing at the sign-in page", async () => {
		const res = await call("/teams/switch", { method: "POST", headers: { Origin: "https://saints.example" }, body: new URLSearchParams({ team: "x" }) });
		expect(res.status).toBe(401);
		expect(await res.text()).toContain('<a class="btn" href="/signin">Sign in again</a>');
	});
	it("the sign-in page is a link preview's card (a link shared in WhatsApp): the site's name, a line and the logo, nothing more", async () => {
		const html = await (await call("/signin")).text();
		expect(html).toContain('<meta property="og:title" content="Courtside">');
		expect(html).toContain(`<meta property="og:description" content="Private game videos and photos for each team's families and coaches.">`);
		expect(html).toContain('<meta property="og:image" content="https://saints.example/logo.png">');
		expect(html).toContain('<meta name="robots" content="noindex,nofollow">');
		// An error page, like every team page, has none.
		expect(await (await call("/no-such-page")).text()).not.toContain("og:title");
	});
	it("serves a static file only to someone signed in, apart from the sign-in page's own", async () => {
		expect((await call("/court.webp")).headers.get("Location")).toBe("/signin?next=%2Fcourt.webp");
		expect((await call("/watch.js")).status).toBe(303);
		// The Home Screen icon by both its names: iPhones ask for -precomposed first (a link preview, Add to Home Screen).
		for (const open of ["/app.css", "/theme.js", "/signin.js", "/webapp.js", "/logo.png", "/fonts/manrope.woff2", "/robots.txt",
			"/apple-touch-icon.png", "/apple-touch-icon-precomposed.png"]) {
			const res = await call(open);
			expect([open, res.status]).toEqual([open, 200]);
			expect(await res.text()).toBe(`file ${open}`);
		}
	});
});
