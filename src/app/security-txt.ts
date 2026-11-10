// security.txt (RFC 9116, needed once the site left Cloudflare Zero
// Trust): the one page anyone can read, saying where to report a security problem with the site. Served before
// the sign-in, at the standard address and the older one at the root; everything else stays behind the sign-in.
import { CLUB, siteOrigin } from "../club.ts";
import { BASE_HEADERS } from "./respond.ts";

/** Where a security problem is reported: security@ the site's domain, forwarded to the site's admin (runbook §7). */
export const securityContact = () => `mailto:security@${CLUB.domain}`;
const PATHS = new Set(["/.well-known/security.txt", "/security.txt"]);
const YEAR_MS = 365 * 86_400_000;

/** The file for a GET or HEAD of its address (`now` sets Expires a year ahead, as the RFC asks); null for anything else. */
export function securityTxt(req: Request, url: URL, now: Date): Response | null {
	if (!PATHS.has(url.pathname) || (req.method !== "GET" && req.method !== "HEAD")) return null;
	const text = [
		`Contact: ${securityContact()}`, `Expires: ${new Date(now.getTime() + YEAR_MS).toISOString()}`, "Preferred-Languages: en",
		`Canonical: ${siteOrigin()}/.well-known/security.txt`, "",
	].join("\n");
	return new Response(text, { headers: { ...BASE_HEADERS, "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=86400" } });
}
