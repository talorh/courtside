import { CLUB } from "../club.ts";
// Emails in the site's style (the welcome and the sign-in code): the bottle-green bar, white cards
// with green header bands, the green button, Manrope where the phone has it. Email apps keep only inline styles (and
// tables lay it out everywhere). No images: a short email carrying one looks like spam to Outlook and Hotmail. The plain
// text of each email stands beside it (platform/email.ts).
import { html, raw, type SafeHtml } from "../shared/html.ts";

// The site's colours (public/app.css): bottle green bar, button green, its soft green, near-white page, lines and muted ink.
const FONT = "font-family:Manrope,system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
export const EMAIL = {
	page: raw(`max-width:560px;${FONT};font-size:16px;line-height:1.55;color:#121513`),
	card: raw("background:#FFFFFF;border:1px solid #E1E5E2;border-radius:12px"),
	band: raw(`margin:0;padding:12px 18px;background:${CLUB.colors.light.bar};border-radius:11px 11px 0 0;color:#FFFFFF;${FONT};font-size:18px;font-weight:700;line-height:1.3`),
	body: raw("padding:16px 18px 6px"),
	p: raw("margin:0 0 14px"),
	/** The sign-in code: large, spaced out, the one thing to read off the email. */
	code: raw(`margin:0 0 14px;padding:18px 14px;background:${CLUB.colors.light.soft};border-radius:8px;text-align:center;font-size:36px;font-weight:800;letter-spacing:4px;line-height:1.2;color:${CLUB.colors.light.bar}`),
	list: raw("margin:0 0 10px;padding-left:22px"),
	item: raw("margin:0 0 10px"),
	button: raw(`display:inline-block;padding:13px 22px;background:${CLUB.colors.light.button};border-radius:8px;color:#FFFFFF;${FONT};font-size:17px;font-weight:800;text-decoration:none`),
	muted: raw("margin:0;font-size:12.5px;line-height:1.5;color:#5D6862"),
};

/** A white card (a row of the email), with a green header band when it has a heading. */
export const emailCard = (inner: SafeHtml, band?: string): SafeHtml => html`<tr><td style="padding:0 0 14px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="${EMAIL.card}">
${band ? html`<tr><td><h2 style="${EMAIL.band}">${band}</h2></td></tr>` : ""}<tr><td style="${EMAIL.body}">${inner}</td></tr></table></td></tr>`;

export interface EmailShell {
	/** The email's title (what some apps show above it). */
	title: string;
	/** The top bar: the bold line and the small one under it. */
	heading: string;
	sub: string;
	/** The rows under the bar: emailCard()s, then whatever closes the email. */
	rows: SafeHtml;
	/** The small grey line at the bottom. */
	footer: string;
}

/** The whole email: the site's top bar, the rows, and the footer line. */
export function emailShell(o: EmailShell): string {
	return html`<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><title>${o.title}</title></head>
<body style="margin:0;padding:0;background:#F6F7F6"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F6F7F6"><tr><td align="center" style="padding:16px 10px 28px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="${EMAIL.page}">
<tr><td style="padding:0 0 14px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CLUB.colors.light.bar};border-radius:12px"><tr>
<td style="padding:14px 16px;color:#FFFFFF"><div style="font-size:21px;font-weight:800;line-height:1.15">${o.heading}</div><div style="font-size:13px;line-height:1.4;color:#CFE6D6">${o.sub}</div></td>
</tr></table></td></tr>
${o.rows}
<tr><td style="padding:4px 8px 0;text-align:center"><p style="${EMAIL.muted}">${o.footer}</p></td></tr>
</table></td></tr></table></body></html>`.__html;
}
