// The two files that are made from the club's config rather than kept in public/: the club's colours as a
// stylesheet (every page links /club.css before app.css, whose other tokens are the same for every club) and the
// Home Screen manifest (the site's name and colours). Open to anyone, like the sign-in page's own files.
import { CLUB, type ClubColors } from "../club.ts";
import { BASE_HEADERS } from "./respond.ts";

const tokens = (c: ClubColors) => `--bar:${c.bar};--bar-line:${c.bar};--club:${c.button};--club-ink:${c.buttonInk};--club-soft:${c.soft}`;

/** The club's colour tokens, light and dark, in the shape app.css expects (an explicit theme choice wins both ways). */
export function clubCss(): string {
	const { light, dark } = CLUB.colors;
	return `:root{${tokens(light)}}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){${tokens(dark)}}}
:root[data-theme="dark"]{${tokens(dark)}}
`;
}

/** The web app manifest: the site's name, its deep colour behind the launch screen, the icons in public/. */
export function manifest(): string {
	return JSON.stringify({
		id: "/", name: CLUB.siteName, short_name: CLUB.siteName, start_url: "/?app", scope: "/", display: "standalone",
		background_color: CLUB.colors.light.bar, theme_color: CLUB.colors.light.bar,
		icons: [
			{ src: "/icon-192.png", sizes: "192x192", type: "image/png" },
			{ src: "/icon-512.png", sizes: "512x512", type: "image/png" },
			{ src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
		],
	}, null, 2);
}

const FILES: Record<string, () => { body: string; type: string }> = {
	"/club.css": () => ({ body: clubCss(), type: "text/css; charset=utf-8" }),
	"/manifest.webmanifest": () => ({ body: manifest(), type: "application/manifest+json" }),
};

/** The response for a GET or HEAD of one of these files; null for anything else. Cached a day: a colour change is a deploy. */
export function clubFile(req: Request, url: URL): Response | null {
	const file = FILES[url.pathname];
	if (!file || (req.method !== "GET" && req.method !== "HEAD")) return null;
	const { body, type } = file();
	return new Response(body, { headers: { ...BASE_HEADERS, "Content-Type": type, "Cache-Control": "public, max-age=86400" } });
}
