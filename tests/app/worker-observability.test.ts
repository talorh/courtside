import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

// Cloudflare's Issues groups the Worker's failures and emails the site's admin when a new one starts (the notification "Saints: the
// Worker has a new issue"): the one alert that still works when the Worker itself is what's failing. It's
// on in the config, as a deploy without it would switch it off.
it("keeps the Worker's logs, with signed links' query strings hidden, and Issues on", () => {
	expect(readFileSync("cloudflare.config.ts", "utf8")).toMatch(/observability: \{ enabled: true, redactQueryString: true, issues: \{ enabled: true \} \}/);
});
