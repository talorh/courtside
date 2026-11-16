// Deleting a closed team once its delete_after has passed. The 5-minute job takes a
// slice a run, after every team's own steps, so a big team's deletion never holds up a game night: media first (photos'
// images, Stream copies, R2 originals), then the rows, child-first, in one batch, and the team becomes a tombstone until nothing of it is left. Every
// step is safe to repeat: what's done stays done, and Images or Stream saying something's gone counts as deleted. Live
// inputs are the nightly sweep's (never deleted by hand).
import { type AppDeps, type TeamDeps, withTeam } from "../app/deps.ts";
import { adminLogStatement } from "../features/admin/admin-log-repository.ts";
import { deletePhoto } from "../features/photos/photos-service.ts";
import { deleteLeftovers, type DeletedRows, deleteTeamRows, forgetOriginal, forgetStreamCopy, originalsLeft, photosLeft, streamCopiesLeft } from "../features/teams/team-purge-repository.ts";
import { isBeingDeleted } from "../features/teams/team.ts";
import { listTeamsIn } from "../features/teams/teams-repository.ts";
import { FetchBudgetSpent } from "../platform/fetch-budget.ts";

/** A run's calls to Images, Stream and R2 for deleting (Stream's also come out of the run's budget of outside calls). */
const SLICE_CALLS = 20;
// R2 lists up to 1,000 objects at a time: a full list may have more behind it.
const R2_LIST_MAX = 1000;

/** The team's next slice, up to `budget` calls; done once nothing of it is left in Images, Stream or R2. One thing that
 * can't be deleted goes in `errors` and the rest carry on, leaving what's done done; a run whose outside calls are used
 * up throws, as nothing more can be asked. */
async function deleteMedia(deps: TeamDeps, budget: number, spent: { calls: number }, errors: unknown[]): Promise<boolean> {
	const { db, team } = deps;
	const failed = errors.length;
	// Never below 0: SQLite reads a negative LIMIT as no limit at all.
	const room = () => Math.max(0, budget - spent.calls);
	// A call counts whether or not it works, so a slice is never more than `budget` of them.
	const each = async <T>(items: T[], remove: (item: T) => Promise<unknown>) => {
		for (const item of items) {
			spent.calls++;
			await remove(item).catch((err: unknown) => {
				if (err instanceof FetchBudgetSpent) throw err;
				errors.push(err);
			});
		}
	};
	await each(await photosLeft(db, team.id, room()), (photo) => deletePhoto(deps, photo, "retention"));
	await each(await streamCopiesLeft(db, team.id, room()), async (copy) => {
		await deps.stream.deleteVideo(copy.uid);
		await forgetStreamCopy(db, team.id, copy);
	});
	await each(await originalsLeft(db, team.id, room()), async (video) => {
		if (video.r2UploadId) await deps.originals.abort(video.r2Key, video.r2UploadId);
		else await deps.originals.remove(video.r2Key);
		await forgetOriginal(db, team.id, video.id);
	});
	if (spent.calls >= budget) return false;
	// Anything else in the team's folder: an upload whose row went another way.
	spent.calls++;
	const stray = await deps.originals.list(`originals/${team.id}/`);
	const now = stray.slice(0, room());
	await each(now, (object) => deps.originals.remove(object.key));
	return errors.length === failed && now.length === stray.length && stray.length < R2_LIST_MAX;
}

const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
const describe = (d: DeletedRows) => `${n(d.photos, "photo", "photos")}, ${n(d.clips, "clip", "clips")}, ${n(d.videos, "video", "videos")}, `
	+ `${n(d.games, "game", "games")} and ${n(d.people, "person's", "people's")} details deleted; the download log keeps `
	+ `${n(d.kept.videos, "video", "videos")}, ${n(d.kept.games, "game", "games")} and ${n(d.kept.people, "person's", "people's")} details`;

/** The 5-minute job's last step: a slice of each closed team whose date has passed, oldest first, until the run's
 * calls for deleting are used up. Errors are returned (the run fails loudly), and a team that fails leaves the next its
 * turn; running out of calls is no error, and ends the run's deleting. */
export async function deleteTeamsDue(deps: AppDeps): Promise<{ deleted: number; errors: unknown[] }> {
	const now = deps.now();
	const due = (await listTeamsIn(deps.db, ["closed"])).filter((t) => isBeingDeleted(t, now)).sort((a, b) => (a.deleteAfter ?? "").localeCompare(b.deleteAfter ?? ""));
	const spent = { calls: 0 };
	const errors: unknown[] = [];
	let deleted = 0;
	for (const team of due) {
		if (spent.calls >= SLICE_CALLS) break;
		const before = spent.calls;
		try {
			if (await deleteMedia(withTeam(deps, team), SLICE_CALLS, spent, errors)) {
				const nowIso = deps.now().toISOString();
				const rows = await deleteTeamRows(deps.db, team.id, nowIso);
				await adminLogStatement(deps.db, { device: "", adminEmail: "site", teamId: team.id, action: "team_deleted", detail: describe(rows), at: nowIso }).run();
				deleted++;
			}
		} catch (err) {
			if (err instanceof FetchBudgetSpent) spent.calls = SLICE_CALLS;
			else errors.push(err);
		}
		console.log(JSON.stringify({ event: "team_purge", teamId: team.id, calls: spent.calls - before, errorCount: errors.length }));
	}
	return { deleted, errors };
}

/** A deleted team's step in the 5-minute job, after its retention (which drops the download log after two years): what
 * the log no longer names goes, and once nothing's left (at once, for a team nobody downloaded from), the team's row. */
export async function removeLeftovers(deps: TeamDeps) {
	if (await deleteLeftovers(deps.db, deps.team.id)) console.log(JSON.stringify({ event: "team_row_deleted", teamId: deps.team.id }));
	return { errors: [] };
}
