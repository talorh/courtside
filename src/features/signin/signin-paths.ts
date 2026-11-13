// The sign-in's pages by address, in a module of their own so the browser tests' harness (plain Node) can use it.

/** The pages with Turnstile's widget, whose script and frame the CSP allows there only (app/handle-request.ts). */
export const isSignInPage = (path: string) => path === "/signin" || path === "/signin/code" || path === "/signin/access";
