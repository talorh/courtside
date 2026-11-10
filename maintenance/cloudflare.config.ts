import { bindings, defineConfig, triggers } from "cf/config";
// Namespace import is required by the cf config API (cf-worker import attribute).
import * as entrypoint from "./index.ts" with { type: "cf-worker" };
import { CLUB } from "../src/club.ts";
import { DEPLOY } from "../deploy.config.ts";

// The maintenance page Worker (docs/runbooks/maintenance.md). Deploy and switch it only with `npm run maintenance`,
// which runs cf in this folder. While MAINTENANCE=on is set as cf reads this file, the Worker gets the route
// <domain>/* (which takes precedence over the site's custom domain); without it, no route at all.
// Who gets through to the real site during maintenance: its own list, not the site's admins table, as it must work when
// the site's database doesn't. Comma-separated; a new admin is added here too (npm run maintenance -- deploy).
const ADMIN_EMAILS = "admin@example.com";

export default defineConfig(() => ({
	accountId: DEPLOY.accountId,
	worker: {
		name: `${DEPLOY.worker}-maintenance`,
		compatibilityDate: "2026-09-25",
		entrypoint,
		workersDev: false,
		previewUrls: false,
		observability: { enabled: true, redactQueryString: true },
		triggers: process.env.MAINTENANCE === "on" ? [triggers.fetch({ pattern: `${CLUB.domain}/*`, zone: DEPLOY.zoneId })] : [],
		env: {
			ADMIN_EMAILS: bindings.text(ADMIN_EMAILS),
		},
	},
}));
