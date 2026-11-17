// Signed links (R2's presigned GETs and PUTs, Stream's) carry their key in the query: an error that quotes one (ffmpeg
// does) keeps only the address, for the logs, the admin Log and alerts.
export const withoutLinkQueries = (text: string) => text.replace(/(https?:\/\/[^\s'"?]+)\?[^\s'"]*/g, "$1?…");
