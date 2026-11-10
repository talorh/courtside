// The maintenance page: one self-contained file in the site's look, shown while the site is being
// upgraded or is down. It needs nothing from the site (no fonts, stylesheet or images to fetch), as the site may be the
// thing that's down.
import { BASE_HEADERS } from "../src/app/respond.ts";
import { html, raw } from "../src/shared/html.ts";
import { CLUB } from "../src/club.ts";
import { LOGO } from "./logo.ts";

/** The site's own security headers, with a CSP for this one page: no scripts at all, its own inline styles, a data: logo. */
export const MAINTENANCE_HEADERS: Record<string, string> = {
	...BASE_HEADERS,
	"Content-Security-Policy": "default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
	"Retry-After": "1800",
};

// Never a time, just back soon: a time that slips is worse than none.
const LINE = "We're upgrading the site. We'll be back soon.";

/** For the upload and Go live pages' API calls: the site's JSON shape, so they show the line instead of an error. */
export const maintenanceJson = () => ({ ok: false, error: { code: "maintenance", message: LINE } });

const STYLE = `
:root{--bar:${CLUB.colors.light.bar};--club:${CLUB.colors.light.button};--bg:#F6F7F6;--card:#FFFFFF;--fg:#121513;--muted:#5D6862;--line:#E1E5E2;color-scheme:light}
@media (prefers-color-scheme: dark){:root{--bar:${CLUB.colors.dark.bar};--club:${CLUB.colors.dark.button};--bg:#0D110E;--card:#161C18;--fg:#ECF1ED;--muted:#9DAAA1;--line:#2A332D;color-scheme:dark}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;min-height:100vh}
header{background:var(--bar);padding:28px 16px 64px;display:flex;justify-content:center}
header img{width:84px;height:84px;border-radius:50%;background:#fff}
main{max-width:460px;margin:-40px auto 32px;padding:0 16px}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:28px 24px;text-align:center;display:grid;gap:12px}
.eyebrow{font:600 12px/1 ui-monospace,Consolas,monospace;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}
h1{margin:0;font-size:34px;font-weight:800;line-height:1.1}
p{margin:0}
.lead{font-size:18px;font-weight:600}
.small{font-size:14px;color:var(--muted)}
.btn{justify-self:center;display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:12px 28px;border-radius:10px;background:var(--club);color:#fff;font-weight:700;text-decoration:none;margin-top:6px}
`;

/** The page itself. */
export function maintenancePage(): string {
	return html`<!doctype html>
<html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><meta http-equiv="refresh" content="60">
<title>Back soon · ${CLUB.siteName}</title><style>${raw(STYLE)}</style></head>
<body><header><img src="${LOGO}" alt="${CLUB.siteName}" width="84" height="84"></header>
<main><div class="card"><p class="eyebrow">${CLUB.siteName}</p><h1>Time out!</h1>
<p class="lead">${LINE}</p>
<p>Your videos and photos are safe. The team's just in the huddle working on a few new plays.</p>
<a class="btn" href="">Try again</a>
<p class="small">This page checks again by itself every minute.</p></div></main></body></html>`.__html;
}
