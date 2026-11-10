import { html, type SafeHtml } from "../../../shared/html.ts";
import { formatGameDate, localTime } from "../../../shared/time.ts";
import { notice } from "../../../ui/components.ts";
import { layout, type PageFrame } from "../../../ui/layout.ts";
import type { Member } from "../../members/members-repository.ts";
import type { Photo } from "../photos-repository.ts";
import { confirmButton } from "../../../ui/confirm.ts";
import { askWho, teamCopy } from "../../teams/team-copy.ts";
import type { Team } from "../../teams/team.ts";
import { photoFileName } from "../photo-name.ts";

/** A photo page's message after a change (`?done=`), in the team's words. */
export const photoMessages = (team: Team): Record<string, string> => ({ removal: `Thanks. ${teamCopy(team).Ask} will look at your request to remove the photo.` });

export interface PhotoPageProps {
	frame: PageFrame;
	photo: Photo;
	/** Its signed link (the large variant); null when Images couldn't sign it just now. */
	url: string | null;
	/** The photos either side of it in the Photos page's order, if any, each with its signed picture (null when Images
	 * couldn't sign it), so a swipe on a phone shows them as they come (public/photo-swipe.js). */
	newer: number | null;
	older: number | null;
	newerUrl?: string | null;
	olderUrl?: string | null;
	/** The small pictures (the Photos page's thumbnails) of this photo and its neighbours: a swipe shows a neighbour's
	 * at once, blurred, until its full picture has come. */
	thumbUrl?: string | null;
	newerThumb?: string | null;
	olderThumb?: string | null;
	/** The page of Photos it's on, to go back to. */
	page: number;
	/** For a team manager: who added it (null once they've left the team). */
	addedBy: Member | null;
	message: string | null;
}

const size = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);


/**
 * A computer or an Android phone downloads it. On an iPhone or iPad a download lands in Files, or in the Home Screen app
 * opens a page with no way back, so public/photo-save.js makes it Save photo there: the share menu,
 * where Save Image puts it in Photos.
 */
function download(photo: Photo, team: Team): SafeHtml {
	return html`<div class="panel dl"><div class="eyebrow">Download</div>
<a class="btn primary" href="/photos/${photo.id}/download" data-save-photo data-name="${photoFileName(team, photo)}">Download photo <span>JPEG · ${size(photo.bytes)}</span></a>
<p class="small" data-save-hint hidden></p></div>`;
}

/** Everyone but a team manager and whoever added it asks for a photo to be removed. */
function askToRemove(photo: Photo, team: Team): SafeHtml {
	return html`<details class="panel"><summary class="btn quiet">Ask for this photo to be removed</summary>
<form method="post" action="/photos/${photo.id}/removal-requests" class="stack">
<p class="small">${askWho(teamCopy(team))} will see your request. You don't have to give a reason.</p>
<label>Reason (optional)<input name="reason" type="text" maxlength="500" placeholder="My child shouldn't appear"></label>
<button class="btn primary">Send request</button></form></details>`;
}

/** Deleting is final, so it asks first, on the page itself. */
const deleteButton = (photo: Photo) => confirmButton({ action: `/photos/${photo.id}/delete`, label: "Delete photo", question: "Delete this photo?", consequence: "It's deleted for good: it can't be brought back.", summaryClass: "btn" });

function manage(p: PhotoPageProps): SafeHtml {
	const who = p.addedBy ? p.addedBy.name || p.addedBy.email : "someone no longer on the team";
	return html`<div class="panel stack"><div class="eyebrow">Team manager</div>
<p class="small">Added by ${who}, ${formatGameDate(localTime(new Date(p.photo.createdAt)))}.</p>
${deleteButton(p.photo)}</div>`;
}

/** Whoever added it can take it back off (added by mistake, say). */
const own = (photo: Photo) => html`<div class="panel stack"><p class="small">You added this photo. Added it by mistake? You can delete it.</p>
${deleteButton(photo)}</div>`;

function sidePanel(p: PhotoPageProps): SafeHtml {
	if (p.frame.member.role === "manager") return manage(p);
	return p.photo.uploadedBy === p.frame.member.id ? own(p.photo) : askToRemove(p.photo, p.frame.team);
}

export function photoPage(p: PhotoPageProps): SafeHtml {
	const when = formatGameDate(p.photo.takenAt.slice(0, 16));
	const beside = (which: "newer" | "older", id: number | null, url: string | null | undefined, thumb: string | null | undefined) =>
		(id && url ? html` data-${which}="${id}" data-${which}-src="${url}"${thumb ? html` data-${which}-thumb="${thumb}"` : ""}` : "");
	const picture = p.url
		? html`<figure class="photoview" data-id="${p.photo.id}"${p.thumbUrl ? html` data-thumb="${p.thumbUrl}"` : ""}${beside("newer", p.newer, p.newerUrl, p.newerThumb)}${beside("older", p.older, p.olderUrl, p.olderThumb)}><img src="${p.url}" alt="Photo taken ${when}" width="${p.photo.width}" height="${p.photo.height}"></figure>`
		: notice("The photo can't be shown just now. Try again in a minute.", "warn");
	const newer = p.newer ? html`<a class="btn" href="/photos/${p.newer}" rel="prev">← Newer</a>` : "";
	const older = p.older ? html`<a class="btn" href="/photos/${p.older}" rel="next">Older →</a>` : "";
	// On a phone a swipe moves between photos too (public/photo-swipe.js); the hint shows only where there's no mouse.
	const swipe = p.newer || p.older ? html`<p class="small swipe-hint">Swipe left or right for the next photo.</p>` : "";
	return layout({ title: "Photo", frame: p.frame, current: "photos", scripts: ["/photo-save.js", "/photo-swipe.js"] }, html`<div><a class="btn photoback" href="/photos?page=${p.page}#p${p.photo.id}">← All photos</a></div>
${notice(p.message)}<div class="watch"><div class="stack watch-main">${picture}<p class="small photo-when">${when}</p>
<nav class="row-actions photonav" aria-label="Other photos">${newer}${older}</nav>${swipe}</div>
<aside class="side">${download(p.photo, p.frame.team)}${sidePanel(p)}</aside></div>`);
}
