// Which device a request came from, as a person reads it ("iPhone, Safari"), from the browser's User-Agent (nothing
// finer: it's a label): on a signed-in session (sign-in-service.ts), and on each line of the admin Log.

export function deviceLabel(userAgent: string | null): string {
	const ua = userAgent ?? "";
	const phone = /iPhone/.test(ua) ? "iPhone" : /iPad|Macintosh.*Mobile/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Macintosh/.test(ua) ? "Mac"
		: /Windows/.test(ua) ? "Windows" : /CrOS/.test(ua) ? "Chromebook" : /Linux/.test(ua) ? "Linux" : "Device";
	const browser = /Firefox\//.test(ua) ? "Firefox" : /Edg\//.test(ua) ? "Edge" : /SamsungBrowser/.test(ua) ? "Samsung Internet" : /Chrome\/|CriOS\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "browser";
	return `${phone}, ${browser}`;
}

/** The request's device for the Log: "" for anything that isn't a browser (Stream's webhooks, a script). */
export const requestDevice = (req: Request): string => {
	const ua = req.headers.get("User-Agent");
	return ua?.startsWith("Mozilla/") ? deviceLabel(ua) : "";
};

/** The kind of device alone ("iPhone" of "iPhone, Safari"), for the Log's Device filter; "" for none. */
export const deviceKind = (label: string): string => label.split(", ")[0] ?? "";
