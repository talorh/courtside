import { afterEach, describe, expect, it } from "vitest";
import { CLUB, onSubdomain } from "../../../src/club.ts";
import { fixedAMonth, PRICES } from "../../../src/features/admin/costs-prices.ts";
import { costs } from "../../../src/features/admin/views/docs-text-costs.ts";
import { glossary } from "../../../src/features/admin/views/docs-text-glossary.ts";
import { platform } from "../../../src/features/admin/views/docs-text-platform.ts";
import { cloudflareSection } from "../../../src/features/admin/views/platform-cloudflare.ts";
import type { CloudflareFigures } from "../../../src/platform/cloudflare-insights.ts";
import { useExampleClub } from "../../helpers/example-club.ts";

// A club can put the site on a subdomain of its own domain (videos.saints.example) when that domain is already a zone in
// its Cloudflare account, beside its website. The example club has a domain of its own.
const onASubdomain = () => Object.assign(CLUB, { domain: "videos.saints.example", zone: "saints.example" });
const figures = { workers: { requests: 1, errors: 0, subrequests: 0, cpuP50Ms: 1, cpuP99Ms: 2 }, d1: { rowsRead: 1, rowsWritten: 1, queries: 1 },
	r2: { bytes: 1, objects: 1 }, streamMinutesWatched: 1, aiNeurons: 1, zone: { requests: 1200, threats: 3 } } as unknown as CloudflareFigures;
const text = (s: { body: { __html: string } }) => s.body.__html.replace(/\s+/g, " ").replaceAll("&#39;", "'");

afterEach(() => useExampleClub());

describe("the site on a domain of its own (the example club)", () => {
	it("pays for the domain, and the Documentation says it's registered at Cloudflare", () => {
		expect(onSubdomain()).toBe(false);
		expect(fixedAMonth()).toBeCloseTo(PRICES.workersPaid + PRICES.bundle + PRICES.domainAYear / 12, 6);
		expect(text(platform())).toContain("Registered at Cloudflare, renewing automatically, with DNSSEC on");
		expect(cloudflareSection(figures, true).__html).toContain("Requests to saints.example");
	});
});

describe("the site on a subdomain of the club's own domain", () => {
	it("costs nothing for the domain: it's the club's, paid for anyway", () => {
		onASubdomain();
		expect(onSubdomain()).toBe(true);
		expect(fixedAMonth()).toBeCloseTo(PRICES.workersPaid + PRICES.bundle, 6);
		expect(text(costs())).toContain("videos.saints.example is a subdomain of the club's own saints.example, so it costs the site nothing");
	});

	it("the Documentation says whose zone it is and what the site leaves alone there", () => {
		onASubdomain();
		const page = text(platform());
		expect(page).toContain("a subdomain of the club's own saints.example");
		expect(page).not.toContain("Registered at Cloudflare");
		expect(page).toContain("each matching videos.saints.example alone");
		expect(text(glossary())).toContain("saints.example, the club's own domain");
	});

	it("Platform says its request count is the whole zone's, the club's website included", () => {
		onASubdomain();
		expect(cloudflareSection(figures, true).__html).toContain("Requests to saints.example");
		expect(cloudflareSection(figures, true).__html.replaceAll("&#39;", "'")).toContain("The whole zone, so the club's other sites too");
	});
});
