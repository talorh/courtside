import { CLUB } from "../../../club.ts";
import { html } from "../../../shared/html.ts";
import { faqItem } from "./faq-item.ts";

// Help is for using the site, so child safety points to the standards body's (club.ts) and the club's own
// handbook and/or website rather than restating them or telling people what to do. The site isn't the club's own, so it
// doesn't speak for the club. How the site meets the standards is in docs/child-safety.md.

export const faqSafety = () => faqItem("safety", "Standards", html`
<p>This site makes its best efforts to meet
<a href="${CLUB.childSafety.url}" target="_blank" rel="noopener">${CLUB.childSafety.body}'s Child Safe Standards</a>.</p>
<p>The ${CLUB.nickname} handbook and/or website will cover child safety policies.</p>`);
