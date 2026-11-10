// Saving to an iPhone or iPad's Photos through its share menu: there a download lands in Files, and in
// the Home Screen app it opens a page with no way back. The page gets the file itself and hands it to the share menu,
// whose Save Image or Save Video puts it in Photos. Used by photo-save.js and video-save.js.
import { isApple } from "./webapp.js";

/** An iPhone or iPad whose share menu takes a file like this one (elsewhere a plain download is fine). */
export const shareable = (name, type) => isApple && Boolean(navigator.canShare?.({ files: [new File([new Uint8Array([0])], name, { type })] }));

/** `url`'s body as a file, telling `progress` how far it's got (0 to 1) when its size is known. */
export async function fetchFile(url, name, type, progress = () => {}) {
	const res = await fetch(url);
	if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
	const total = Number(res.headers.get("Content-Length") ?? 0);
	const parts = [];
	let got = 0;
	for (const reader = res.body.getReader(); ;) {
		const { done, value } = await reader.read();
		if (done) break;
		parts.push(value);
		got += value.length;
		if (total) progress(got / total);
	}
	return new File(parts, name, { type });
}

/** An iPhone or iPad whose share menu takes several JPEGs at once. */
export const shareableMany = () => isApple && Boolean(navigator.canShare?.({ files: [1, 2].map((n) => new File([new Uint8Array([0])], `${n}.jpg`, { type: "image/jpeg" })) }));

/**
 * Opens the share menu with `file` (or several files): "shared", or "closed" when it was closed. A big file can take longer to get than a
 * tap allows, and the menu then refuses ("tap again"): the caller keeps the file, so the next tap opens it at once.
 */
export async function share(file) {
	try {
		await navigator.share({ files: Array.isArray(file) ? file : [file] });
		return "shared";
	} catch (err) {
		if (err.name === "AbortError") return "closed";
		if (err.name === "NotAllowedError") return "tap again";
		throw err;
	}
}
