// The maintenance Worker, courtside-maintenance (docs/runbooks/maintenance.md): attached to saints.example/* only while
// maintenance is on, where its route takes precedence over the site's custom domain. The site's own sign-in stays in
// front of it: this Worker asks the site who a request is (/signin/whoami, with the request's cookies), as it has no
// database of its own.
import { handleMaintenance, type MaintenanceEnv } from "./handler.ts";

export default {
	async fetch(req, env) {
		// fetch(req) from a route Worker reaches the Worker on the hostname's custom domain: the real site.
		const upstream = (r: Request) => fetch(r);
		const authenticate = async (r: Request) => {
			const who = await upstream(new Request(new URL("/signin/whoami", r.url), { headers: { Cookie: r.headers.get("Cookie") ?? "" } }));
			if (!who.ok) throw new Error(`whoami: HTTP ${who.status}`);
			const { data } = (await who.json()) as { data?: { email?: string } };
			if (typeof data?.email !== "string") throw new Error("whoami: no email");
			return data.email;
		};
		return handleMaintenance(req, env, { authenticate, upstream });
	},
} satisfies ExportedHandler<MaintenanceEnv>;
