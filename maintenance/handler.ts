// What the maintenance Worker answers (docs/runbooks/maintenance.md). While its route is on, every request to the site
// comes here first. Admins (signed in to the site, which says who they are, and on this Worker's own list) go on to the
// real site with a banner; everyone else gets the maintenance page, or its JSON for API calls.
import { maintenanceJson, maintenancePage, MAINTENANCE_HEADERS } from "./page.ts";

export interface MaintenanceEnv {
	/** The admins who get through, comma-separated: this Worker's own list, as it must work when the site's database doesn't. */
	ADMIN_EMAILS: string;
}

interface Ports {
	/** The signed-in email, from the site itself (/signin/whoami); throws when there's no sign-in or the site can't say. */
	authenticate: (req: Request) => Promise<string>;
	/** The real site (its custom domain, which a route Worker reaches with fetch). */
	upstream: (req: Request) => Promise<Response>;
}

const BANNER = '<div class="note warn" role="status"><b>Maintenance is on:</b> only admins can see the site. Switch it off with <code>npm run maintenance -- off</code>.</div>';

async function adminEmail(req: Request, env: MaintenanceEnv, authenticate: Ports["authenticate"]): Promise<string | null> {
	const admins = new Set(env.ADMIN_EMAILS.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean));
	try {
		const email = (await authenticate(req)).toLowerCase();
		return admins.has(email) ? email : null;
	} catch (err) {
		// Expected for anyone not signed in, and for everyone while the site itself is down: they get the maintenance
		// page, like any other non-admin. Logged, so a run of them can be seen.
		console.warn(JSON.stringify({ event: "maintenance_not_admin", error: String(err) }));
		return null;
	}
}

/** An admin's page with the banner straight after `<body…>`; anything else (JSON, images, redirects) as it came. */
async function withBanner(res: Response): Promise<Response> {
	if (!res.headers.get("Content-Type")?.startsWith("text/html") || res.status !== 200) return res;
	const page = (await res.text()).replace(/<body[^>]*>/, (tag) => tag + BANNER);
	const headers = new Headers(res.headers);
	headers.delete("Content-Length");
	return new Response(page, { status: res.status, headers });
}

export async function handleMaintenance(req: Request, env: MaintenanceEnv, ports: Ports): Promise<Response> {
	if (await adminEmail(req, env, ports.authenticate)) return withBanner(await ports.upstream(req));
	const api = new URL(req.url).pathname.startsWith("/api/");
	const body = api ? JSON.stringify(maintenanceJson()) : maintenancePage();
	const type = api ? "application/json; charset=utf-8" : "text/html; charset=utf-8";
	return new Response(body, { status: 503, headers: { ...MAINTENANCE_HEADERS, "Content-Type": type } });
}
