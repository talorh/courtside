import type { SafeHtml } from "../shared/html.ts";
import { LAUNCH_CSS_HASH } from "../ui/launch-style.ts";

/**
 * Only this site's Stream (player, thumbnails, live, downloads), its own R2 account (uploads go straight there) and
 * Cloudflare Images (the team's photos, through signed links); on the sign-in pages, Turnstile too. Set on every response in handle-request.ts, as the hosts
 * come from config (the site's account and Stream customer code).
 */
export function contentSecurityPolicy(c: { streamCustomerCode: string; accountId: string }, o: { launch?: boolean; turnstile?: boolean } = {}): string {
	const stream = `https://customer-${c.streamCustomerCode}.cloudflarestream.com`;
	// The sign-in pages' Turnstile widget (platform/turnstile.ts): Cloudflare's script, and the frame it draws in.
	const turnstile = o.turnstile ? " https://challenges.cloudflare.com" : "";
	return [
		"default-src 'self'",
		`script-src 'self'${turnstile}`,
		// The launch spinner carries its own look (ui/launch-style.ts), allowed by its hash; no other page has a <style>.
		`style-src 'self'${o.launch ? ` '${LAUNCH_CSS_HASH}'` : ""}`,
		"font-src 'self'",
		// blob: is a photo the member chose on their own phone, drawn smaller before it's sent (public/photos.js). data: is
		// the launch screen's own club logo, in the page itself (ui/landing-pages.ts), and no other page's.
		`img-src 'self' ${o.launch ? "data: " : ""}blob: https://imagedelivery.net ${stream}`,
		`frame-src ${stream}${turnstile}`,
		`connect-src 'self' https://${c.accountId}.r2.cloudflarestorage.com ${stream}`,
		"form-action 'self'",
		"frame-ancestors 'none'",
		"base-uri 'none'",
	].join("; ");
}

// Go live uses the camera and microphone on this site's own pages; nothing else asks for device features.
const PERMISSIONS = "camera=(self), microphone=(self), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), display-capture=()";

export const BASE_HEADERS: Record<string, string> = {
	"Content-Security-Policy": "default-src 'none'",
	"Permissions-Policy": PERMISSIONS,
	"X-Robots-Tag": "noindex, nofollow",
	"X-Content-Type-Options": "nosniff",
	"Referrer-Policy": "same-origin",
	// preload: on the browsers' preload list, the club's domain is never tried over plain HTTP, even first time.
	"Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
	"Cache-Control": "no-store",
};

export function htmlResponse(body: SafeHtml, status = 200): Response {
	return new Response(body.__html, { status, headers: { ...BASE_HEADERS, "Content-Type": "text/html; charset=utf-8" } });
}

function json(body: unknown, status: number): Response {
	return new Response(JSON.stringify(body), { status, headers: { ...BASE_HEADERS, "Content-Type": "application/json" } });
}

export const jsonOk = (data: unknown, status = 200) => json({ ok: true, data }, status);
export const jsonError = (status: number, code: string, message: string) => json({ ok: false, error: { code, message } }, status);

/** A file to save (the fixture's sample spreadsheet, the roster in Excel), with the site's usual headers. */
export function fileResponse(body: BodyInit, contentType: string, fileName: string): Response {
	return new Response(body, { headers: { ...BASE_HEADERS, "Content-Type": contentType, "Content-Disposition": `attachment; filename="${fileName}"` } });
}

/** 303 after form posts (PRG); 302 for download hand-offs. */
export function redirect(location: string, status: 302 | 303 = 303): Response {
	return new Response(null, { status, headers: { ...BASE_HEADERS, Location: location } });
}
