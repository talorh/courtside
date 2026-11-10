// Which addresses are files in public/ (served by the ASSETS binding once the Worker has checked the sign-in), and
// which of them the sign-in page itself needs, so they're open to anyone (everything
// else needs a sign-in, files included).

/** The sign-in page's and the launch screen's own files: the stylesheet, the scripts every page has, the logo and icons
 * (/club.css and the manifest are made by app/club-files.ts, before this). */
const OPEN_FILES = new Set([
	"/app.css", "/theme.js", "/signin.js", "/webapp.js", "/pull-refresh.js", "/signout.js", "/confirm.js", "/landing.js",
	"/logo.png", "/favicon.png", "/favicon.ico", "/icon-192.png", "/icon-512.png", "/icon-maskable-512.png",
	// iPhones ask for -precomposed first (a link preview, Add to Home Screen): the same picture.
	"/apple-touch-icon.png", "/apple-touch-icon-precomposed.png", "/robots.txt",
]);

export const isOpenFile = (path: string) => OPEN_FILES.has(path) || path.startsWith("/fonts/");

/** A file in public/, by its extension (the pages that are files, the sample spreadsheet and the roster's Excel, aren't these). */
export const isStaticFile = (path: string) => /\.(js|css|png|ico|txt|svg|jpg|jpeg|webp|woff2|webmanifest)$/.test(path);
