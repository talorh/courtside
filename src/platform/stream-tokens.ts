import { importJWK, SignJWT } from "jose";

export interface TokenSigner {
	/** Signed Stream token for a video uid. */
	sign(uid: string, options?: { ttlSeconds?: number; downloadable?: boolean }): Promise<string>;
}

const DEFAULT_TTL_SECONDS = 6 * 3600;
/** A plain (watch-only, default lifetime) token is reused this long, so it always has 5 hours or more left. */
const REUSE_SECONDS = 3600;

/** Plain tokens by video uid. Signing costs about half a millisecond of CPU each, and Watch games needs one per game. */
export type TokenCache = Map<string, { token: string; until: number }>;
export const newTokenCache = (): TokenCache => new Map();

export function createTokenSigner(config: { keyId: string; jwkBase64: string; now: () => Date; cache?: TokenCache }): TokenSigner {
	let key: ReturnType<typeof importJWK> | null = null;
	const signingKey = () => (key ??= importJWK(JSON.parse(atob(config.jwkBase64)), "RS256"));
	const cache = config.cache ?? newTokenCache();
	return {
		async sign(uid, options = {}) {
			const nowSeconds = Math.floor(config.now().getTime() / 1000);
			const plain = !options.downloadable && options.ttlSeconds === undefined;
			const kept = plain ? cache.get(uid) : undefined;
			if (kept && kept.until > nowSeconds) return kept.token;
			const token = await new SignJWT({ sub: uid, kid: config.keyId, ...(options.downloadable ? { downloadable: true } : {}) })
				.setProtectedHeader({ alg: "RS256", kid: config.keyId })
				.setNotBefore(nowSeconds - 60)
				.setExpirationTime(nowSeconds + (options.ttlSeconds ?? DEFAULT_TTL_SECONDS))
				.sign(await signingKey());
			if (plain) {
				for (const [k, v] of cache) if (v.until <= nowSeconds) cache.delete(k);
				cache.set(uid, { token, until: nowSeconds + REUSE_SECONDS });
			}
			return token;
		},
	};
}

export function playerUrl(customerCode: string, token: string, poster?: string): string {
	const base = `https://customer-${customerCode}.cloudflarestream.com/${token}/iframe`;
	return poster ? `${base}?poster=${encodeURIComponent(poster)}` : base;
}

/** WebRTC (WHEP) playback of a live input streamed from a browser. Needs the signed token (the bare uid gets 401). */
export function whepUrl(customerCode: string, token: string): string {
	return `https://customer-${customerCode}.cloudflarestream.com/${token}/webRTC/play`;
}

/** A still frame `seconds` into the video. Works with signed tokens. */
export function thumbnailUrl(customerCode: string, token: string, seconds: number): string {
	return `https://customer-${customerCode}.cloudflarestream.com/${token}/thumbnails/thumbnail.jpg?time=${Math.max(0, Math.round(seconds))}s&height=360`;
}

/** A frame about a quarter of the way in: mid-game action rather than the warm-up or a black first frame. */
export const gameThumbSeconds = (durationSeconds: number | null) => (durationSeconds && durationSeconds > 0 ? durationSeconds * 0.25 : 600);

export function hdDownloadUrl(customerCode: string, token: string, filename: string): string {
	return `https://customer-${customerCode}.cloudflarestream.com/${token}/downloads/default.mp4?filename=${encodeURIComponent(filename)}`;
}
