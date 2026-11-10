import { raw } from "../shared/html.ts";

// Simple inline icons (no icon font, nothing extra to load). They take the text colour of the button they sit in.
const svg = (body: string) => raw(`<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`);

export const ICON_UPLOAD = svg('<path d="M12 3l6 6h-4v6h-4V9H6l6-6zM4 19h16v2H4z" fill="currentColor"/>');
export const ICON_LIVE = svg('<circle cx="12" cy="12" r="5" fill="currentColor"/><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/>');
export const ICON_PLAY = svg('<path d="M8 5v14l11-7z" fill="currentColor"/>');
export const ICON_CALENDAR = svg('<rect x="3.5" y="5" width="17" height="15.5" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3.5 10h17M8 3v4M16 3v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>');
export const ICON_PEOPLE = svg('<circle cx="9" cy="8" r="3.5" fill="currentColor"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6z" fill="currentColor"/><circle cx="17" cy="9" r="2.8" fill="currentColor" opacity=".7"/><path d="M16.5 13.6c2.9.2 5 2.3 5 5.4h-4.3c0-2-.3-3.8-.7-5.4z" fill="currentColor" opacity=".7"/>');
export const ICON_HELP = svg('<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.6v.6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="17.3" r="1.2" fill="currentColor"/>');
export const ICON_BELL = svg('<path d="M12 3a6 6 0 0 0-6 6v4l-2 3h16l-2-3V9a6 6 0 0 0-6-6z" fill="currentColor"/><path d="M9.5 18.5a2.5 2.5 0 0 0 5 0" fill="none" stroke="currentColor" stroke-width="2"/>');
export const ICON_ROSTER = svg('<rect x="4" y="3.5" width="16" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 9h8M8 13h8M8 17h5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>');
export const ICON_PHOTO = svg('<rect x="3" y="4.5" width="18" height="15" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="8.5" cy="9.5" r="1.8" fill="currentColor"/><path d="M4 18.5l5.5-5.5 3.5 3.5 2.5-2.5 4.5 4.5z" fill="currentColor"/>');
export const ICON_PLUS = svg('<path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>');
export const ICON_DOOR = svg('<path d="M14 3.5H6.5A1.5 1.5 0 0 0 5 5v14a1.5 1.5 0 0 0 1.5 1.5H14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="9" cy="12" r="1.2" fill="currentColor"/><path d="M16 8l4 4-4 4M20 12h-7.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>');

// The admin area's navigation: line icons, two pixels, round ends.
const line = (d: string) => svg(`<path d="${d}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`);
export const ICON_CHART = line("M4 20V11M10 20V5M16 20v-6M21 20H3");
export const ICON_INBOX = line("M3 13l2.6-7.2A2 2 0 0 1 7.5 4.5h9a2 2 0 0 1 1.9 1.3L21 13v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 13h5l1.5 2.5h5L16 13h5");
export const ICON_SERVER = line("M5 4h14a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM5 13h14a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2zM7 7.5h.01M7 16.5h.01");
export const ICON_SHIELD = line("M12 3l8 3v5.5c0 4.6-3.3 8.5-8 9.5-4.7-1-8-4.9-8-9.5V6z");
export const ICON_LIST = line("M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01");
export const ICON_CLOCK = line("M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3.5 2");
export const ICON_BOOK = line("M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5zM20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5zM6.5 8h2M6.5 11h2M15.5 8h2M15.5 11h2");
export const ICON_CHECK = line("M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8 12.5l2.7 2.7L16.5 9.5");
// Switch team, under the team's name for someone in two or more teams.
export const ICON_SWAP = line("M17 4l3 3-3 3M20 7H7M7 14l-3 3 3 3M4 17h13");
export const ICON_COINS = line("M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM14.8 8.6c-.5-.8-1.5-1.3-2.8-1.3-1.7 0-2.8.9-2.8 2.1 0 2.9 5.8 1.6 5.8 4.6 0 1.3-1.2 2.2-3 2.2-1.4 0-2.5-.6-3-1.5M12 5.5v1.8M12 16.2V18");
export const ICON_LOCK = line("M5 11h14v10H5zM8 11V7.5a4 4 0 0 1 8 0V11");
