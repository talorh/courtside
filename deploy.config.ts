// Where the site runs: the Cloudflare account and the things the install made in it (INSTALL.md fills this in).
// Committed with the code, as Workers Builds deploys from the repository. Nothing secret lives here: the keys are
// Worker secrets (cf secrets) and the local .secrets.*.json files, which git ignores.
export const DEPLOY = {
	/** The Cloudflare account id (32 hex characters). */
	accountId: "REPLACE_WITH_ACCOUNT_ID",
	/** The zone id of the club's domain (src/club.ts domain) in that account. */
	zoneId: "REPLACE_WITH_ZONE_ID",
	/** The Worker's name; the joiner is `<name>-join` and the maintenance page `<name>-maintenance`. */
	worker: "courtside",
	/** Where the Worker runs, nearest the club and its database: an AWS-style region name Cloudflare placement accepts. */
	region: "aws:ap-southeast-2",
	/** The live site's D1 database and R2 bucket. */
	d1Name: "courtside",
	d1Id: "REPLACE_WITH_D1_ID",
	bucket: "courtside-originals",
	/** Stream's customer code for the account (the subdomain of its playback addresses). */
	streamCustomerCode: "REPLACE_WITH_STREAM_CUSTOMER_CODE",
	/** The sign-in page's Turnstile widget for the site. */
	turnstileSiteKey: "REPLACE_WITH_TURNSTILE_SITE_KEY",
	/** Who `cf dev` signs in as on this computer. */
	devEmail: "you@example.com",
	/** Staging (docs/runbooks/staging.md): its own database, bucket and Turnstile widget, in the same account. */
	staging: { d1Name: "courtside-staging", d1Id: "REPLACE_WITH_STAGING_D1_ID", bucket: "courtside-staging", turnstileSiteKey: "REPLACE_WITH_STAGING_TURNSTILE_SITE_KEY" },
};
