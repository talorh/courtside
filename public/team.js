// The page's team, as layout.ts puts it on <html>: who to ask and its name, for the messages page scripts show
// ("Sam", or "your team manager" for a team with no ask name).
const data = () => globalThis.document?.documentElement?.dataset ?? {};

/** "Sam", or "your team manager". */
export const askName = () => data().ask || "your team manager";

/** The helper on Help: "Virtual Team Manager", or named for the team's ask name ("Virtual Sam"). */
export const helperName = () => (data().ask ? `Virtual ${data().ask}` : "Virtual Team Manager");

/** "Saints B12.1" */
export const teamName = () => data().teamName || data().site || "the site";

/** askName() for HTML: a name an admin typed is text, never markup. */
export const askNameHtml = () => askName().replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
