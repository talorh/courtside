export const VIDEO_STATUSES = ["uploading", "processing", "ready", "failed"] as const;
export type VideoStatus = (typeof VIDEO_STATUSES)[number];
