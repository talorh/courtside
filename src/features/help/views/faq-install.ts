import { CLUB } from "../../../club.ts";
import { films, type Role } from "../../../auth/permissions.ts";
import { html } from "../../../shared/html.ts";
import { faqItem, type HelpFor } from "./faq-item.ts";
import { appHead, I_BOOK, I_COPY, I_INSTALL, I_PLUS, I_SHARE, I_STAR, I_TABS, mock, row } from "./faq-mock.ts";

// The site on the Home Screen, opening full screen like an app (manifest.webmanifest, webapp.js). An iPhone never lets a
// page offer this, so iPhones get Safari's Share steps; Chrome on Android can, so the box below shows an Install button
// when it does. Safari and Chrome keep working as before, side by side with the app.

const SAFARI_BAR = mock("Safari's bar at the bottom of the screen, with the Share button ringed: a square with an arrow pointing up", html`
<div class="m-safari"><span class="m-url"><span>aA</span><b>${CLUB.domain}</b></span>
<span class="m-tools"><span>‹</span><span>›</span><span class="m-tap">${I_SHARE}</span>${I_BOOK}${I_TABS}</span></div>`);

const shareSheet = (h: HelpFor) => mock("Safari's Share menu for this page, with Add to Home Screen ringed, further down the list", html`
${appHead(`Help · ${h.c.short}`)}<span class="m-list">${row("Copy", I_COPY)}${row("Add Bookmark", I_BOOK)}${row("Add to Favourites", I_STAR)}
${row("Add to Home Screen", I_PLUS, true)}</span>`);

const ADD_SHEET = mock("The Add to Home Screen screen: the name Courtside, Open as Web App switched on, and Add ringed at the top right", html`
<span class="m-top"><span class="m-link">Cancel</span><b>Add to Home Screen</b><span class="m-link m-tap">Add</span></span>
<span class="m-card">${appHead()}</span>
<span class="m-card m-between">Open as Web App<span class="m-switch"></span></span>`);

const CHROME_BAR = mock("Chrome's bar at the top of the screen, with the three dots menu ringed at the right", html`
<span class="m-chrome"><span class="m-url"><b>${CLUB.domain}</b></span><span class="m-count">1</span><span class="m-kebab m-tap">⋮</span></span>`);

const CHROME_MENU = mock("Chrome's menu, with Install app ringed", html`
<span class="m-menu">${row("New tab")}${row("History")}${row("Downloads")}${row("Bookmarks")}
<span class="m-row m-tap">${I_INSTALL}Install app</span>${row("Settings")}</span>`);

const INSTALL_BOX = mock("Chrome's Install app box for Courtside, with Install ringed", html`
<span class="m-dialog"><b>Install app</b>${appHead()}<span class="m-actions"><span class="m-link">Cancel</span><span class="m-link m-tap">Install</span></span></span>`);

/** `role`: those who film are told live streaming needs Safari or Chrome, not the app. */
export const faqInstall = (h: HelpFor, role: Role) => faqItem("install", "How to install as an app", html`
<p>Put ${CLUB.domain} on your Home Screen as <b>${CLUB.siteName}</b> and it opens like an app, in one tap.</p>
<p>Some phones can do it from right here: if an <b>Install the app</b> button shows below, tap it, then <b>Install</b>. No
button? Follow the steps for your phone.</p>
<div class="installbox" id="install-box" hidden><button class="btn primary" type="button" hidden>Install the app</button>
<p class="small" data-note role="status"></p></div>
<h3>iPhone</h3>
<ol class="steps">
<li>Open <b>${CLUB.domain}</b> in <b>Safari</b> and sign in.</li>
<li>Tap <b>Share</b> (a square with an arrow pointing up). Can't see it? Tap <b>•••</b> first, then <b>Share</b>.${SAFARI_BAR}</li>
<li>Scroll down and tap <b>Add to Home Screen</b>.${shareSheet(h)}</li>
<li>It's called <b>Courtside</b>. Leave <b>Open as Web App</b> on, and tap <b>Add</b>.${ADD_SHEET}</li></ol>
<h3>Android</h3>
<ol class="steps">
<li>Open <b>${CLUB.domain}</b> in <b>Chrome</b> and sign in.</li>
<li>Tap <b>⋮</b> at the top right.${CHROME_BAR}</li>
<li>Tap <b>Install app</b> (some phones say <b>Add to Home screen</b>).${CHROME_MENU}</li>
<li>Tap <b>Install</b>.${INSTALL_BOX}</li></ol>
<h3>Good to know</h3>
<ul class="steps">
${films(role) ? html`<li><b>Live streaming can't be done in the app.</b> To <b>Go live</b>, open ${CLUB.domain} in Safari or Chrome instead.</li>
` : ""}<li><b>Asked to sign in?</b> The first time you open the app, it may ask for a new code. After that it stays signed in.</li>
<li><b>No back button in the app.</b> The club's logo goes to the home page, and pulling down from the top reloads.</li>
<li><b>Something won't work in the app?</b> Do it in Safari or Chrome instead: they still work as before.</li></ul>`);
