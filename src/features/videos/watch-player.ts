import type { TeamDeps } from "../../app/deps.ts";
import { gameThumbSeconds, playerUrl, thumbnailUrl } from "../../platform/stream-tokens.ts";
import { type Clip, listClipsForVideo } from "../clips/clips-repository.ts";
import type { ClipCard } from "../clips/views/clips-panel.ts";
import { listPlayers, type Player, playersByClip } from "../players/players-repository.ts";
import type { Video } from "./videos-repository.ts";

export interface PlayerView {
	playerSrc: string | null;
	clips: ClipCard[];
	currentClip: Clip | null;
	/** The team's players, for saying who's in a clip. */
	players: Player[];
}

/**
 * Signed player URL for the game (or for one of its ready clips when `?clip=` names one) plus the clip list with
 * thumbnails. A clip still being made shows the game frame where it starts.
 */
export async function loadPlayer(deps: TeamDeps, video: Video, streamUid: string, clipParam: string | null): Promise<PlayerView> {
	const { config, tokens } = deps;
	const code = config.streamCustomerCode;
	const gameToken = await tokens.sign(streamUid);
	const clips = await listClipsForVideo(deps.db, deps.team.id, video.id);
	const signed = new Map<number, string>();
	for (const c of clips) if (c.status === "ready" && c.streamUid) signed.set(c.id, await tokens.sign(c.streamUid));
	const who = await playersByClip(deps.db, deps.team.id, clips.map((c) => c.id));
	const cards = clips.map((clip) => {
		const token = signed.get(clip.id);
		const players = who.get(clip.id) ?? [];
		if (token) return { clip, players, thumbUrl: thumbnailUrl(code, token, 1) };
		return { clip, players, thumbUrl: clip.status === "failed" ? null : thumbnailUrl(code, gameToken, clip.startSeconds + 1) };
	});
	const currentClip = clips.find((c) => String(c.id) === clipParam && signed.has(c.id)) ?? null;
	const clipToken = currentClip ? signed.get(currentClip.id) : undefined;
	const playerSrc = clipToken
		? playerUrl(code, clipToken, thumbnailUrl(code, clipToken, 1))
		: playerUrl(code, gameToken, thumbnailUrl(code, gameToken, gameThumbSeconds(video.durationSeconds)));
	return { playerSrc, clips: cards, currentClip, players: await listPlayers(deps.db, deps.team.id) };
}
