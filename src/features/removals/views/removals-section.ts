import { html, type SafeHtml } from "../../../shared/html.ts";
import { formatDay, formatGameDate, localTime } from "../../../shared/time.ts";
import { gameTitle } from "../../games/game-format.ts";
import type { OpenClipRemovalRequest } from "../../clips/clip-removals-repository.ts";
import type { OpenPhotoRemovalRequest } from "../../photos/photo-removals-repository.ts";
import type { OpenRemovalRequest } from "../removals-repository.ts";
import { confirmButton } from "../../../ui/confirm.ts";

function requestRow(r: OpenRemovalRequest): SafeHtml {
	const when = formatGameDate(localTime(new Date(r.createdAt)));
	const actions = r.isVideoDeleted
		// Nothing left to delete, so closing the request needs no question.
		? html`<span class="small">Video already deleted.</span><form method="post" action="/removal-requests/${r.id}/delete-video" class="inline"><input type="hidden" name="confirm" value="yes"><button class="btn">Close request</button></form>`
		: html`${confirmButton({ action: `/removal-requests/${r.id}/delete-video`, label: "Delete video", question: "Delete this video?", consequence: "It's kept for 24 hours in case it was a mistake, then it's gone for good.", summaryClass: "btn primary" })}
<form method="post" action="/removal-requests/${r.id}/keep" class="inline"><input type="hidden" name="note" value=""><button class="btn">Keep video</button></form>`;
	return html`<div class="libhead request-row"><span><a href="/games/${r.game.id}"><b>${gameTitle(r.game)}</b></a>
<span class="small"> · asked by ${r.requesterEmail}, ${when}${r.reason ? html` · "${r.reason}"` : ""}</span></span>
<span class="row-actions">${actions}</span></div>`;
}

function clipRequestRow(r: OpenClipRemovalRequest): SafeHtml {
	const when = formatGameDate(localTime(new Date(r.createdAt)));
	return html`<div class="libhead request-row"><span><a href="/games/${r.game.id}?clip=${r.clipId}"><b>Clip: ${r.clipLabel}</b></a>
<span class="small"> · ${gameTitle(r.game)} · asked by ${r.requesterEmail}, ${when}${r.reason ? html` · "${r.reason}"` : ""}</span></span>
<span class="row-actions">${confirmButton({ action: `/clip-removal-requests/${r.id}/delete-clip`, label: "Delete clip", question: "Delete this clip?", consequence: "It can't be brought back.", summaryClass: "btn primary" })}
<form method="post" action="/clip-removal-requests/${r.id}/keep" class="inline"><input type="hidden" name="note" value=""><button class="btn">Keep clip</button></form></span></div>`;
}

/** A photo's request shows the photo itself (`thumb`: its signed thumbnail link, or null when Images couldn't sign it). */
function photoRequestRow(r: OpenPhotoRemovalRequest, thumb: string | null): SafeHtml {
	const when = formatGameDate(localTime(new Date(r.createdAt)));
	const picture = thumb ? html`<a href="/photos/${r.photoId}"><img src="${thumb}" alt="The photo" width="64" height="64"></a>` : "";
	return html`<div class="libhead request-row"><span class="photoreq">${picture}<span><a href="/photos/${r.photoId}"><b>Photo taken ${formatDay(r.takenAt)}</b></a>
<span class="small"> · asked by ${r.requesterEmail}, ${when}${r.reason ? html` · "${r.reason}"` : ""}</span></span></span>
<span class="row-actions">${confirmButton({ action: `/photo-removal-requests/${r.id}/delete-photo`, label: "Delete photo", question: "Delete this photo?", consequence: "It can't be brought back.", summaryClass: "btn primary" })}
<form method="post" action="/photo-removal-requests/${r.id}/keep" class="inline"><input type="hidden" name="note" value=""><button class="btn">Keep photo</button></form></span></div>`;
}

export interface PhotoRequests {
	requests: OpenPhotoRemovalRequest[];
	/** Each requested photo's signed thumbnail link, by photo id; null when Images couldn't sign them just now. */
	thumbs: Map<number, string> | null;
}

export function removalsSection(requests: OpenRemovalRequest[], clipRequests: OpenClipRemovalRequest[], photos: PhotoRequests): SafeHtml | "" {
	const open = requests.length + clipRequests.length + photos.requests.length;
	if (open === 0) return "";
	return html`<div class="panel panel-warn" id="removals"><div class="eyebrow">Removal requests · ${open} open</div>
${requests.map(requestRow)}${clipRequests.map(clipRequestRow)}${photos.requests.map((r) => photoRequestRow(r, photos.thumbs?.get(r.photoId) ?? null))}</div>`;
}
