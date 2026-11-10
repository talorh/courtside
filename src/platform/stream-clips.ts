// Stream's clip API isn't on the Worker binding, so it goes through the REST API with a Stream-only token.
import { siteLabel } from "./site-label.ts";

export interface ClipRequest {
	sourceUid: string;
	startSeconds: number;
	endSeconds: number;
	name: string;
	/** The team the clip is for, in its metadata. */
	teamId: string;
	/** ISO date. Stream needs it at least 30 days away; leave it out otherwise. */
	scheduledDeletion?: string;
}

export interface Clipper {
	/** Creates the clip as a new Stream video (signed URLs only) and returns its uid. */
	clip(request: ClipRequest): Promise<string>;
}

interface StreamApiResponse {
	success: boolean;
	result?: { uid?: string };
	errors?: Array<{ message?: string }>;
}

export function createClipper(config: { accountId: string; apiToken: string; fetch?: typeof fetch; site?: string | null }): Clipper {
	const doFetch = config.fetch ?? fetch;
	return {
		async clip(r) {
			const meta = { name: r.name, teamId: r.teamId, ...siteLabel(config.site) };
			const res = await doFetch(`https://api.cloudflare.com/client/v4/accounts/${config.accountId}/stream/clip`, {
				method: "POST",
				headers: { Authorization: `Bearer ${config.apiToken}`, "Content-Type": "application/json" },
				body: JSON.stringify({
					clippedFromVideoUID: r.sourceUid,
					startTimeSeconds: r.startSeconds,
					endTimeSeconds: r.endSeconds,
					requireSignedURLs: true,
					meta,
					...(r.scheduledDeletion ? { scheduledDeletion: r.scheduledDeletion } : {}),
				}),
				signal: AbortSignal.timeout(15_000),
			});
			const body = (await res.json().catch(() => ({ success: false }))) as StreamApiResponse;
			const uid = body.result?.uid;
			if (!res.ok || !body.success || !uid) {
				throw new Error(`Stream clip failed (${res.status}): ${body.errors?.[0]?.message ?? "no details"}`);
			}
			// Stream's clip call keeps only the name of the metadata sent with it, so the team (and staging's label) go on the
			// new video with a second call. Non-fatal: the clip exists and its row names it; unlabelled, only staging's would be
			// at risk from the live site's sweep.
			const labelled = await doFetch(`https://api.cloudflare.com/client/v4/accounts/${config.accountId}/stream/${uid}`, {
				method: "POST", headers: { Authorization: `Bearer ${config.apiToken}`, "Content-Type": "application/json" },
				body: JSON.stringify({ meta }), signal: AbortSignal.timeout(15_000),
			}).then((reply) => reply.ok, () => false);
			if (!labelled) console.warn(JSON.stringify({ event: "clip_label_failed", teamId: r.teamId, uid }));
			return uid;
		},
	};
}
