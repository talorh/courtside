import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

// Cloudflare's Issues groups a Worker's failures and emails the site's admin when a new one starts (the notification "Saints: the
// Worker has a new issue"): the one alert that still works when the Worker itself is what's failing. Traces time each
// request's and run's calls (D1, R2, Stream, the joiner) with their outcome. Each is on in every Worker's config, as a
// deploy without it would switch it off.
it("keeps every Worker's logs and traces, with signed links' query strings hidden, and Issues on", () => {
	for (const file of ["cloudflare.config.ts", "maintenance/cloudflare.config.ts", "join/cloudflare.config.ts"]) {
		expect(readFileSync(file, "utf8"), file).toMatch(/observability: \{ enabled: true, redactQueryString: true, issues: \{ enabled: true \}, traces: \{ enabled: true \} \}/);
	}
});
