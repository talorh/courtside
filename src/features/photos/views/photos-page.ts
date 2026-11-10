import { html, type SafeHtml } from "../../../shared/html.ts";
import { formatClock, formatDay } from "../../../shared/time.ts";
import { confirmButton } from "../../../ui/confirm.ts";
import { notice, pageHead } from "../../../ui/components.ts";
import { layout, type PageFrame } from "../../../ui/layout.ts";
import type { Member } from "../../members/members-repository.ts";
import type { Photo } from "../photos-repository.ts";
import { canDeletePhoto } from "../photos-service.ts";

/** Each thumbnail's link is signed by Images when the page is made, so a page holds 60, not hundreds. */
export const PHOTOS_PER_PAGE = 60;

export const PHOTOS_MESSAGES: Record<string, string> = { added: "Photos added. Nice assist!", deleted: "Photo deleted.", "deleted-some": "Photos deleted." };

export interface PhotosPageProps {
	frame: PageFrame;
	/** This page's photos, newest taken first. */
	photos: Photo[];
	/** Each one's signed thumbnail link, by photo id; null when Images couldn't sign them just now. */
	urls: Map<number, string> | null;
	page: number;
	pages: number;
	message: string | null;
}

/** Everyone on the team adds photos, Watch only too: chosen, or dropped on the box on a computer. public/photos.js
 * makes each smaller and sends it. */
const ADD = html`<form class="panel stack" id="addphotos"><div class="eyebrow">Add photos</div>
<label class="btn primary bigpick filepick"><span>Choose photos</span><input id="photo-files" type="file" accept="image/*" multiple></label>
<p class="small">Pick as many as you like. Each one is made smaller on your phone or computer first, with where it was taken
left off. Everyone in the team can see and download them.</p>
<span class="small drop-hint">On a computer you can also drag photos onto this box.</span>
<div class="file" id="photo-progress" hidden><div class="row"><b id="photo-count"></b><span class="small" id="photo-pct"></span></div>
<div class="prog"><i id="photo-bar"></i></div><span class="small" id="photo-hint" role="status"></span></div></form>`;

/** The page's photos in runs of the same day (they're newest first already). */
function byDay(photos: Photo[]): Array<{ date: string; photos: Photo[] }> {
	const days: Array<{ date: string; photos: Photo[] }> = [];
	for (const photo of photos) {
		const date = photo.takenAt.slice(0, 10);
		const last = days.at(-1);
		if (last?.date === date) last.photos.push(photo);
		else days.push({ date, photos: [photo] });
	}
	return days;
}

/** Each tile's tick box, for choosing several (public/photos-pick.js shows them); data-mine: the member may delete it. */
const tile = (photo: Photo, url: string, mine: boolean) => html`<li><a href="/photos/${photo.id}" id="p${photo.id}"><img src="${url}" alt="Photo, ${formatClock(photo.takenAt.slice(11, 16))}" width="512" height="512" loading="lazy"></a><input type="checkbox" name="id" value="${photo.id}" aria-label="Choose this photo"${mine ? html` data-mine` : ""}></li>`;

function grid(photos: Photo[], urls: Map<number, string>, member: Member): SafeHtml {
	return html`<form id="photopick" method="get" action="/photos/download">${byDay(photos).map((day) => html`<section class="photoday"><h2>${formatDay(day.date)}</h2>
<ul class="photogrid">${day.photos.map((photo) => tile(photo, urls.get(photo.id) ?? "", canDeletePhoto(member, photo)))}</ul></section>`)}</form>`;
}

/** Choosing several: Select photos, above them, shows the tick boxes. */
const PICK_START = html`<div class="row-actions"><button class="btn" type="button" id="pick-start" hidden>Select photos</button></div>`;

/** The bar saying how many are chosen and what can be done with them: after the photos, so it stays at the foot of the
 * screen while they scroll by. */
const PICK_BAR = html`<div class="pickbar" id="pickbar" hidden><b id="pick-count" role="status"></b>
<button class="btn primary" form="photopick" id="pick-download">Download</button>
${confirmButton({ action: "/photos/delete", label: "Delete", question: "Delete these photos?", consequence: "They're deleted for good: they can't be brought back.", summaryClass: "btn danger" })}
<span class="small" id="pick-note" hidden>Only the photos you added can be deleted.</span>
<button class="btn quiet" type="button" id="pick-cancel">Cancel</button><span class="small" id="pick-hint" hidden></span></div>`;

function pager(page: number, pages: number): SafeHtml | "" {
	if (pages <= 1) return "";
	const newer = page > 1 ? html`<a class="btn" href="/photos?page=${page - 1}">← Newer photos</a>` : "";
	const older = page < pages ? html`<a class="btn" href="/photos?page=${page + 1}">Older photos →</a>` : "";
	return html`<nav class="row-actions pager" aria-label="More photos">${newer}<span class="small">Page ${page} of ${pages}</span>${older}</nav>`;
}

export function photosPage(p: PhotosPageProps): SafeHtml {
	// A closed season takes no more.
	const canAdd = p.frame.team.status === "active";
	const who = canAdd ? " Tap Choose photos to add yours." : "";
	const photos = !p.photos.length ? html`<p>No photos yet.${who}</p>`
		: p.urls ? html`<p class="small">Newest first. Tap a photo to see it bigger or download it; <b>Select photos</b> downloads or deletes several at once.</p>${PICK_START}${grid(p.photos, p.urls, p.frame.member)}${PICK_BAR}${pager(p.page, p.pages)}`
		: notice("The photos can't be shown just now. Try again in a minute.", "warn");
	return layout({ title: "Photos", frame: p.frame, current: "photos", scripts: [...(canAdd ? ["/photos.js"] : []), ...(p.photos.length && p.urls ? ["/photos-pick.js"] : [])] }, html`${pageHead(null, "Photos")}
${notice(p.message)}${canAdd ? ADD : ""}${photos}`);
}
