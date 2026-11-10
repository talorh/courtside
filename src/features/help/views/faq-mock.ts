import { CLUB } from "../../../club.ts";
import { html, raw, type SafeHtml } from "../../../shared/html.ts";

// Mock screenshots for the Help page: phone screens drawn in HTML, so they're sharp on every screen and light or dark with the
// page. What to tap is ringed in green. A screen reader reads each one's description instead, and Virtual Team Manager skips
// them (help-knowledge.ts drops every figure.mock).

/** A real screenshot of the site (public/help/, taken on staging with test
 * data, wherever a picture helps): shown small, like a phone in the hand. `alt` says what it shows. */
export const shot = (name: string, alt: string, width = 390, height = 844) =>
	html`<figure class="shot"><img src="/help/${name}.webp" alt="${alt}" width="${width}" height="${height}" loading="lazy" decoding="async"></figure>`;

/** Two or three screenshots side by side (wrapping on a phone). */
export const shots = (...figures: SafeHtml[]) => html`<div class="shots">${figures}</div>`;

/** One mock screen. `alt` says what it shows; `kind` is an extra class (a wider screen, say). */
export const mock = (alt: string, body: SafeHtml, kind = "") =>
	html`<figure class="${kind ? `mock ${kind}` : "mock"}" role="img" aria-label="${alt}">${body}</figure>`;

/** A row in a menu or share sheet: its label, then its icon. `tap` rings it. */
export const row = (label: string, icon: SafeHtml | "" = "", tap = false) =>
	html`<span class="${tap ? "m-row m-tap" : "m-row"}">${label}${icon}</span>`;

/** The top of a share sheet or install box: the club's logo, the name and the address. */
export const appHead = (name = CLUB.siteName, sub = CLUB.domain) =>
	html`<span class="m-head"><img class="m-logo" src="/logo.png" alt="" width="34" height="34"><span class="m-app"><b>${name}</b><small>${sub}</small></span></span>`;

const icon = (body: string) => raw(`<svg class="m-ico" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`);

// iOS-style line icons, close enough to the real ones to spot.
export const I_SHARE = icon('<path d="M8.5 9.5h-2v11h11v-11h-2M12 3v11M8.5 6.5 12 3l3.5 3.5"/>');
export const I_PLUS = icon('<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8.5v7M8.5 12h7"/>');
export const I_COPY = icon('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>');
export const I_BOOK = icon('<path d="M3 5.5c3-1.2 6-1 9 1 3-2 6-2.2 9-1V19c-3-1.2-6-1-9 1-3-2-6-2.2-9-1z"/><path d="M12 6.5V20"/>');
export const I_STAR = icon('<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z"/>');
export const I_TABS = icon('<rect x="8" y="3.5" width="12.5" height="12.5" rx="2"/><path d="M4 8v10.5A1.5 1.5 0 0 0 5.5 20H16"/>');
export const I_FOLDER = icon('<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2h8.5A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z"/>');
export const I_PHOTO = icon('<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.6"/><path d="M21 16l-5-5-8 8"/>');
export const I_CAMERA = icon('<path d="M3 8.5A1.5 1.5 0 0 1 4.5 7H7l1.5-2h7L17 7h2.5A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z"/><circle cx="12" cy="13" r="3.5"/>');
export const I_PHONE = icon('<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 18.5h3"/>');
export const I_CLOUD = icon('<path d="M7 18.5h10.5a4 4 0 0 0 .6-8A6 6 0 0 0 6.6 9 4.8 4.8 0 0 0 7 18.5z"/>');
export const I_INSTALL = icon('<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M12 7v7M9 11l3 3 3-3"/>');
/** AirPlay: a screen with a triangle. Sits in the text, the size of the words. */
export const I_AIRPLAY = raw('<svg class="m-inl" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 17H4.5A1.5 1.5 0 0 1 3 15.5v-10A1.5 1.5 0 0 1 4.5 4h15A1.5 1.5 0 0 1 21 5.5v10a1.5 1.5 0 0 1-1.5 1.5H18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M12 14l5 6.5H7z" fill="currentColor"/></svg>');
