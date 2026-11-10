import { z } from "zod";
import { badRequest, notFound } from "../../app/errors.ts";
import { fileResponse, redirect } from "../../app/respond.ts";
import type { Router } from "../../app/router.ts";
import { localTimeSeconds } from "../../shared/time.ts";
import { parseForm } from "../../shared/validation.ts";
import { zipStream } from "../../shared/zip-stream.ts";
import { photoFileName, photosZipName } from "./photo-name.ts";
import { logMediaDownloads } from "../videos/downloads-repository.ts";
import { listPhotos } from "./photos-repository.ts";
import { deletePhotosFromPage } from "./photos-service.ts";
import { PHOTOS_PER_PAGE } from "./views/photos-page.ts";

/** Photos chosen on the Photos page (public/photos-pick.js): a page's worth at most. */
const pickedSchema = z.object({ id: z.array(z.coerce.number().int().positive()).min(1).max(PHOTOS_PER_PAGE) });

/** Before registerPhotoRoutes: its /photos/:id would take /photos/download. */
export function registerPhotoPickRoutes(router: Router): void {
	// As one zip, oldest added first; one deleted meanwhile is left out.
	router.get("/photos/download", "watcher", async ({ url, member, deps }) => {
		const picked = pickedSchema.safeParse({ id: url.searchParams.getAll("id") });
		if (!picked.success) throw badRequest(`Choose up to ${PHOTOS_PER_PAGE} photos to download.`);
		const wanted = new Set(picked.data.id);
		const photos = (await listPhotos(deps.db, deps.team.id)).filter((p) => wanted.has(p.id)).sort((a, b) => a.id - b.id);
		if (!photos.length) throw notFound("Photo");
		// Each photo in it is a download, logged before the zip's first byte (as a single photo's is).
		await logMediaDownloads(deps.db, {
			teamId: deps.team.id, memberId: member.id, nowIso: deps.now().toISOString(),
			items: photos.map((p) => ({ kind: "photo", itemId: p.id, name: photoFileName(deps.team, p) })),
		});
		const zip = zipStream(photos.map((photo) => ({
			name: photoFileName(deps.team, photo),
			modified: photo.takenAt,
			bytes: async () => {
				const body = await deps.images.bytes(photo.imageId);
				return body && new Uint8Array(await new Response(body).arrayBuffer());
			},
		})));
		return fileResponse(zip, "application/zip", photosZipName(deps.team, localTimeSeconds(deps.now()).slice(0, 10)));
	});

	router.post("/photos/delete", "watcher", async ({ req, member, deps }) => {
		const { id } = await parseForm(req, pickedSchema, ["id"]);
		await deletePhotosFromPage(deps, member, id);
		return redirect("/photos?done=deleted-some");
	}, { confirm: true });
}
