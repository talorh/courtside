import { html, type SafeHtml } from "../../../shared/html.ts";
import { CLUB, clubWordmark } from "../../../club.ts";
import type { Player } from "../players-repository.ts";

// The home singlet, drawn inline in the club's colours (club.css): the club's name across the chest, the number under
// it, white trim edged in black, and dark and white shards up each side. Saira Semi Condensed for the name and Teko
// for the tall squared numbers.

const BODY = "M33 4h12l15 26 15-26h12c1 19 9 30 23 34v100H10V38C24 34 32 23 33 4z";
const TRIM = "M45 4l15 26 15-26M33 4c-1 19-9 30-23 34M87 4c1 19 9 30 23 34";
const SHARDS_DARK = "M10 74l16 26-16-4zM10 104l22 22-22 0zM110 74l-16 26 16-4zM110 104l-22 22 22 0z";
const SHARDS_LIGHT = "M10 96l12 8-12 2zM10 126l14 12H10zM110 96l-12 8 12 2zM110 126l-14 12h14z";

export function jersey(p: Player): SafeHtml {
	return html`<svg class="jersey" viewBox="0 0 120 140" role="img" aria-label="${CLUB.nickname} singlet, number ${p.number}">
<path class="kit" d="${BODY}"/><path class="kit-shard" d="${SHARDS_DARK}"/><path class="kit-shard-light" d="${SHARDS_LIGHT}"/>
<path class="kit-edge" d="${TRIM}"/><path class="kit-trim" d="${TRIM}"/>
<circle class="kit-badge" cx="82" cy="44" r="4.5"/>
<text class="kit-name" x="60" y="74">${clubWordmark()}</text>
<text class="kit-num" x="60" y="110">${p.number}</text></svg>`;
}
