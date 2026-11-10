// The sign-in's random values and hashes (WebCrypto, which Workers and Node both have): a session's token, a six-digit
// code, and the SHA-256 the database keeps in their place.

const encode = (text: string) => new TextEncoder().encode(text);

/** 256 random bits as base64url: a session's token, which only the browser's cookie ever holds. */
export function randomToken(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(32));
	return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

/** A six-digit code ("048213" can start with 0: every digit is drawn alike, so a guess is one in a million). */
export function sixDigitCode(): string {
	let code = "";
	while (code.length < 6) {
		// 256 isn't a multiple of 10, so a byte from the top of the range is thrown back rather than skew a digit.
		const [byte] = crypto.getRandomValues(new Uint8Array(1));
		if (byte !== undefined && byte < 250) code += String(byte % 10);
	}
	return code;
}

export async function sha256Hex(text: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", encode(text));
	return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Whether two texts match, taking the same time whatever they are (so a guess learns nothing from the clock). */
export function sameText(a: string, b: string): boolean {
	const x = encode(a), y = encode(b);
	let diff = x.length ^ y.length;
	for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
	return diff === 0;
}
