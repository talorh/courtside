import { describe, expect, it } from "vitest";
import { systemDiagram } from "../../../src/features/admin/views/docs-diagrams-core.ts";

describe("the Documentation's diagram of how the site fits together", () => {
	it("shows every Cloudflare product the site uses", () => {
		const svg = systemDiagram().__html;
		for (const part of ["Edge protection", "DDoS", "WAF", "bot", "rate limits", "Turnstile", "Worker: courtside", "Cron Triggers",
			"Durable Object", "Container", "D1", "R2", "Stream", "Images", "Workers AI", "Email Sending",
			"Workers Logs", "GraphQL Analytics", "Billing", "Workers Builds", "Artifacts", "Previews", "DNS", "DNSSEC", "Registrar",
			"Rules", "Email Routing", "Maintenance", "AI tracking camera", "RTMPS"]) {
			expect(svg, part).toContain(part);
		}
	});
});
