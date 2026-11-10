import { z } from "zod";
import { badRequest, HttpError, notFound } from "../../app/errors.ts";
import { fileResponse, htmlResponse, jsonOk, redirect } from "../../app/respond.ts";
import type { Router } from "../../app/router.ts";
import { doneMessage, idParam, parseForm } from "../../shared/validation.ts";
import { logMediaDownloads } from "../videos/downloads-repository.ts";
import { getActiveMember } from "../members/members-repository.ts";
import { photoLinks } from "./photo-links.ts";
import { deletePhotoForRequest, keepPhoto, requestPhotoRemoval } from "./photo-removals-service.ts";
import { listPhotos, type Photo } from "./photos-repository.ts";
import { addPhoto, deletePhotoFromPage, MAX_PHOTO_BYTES, requirePhoto } from "./photos-service.ts";
import { photoFileName } from "./photo-name.ts";
import { photoMessages, photoPage } from "./views/photo-page.ts";
import { PHOTOS_MESSAGES, PHOTOS_PER_PAGE, photosPage } from "./views/photos-page.ts";

const reasonSchema = z.object({ reason: z.string().trim().max(500).default("") });
const noteSchema = z.object({ note: z.string().trim().max(500).default("") });
// The form's own fields add a little to the photo.
const FORM_ROOM = 64 * 1024;
const tooBig = () => new HttpError(413, "too_big", "That photo is too big to add (10 MB at most).");

const pageParam = (url: URL) => { const n = Number(url.searchParams.get("page") ?? "1"); return Number.isInteger(n) && n >= 1 ? n : 1; };

export function registerPhotoRoutes(router: Router): void {
	router.get("/photos", "watcher", async ({ url, frame, deps }) => {
		const all = await listPhotos(deps.db, deps.team.id);
		const pages = Math.max(1, Math.ceil(all.length / PHOTOS_PER_PAGE));
		const page = Math.min(pages, pageParam(url));
		const photos = all.slice((page - 1) * PHOTOS_PER_PAGE, page * PHOTOS_PER_PAGE);
		const message = doneMessage(PHOTOS_MESSAGES, url);
		return htmlResponse(photosPage({ frame, photos, urls: await photoLinks(deps, photos, "thumb"), page, pages, message }));
	});

	router.get("/photos/:id", "watcher", async ({ url, params, frame, member, deps }) => {
		const id = idParam(params.id, "Photo");
		const all = await listPhotos(deps.db, deps.team.id);
		const at = all.findIndex((p) => p.id === id);
		const photo = all[at];
		if (!photo) throw notFound("Photo");
		const addedBy = member.role === "manager" ? await getActiveMember(deps.db, deps.team.id, photo.uploadedBy) : null;
		// The neighbours' pictures too, and everyone's thumbnail, for the swipe between photos on a phone (public/photo-swipe.js).
		const newer = all[at - 1], older = all[at + 1];
		const three = [newer, photo, older].filter((x): x is Photo => Boolean(x));
		const links = await photoLinks(deps, three, "large"), thumbs = await photoLinks(deps, three, "thumb");
		const of = (map: Map<number, string> | null, p?: Photo) => (p ? map?.get(p.id) ?? null : null);
		return htmlResponse(photoPage({
			frame, photo, url: links?.get(photo.id) ?? null, newer: newer?.id ?? null, older: older?.id ?? null,
			newerUrl: of(links, newer), olderUrl: of(links, older), thumbUrl: of(thumbs, photo), newerThumb: of(thumbs, newer), olderThumb: of(thumbs, older),
			page: Math.floor(at / PHOTOS_PER_PAGE) + 1, addedBy, message: doneMessage(photoMessages(deps.team), url),
		}));
	});

	// The photo as it was stored (already made smaller on the phone, with no location in it), named for the day it was taken.
	router.get("/photos/:id/download", "watcher", async ({ params, member, deps }) => {
		const photo = await requirePhoto(deps.db, deps.team.id, idParam(params.id, "Photo"));
		const bytes = await deps.images.bytes(photo.imageId);
		if (!bytes) throw notFound("Photo");
		const name = photoFileName(deps.team, photo);
		await logMediaDownloads(deps.db, { teamId: deps.team.id, memberId: member.id, nowIso: deps.now().toISOString(), items: [{ kind: "photo", itemId: photo.id, name }] });
		return fileResponse(bytes, "image/jpeg", name);
	});

	// The phone sends each photo on its own (public/photos.js): the JPEG it made, and when the photo was taken. Anyone on
	// the team can add them (families too).
	router.post("/api/photos", "watcher", async ({ req, member, deps }) => {
		if (Number(req.headers.get("Content-Length") ?? 0) > MAX_PHOTO_BYTES + FORM_ROOM) throw tooBig();
		const form = await req.formData().catch((err: unknown) => { throw badRequest("Please send the photo from the Photos page.", err); });
		const file = form.get("photo");
		if (!(file instanceof File)) throw badRequest("Choose a photo to add.");
		if (file.size > MAX_PHOTO_BYTES) throw tooBig();
		const takenAt = form.get("takenAt");
		const id = await addPhoto(deps, member, new Uint8Array(await file.arrayBuffer()), typeof takenAt === "string" ? takenAt : "");
		return jsonOk({ id }, 201);
	});

	// Whoever added it, or a team manager (deletePhotoFromPage checks which).
	router.post("/photos/:id/delete", "watcher", async ({ params, member, deps }) => {
		await deletePhotoFromPage(deps, member, idParam(params.id, "Photo"));
		return redirect("/photos?done=deleted");
	}, { confirm: true });

	router.post("/photos/:id/removal-requests", "watcher", async ({ req, params, member, deps }) => {
		const { reason } = await parseForm(req, reasonSchema);
		const id = idParam(params.id, "Photo");
		await requestPhotoRemoval(deps, member, id, reason);
		return redirect(`/photos/${id}?done=removal`);
	}, { closedTeams: true });

	router.post("/photo-removal-requests/:id/delete-photo", "manager", async ({ params, member, deps }) => {
		await deletePhotoForRequest(deps, member, idParam(params.id, "Photo removal request"));
		return redirect("/manage?done=photodeleted");
	}, { confirm: true });

	router.post("/photo-removal-requests/:id/keep", "manager", async ({ req, params, member, deps }) => {
		const { note } = await parseForm(req, noteSchema);
		await keepPhoto(deps, member, idParam(params.id, "Photo removal request"), note);
		return redirect("/manage?done=photokept");
	}, { closedTeams: true });
}
