import { z } from "zod";
import { htmlResponse, redirect } from "../../app/respond.ts";
import type { Router } from "../../app/router.ts";
import { ROLES } from "../../auth/permissions.ts";
import { doneMessage, idParam, parseForm } from "../../shared/validation.ts";
import { listOpenClipRequests } from "../clips/clip-removals-repository.ts";
import { photoLinks } from "../photos/photo-links.ts";
import { listOpenPhotoRequests } from "../photos/photo-removals-repository.ts";
import { listOpenRequests } from "../removals/removals-repository.ts";
import { removalsSection } from "../removals/views/removals-section.ts";
import { listPlayers, playersByClip } from "../players/players-repository.ts";
import { listActiveMembers, MEMBER_SORTS, type MemberSort } from "./members-repository.ts";
import { logTeamChange, personOf, roleOf } from "../admin/team-log.ts";
import { registerMembersImportRoutes } from "./members-import-routes.ts";
import { addMembers, letSignIn, memberActivity, removeMember, updateMember, waitingToSignIn } from "./members-service.ts";
import { MEMBER_MESSAGES, membersPage, withSort } from "./views/members-page.ts";
import { countPhotos, packClips, packGames } from "../season/season-pack-repository.ts";
import { lastDayKept } from "../season/season-pack.ts";
import { setupSteps } from "../teams/team-setup.ts";
import { setupCounts } from "../teams/team-setup-repository.ts";

// Add a person: their email, name and role, one at a time (as Add a player).
const addSchema = z.object({ email: z.string().max(254), name: z.string().max(80).default(""), role: z.enum(ROLES) });
const updateSchema = z.object({ name: z.string().max(80).default(""), role: z.enum(ROLES) });
// The list's order (?sort=, from the Sort by chips): anything else is the usual order, by role. Save, Remove and Add a
// person post to an address that carries it, so they come back to the same order.
const sortParam = z.enum(MEMBER_SORTS).catch("role");
const sortOf = (url: URL): MemberSort => sortParam.parse(url.searchParams.get("sort"));

export function registerMembersRoutes(router: Router): void {
	registerMembersImportRoutes(router);
	// Manage team (it runs the team, not just its people). Adding, changing and
	// removing people still post to /members; the page's old address goes to the new one, for bookmarks and emails sent.
	router.get("/members", "manager", async ({ url }) => redirect(`/manage${url.search}`, 302));
	router.get("/manage", "manager", async ({ url, frame, member, deps }) => {
		const sort = sortOf(url);
		const members = await listActiveMembers(deps.db, deps.team.id, sort);
		const message = doneMessage(MEMBER_MESSAGES, url);
		const photoRequests = await listOpenPhotoRequests(deps.db, deps.team.id);
		const thumbs = photoRequests.length ? await photoLinks(deps, photoRequests.map((r) => ({ id: r.photoId, imageId: r.imageId })), "thumb") : null;
		const removals = removalsSection(await listOpenRequests(deps.db, deps.team.id), await listOpenClipRequests(deps.db, deps.team.id), { requests: photoRequests, thumbs });
		// The one looking is using the site now: their own Last seen is only written after the page is sent.
		const now = deps.now();
		const activity = memberActivity(members.map((m) => (m.id === member.id ? { ...m, lastSeenAt: now.toISOString() } : m)), now);
		const waiting = await waitingToSignIn(deps.db, members, now);
		const [players, setup, games, clips, photos] = await Promise.all([listPlayers(deps.db, deps.team.id), setupCounts(deps.db, deps.team.id),
			packGames(deps.db, deps.team.id), packClips(deps.db, deps.team.id), countPhotos(deps.db, deps.team.id)]);
		const pack = { games, clips, players, photos, tagged: await playersByClip(deps.db, deps.team.id, clips.map((c) => c.id)), keptUntil: lastDayKept(deps.team), open: url.searchParams.get("done")?.startsWith("hd") ?? false };
		// The setup checklist while the season's on (setupCard shows nothing once it's all done).
		const steps = deps.team.status === "active" ? setupSteps(setup) : [];
		return htmlResponse(membersPage({ frame, members, players, message, removals, activity, sort, waiting, steps, pack }));
	});

	router.post("/members", "manager", async ({ req, url, viewer, deps }) => {
		const form = await parseForm(req, addSchema);
		const added = await addMembers(deps.db, deps.team.id, [form]);
		await logTeamChange(deps, viewer.email, "member_added", added.map((p) => `${personOf(p)} as ${roleOf(p.role)}`).join(", "));
		return redirect(`${withSort("/manage?done=added", sortOf(url))}#people`);
	});

	router.post("/members/:id", "manager", async ({ req, url, params, viewer, deps }) => {
		const details = await parseForm(req, updateSchema);
		const before = await updateMember(deps.db, deps.team.id, idParam(params.id, "Member"), details);
		const changes = [before.name !== details.name.trim() && `name "${before.name}" to "${details.name.trim()}"`,
			before.role !== details.role && `${roleOf(before.role)} to ${roleOf(details.role)}`].filter(Boolean);
		if (changes.length) await logTeamChange(deps, viewer.email, "member_changed", `${before.email}: ${changes.join(", ")}`);
		return redirect(withSort("/manage?done=saved", sortOf(url)));
	});

	// Someone who asked for too many sign-in codes, or typed too many wrong ones, waits; this lets them in now. A closed team's people still sign in.
	router.post("/members/:id/sign-in", "manager", async ({ params, viewer, deps }) => {
		const person = await letSignIn(deps.db, deps.team.id, idParam(params.id, "Member"), deps.now());
		await logTeamChange(deps, viewer.email, "member_let_in", personOf(person));
		return redirect("/manage?done=signin");
	}, { closedTeams: true });

	router.post("/members/:id/remove", "manager", async ({ url, params, member, viewer, deps }) => {
		const removed = await removeMember(deps.db, deps.team.id, member.id, idParam(params.id, "Member"), deps.now());
		await logTeamChange(deps, viewer.email, "member_removed", `${personOf(removed)}, ${roleOf(removed.role)}`);
		return redirect(withSort("/manage?done=removed", sortOf(url)));
	}, { confirm: true });
}
