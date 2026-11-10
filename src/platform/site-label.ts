// Staging (docs/runbooks/staging.md) shares the account's Stream and Images with the live site. What it makes there is
// labelled `site: "staging"`, so the live site's nightly clean-up can tell it from the live site's own (jobs/sweep-orphans.ts).

/** The label for what this site makes: `{ site: "staging" }` on staging, nothing on the live site. */
export const siteLabel = (site: string | null | undefined): Record<string, string> => (site ? { site } : {});

/** Whose a listed thing is: "staging", or null for the live site's. */
export const siteOf = (meta: Record<string, unknown> | undefined) => (typeof meta?.site === "string" ? meta.site : null);
