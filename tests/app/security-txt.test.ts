import { describe, expect, it } from "vitest";
import { unauthenticated } from "../../src/app/errors.ts";
import { handleRequest } from "../../src/app/handle-request.ts";
import { buildRouter } from "../../src/app/routes.ts";
import { buildAdminRouter } from "../../src/features/admin/admin-routes.ts";
import { createTestDeps } from "../helpers/fakes.ts";

// security.txt (RFC 9116, needed once the site left Cloudflare Zero
// Trust): the one page anyone can read, saying where to report a security problem. Nothing else is open.
describe("security.txt", () => {
	const refuse = async (): Promise<string> => { throw unauthenticated("Please sign in."); };
	const call = (path: string) => handleRequest(new Request(`https://saints.example${path}`), createTestDeps(new Date("2026-10-31T00:00:00.000Z")), refuse, buildRouter(), buildAdminRouter());

	it("is served at /.well-known/security.txt (and /security.txt) without a sign-in, as plain text that caches a day", async () => {
		for (const path of ["/.well-known/security.txt", "/security.txt"]) {
			const res = await call(path);
			expect([path, res.status]).toEqual([path, 200]);
			expect(res.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
			expect(res.headers.get("Cache-Control")).toBe("public, max-age=86400");
			const text = await res.text();
			expect(text).toContain("Contact: mailto:security@saints.example\n");
			expect(text).toContain("Expires: 2027-10-31T00:00:00.000Z\n");
			expect(text).toContain("Canonical: https://saints.example/.well-known/security.txt\n");
			expect(text).toContain("Preferred-Languages: en\n");
		}
	});
	it("opens nothing else under .well-known, and takes no post", async () => {
		expect((await call("/.well-known/other.txt")).status).toBe(303);
		const post = await handleRequest(new Request("https://saints.example/.well-known/security.txt", { method: "POST", headers: { Origin: "https://saints.example" } }), createTestDeps(), refuse, buildRouter(), buildAdminRouter());
		expect(post.status).toBe(401);
	});
});
