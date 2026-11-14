// Each platform alert's words, shared by Platform's rows and Insights' Alerts section.
import type { AlertKind } from "./alerts-repository.ts";

/** Each alert: its name (as Insights' Needs attention says it), its row's heading here, what a warning says, and what it
 * says until its first check (a new site's 3am ones wait for the night). */
export const KINDS: Array<{ kind: AlertKind; label: string; heading: string; warn: string; first: string }> = [
	{ kind: "stream_storage", label: "Video storage (Stream)", heading: "Video storage (Stream)", warn: "Running low", first: "Not checked yet: the 5-minute job checks it every hour." },
	{ kind: "images", label: "Photos (Images)", heading: "Photos (Images)", warn: "Getting close", first: "Not checked yet: the 3am job checks it every night." },
	{ kind: "database", label: "Database (D1)", heading: "Database (D1)", warn: "Getting big", first: "Not checked yet: the 3am job checks it every night." },
	{ kind: "site_errors", label: "Server errors", heading: "Server errors", warn: "Failing", first: "Not checked yet: the 5-minute job checks it every run." },
	{ kind: "email", label: "Emails", heading: "Emails", warn: "Not going", first: "Not checked yet: the 5-minute job checks it every run." },
	{ kind: "email_allowance", label: "Emails this month", heading: "Emails this month", warn: "Getting close", first: "Not checked yet: the 5-minute job checks it every run." },
	{ kind: "budget", label: "Team budgets", heading: "Team budgets", warn: "Going over", first: "Not checked yet: opening Costs checks it, and the 3am job every night." },
	{ kind: "ai_models", label: "AI models (Workers AI)", heading: "AI models (Workers AI)", warn: "Being retired", first: "Not checked yet: opening Platform checks it, and the 3am job every night." },
	{ kind: "daily_job", label: "3am job", heading: "The 3am job", warn: "Failing", first: "Not run yet: it runs at 3am." },
	{ kind: "sync_job", label: "5-minute job", heading: "The 5-minute job", warn: "Failing", first: "Not run yet: it runs every 5 minutes." },
	{ kind: "joiner", label: "Video joiner", heading: "The video joiner", warn: "Not answering", first: "Not checked yet: the 3am job tries it every night." },
	{ kind: "game_day", label: "Game check", heading: "The game check", warn: "Not ready", first: "Not checked yet: the 5-minute job checks each live game 8 hours before tip-off, and Platform's button checks the week's now." },
];
