// Where the site runs: the Cloudflare account and the things the install made in it (INSTALL.md fills this in).
// Committed with the code, as Workers Builds deploys from the repository. Nothing secret lives here: the keys are
// Worker secrets (cf secrets) and the local .secrets.*.json files, which git ignores.
export const DEPLOY = {
	/** The Cloudflare account id (32 hex characters). */
	accountId: "REPLACE_WITH_ACCOUNT_ID",
	/** The zone id of the club's domain (src/club.ts domain) in that account. */
	zoneId: "REPLACE_WITH_ZONE_ID",
	/** The Worker's name; the joiner is `<name>-join`, the maintenance page `<name>-maintenance` and staging's own Worker
	 * `staging-<name>`. */
	worker: "courtside",
	/** Where the Worker runs, nearest the club and its database: an AWS-style region name Cloudflare placement accepts. */
	region: "aws:ap-southeast-2",
	/** The live site's D1 database and R2 bucket. The id below is a stand-in that local development (cf dev) also uses as
	 * its database's id; the install replaces it with the real one. */
	d1Name: "courtside",
	d1Id: "00000000-0000-4000-8000-000000000001",
	bucket: "courtside-originals",
	/** Stream's customer code for the account (the subdomain of its playback addresses). */
	streamCustomerCode: "REPLACE_WITH_STREAM_CUSTOMER_CODE",
	/** The sign-in page's Turnstile widget for the site. */
	turnstileSiteKey: "REPLACE_WITH_TURNSTILE_SITE_KEY",
	/** How the club sets its Cloudflare account up: "cf" (the setup runbook's commands, the usual way) or "terraform"
	 * (infra/terraform with npm run terraform, docs/runbooks/terraform.md). INSTALL.md asks; agents follow it. */
	cloudflareSetup: "cf",
	/** The local part of the zone's DMARC Management address (its reports go to <this>@dmarc-reports.cloudflare.net):
	 * Terraform's DMARC record (infra/zone/dns-dmarc.json). The cf commands fill the same address in by hand. */
	dmarcReports: "REPLACE_WITH_DMARC_REPORTS_ADDRESS",
	/** The site admins' emails, comma-separated: the site's first admins. npm run staging and npm run release make them
	 * admins while the site has never had one (a new install), never after, so an admin removed in the admin area stays
	 * removed; later admins are added on the Admins page. */
	firstAdmins: "REPLACE_WITH_THE_ADMINS_EMAILS",
	/** Who `cf dev` signs in as on this computer. */
	devEmail: "you@example.com",
	/** Staging (docs/runbooks/staging.md), its own Worker, staging-<worker>: its own database, bucket and Turnstile widget,
	 * in the same account, and its address, staging-<worker> on the account's workers.dev subdomain: the only hostname
	 * staging answers on. */
	staging: {
		d1Name: "courtside-staging", d1Id: "REPLACE_WITH_STAGING_D1_ID", bucket: "courtside-staging", turnstileSiteKey: "REPLACE_WITH_STAGING_TURNSTILE_SITE_KEY",
		host: "staging-courtside.REPLACE_WITH_WORKERS_SUBDOMAIN.workers.dev",
	},
};
