// Each kind of line in the admin Log: its name (the Event column and its filter), how it reads at a glance, and which of
// the Log's groups it's in (the chips): admins', a team's people, players and games, videos, photos, the sign-in page's,
// or problems (anything that failed).
import type { SignInEvent } from "../../auth/sign-in-codes-repository.ts";
import type { LogActivityKind } from "./activity-admin-repository.ts";
import type { AdminAction } from "./admin-log-repository.ts";
import type { ProblemKind } from "./problems-repository.ts";

export type LogKind = "admins" | "teams" | "videos" | "photos" | "signins" | "problems";
/** Each group's name: the Event filter's groups, and the Kind column for Excel. */
export const KIND_NAMES: Record<LogKind, string> = {
	admins: "Admins", teams: "Teams: people, players and games", videos: "Videos", photos: "Photos", signins: "Sign-in page", problems: "Problems",
};
export type LogEvent = AdminAction | SignInEvent | LogActivityKind | ProblemKind;
/** A refusal, a deletion, a failure or a removal request warns; signing in and a video ready are good news. */
export type Tone = "plain" | "good" | "warn";

const each = <K extends string>(kind: LogKind, events: Record<K, [string, Tone]>) =>
	Object.fromEntries(Object.entries<[string, Tone]>(events).map(([k, [name, tone]]) => [k, { name, tone, kind }])) as Record<K, { name: string; tone: Tone; kind: LogKind }>;

export const EVENTS: Record<LogEvent, { name: string; tone: Tone; kind: LogKind }> = {
	...each("admins", {
		team_onboarded: ["Team onboarded", "plain"], team_edited: ["Team edited", "plain"], team_closed: ["Season ended", "plain"],
		team_reopened: ["Team reopened", "plain"], delete_scheduled: ["Delete set", "warn"], delete_cancelled: ["Delete cancelled", "plain"],
		team_deleted: ["Team deleted", "warn"], team_opened: ["Team first opened", "plain"], view_as: ["Viewed as", "plain"],
		support_done: ["Support done", "plain"], support_replied: ["Support answered", "plain"], support_assigned: ["Support owner", "plain"],
		support_status: ["Support status", "plain"], test_email: ["Test email", "plain"], admin_added: ["Admin added", "plain"],
		admin_removed: ["Admin removed", "warn"],
	}),
	...each("teams", {
		member_added: ["Person added", "plain"], member_changed: ["Person changed", "plain"], member_removed: ["Person removed", "plain"],
		member_let_in: ["Person let in", "plain"], player_added: ["Player added", "plain"], player_changed: ["Player changed", "plain"],
		player_removed: ["Player removed", "plain"], game_added: ["Game added", "plain"], game_changed: ["Game changed", "plain"],
		game_deleted: ["Game deleted", "warn"], game_lines_changed: ["Game lines changed", "plain"],
	}),
	...each("videos", {
		upload_started: ["Upload started", "plain"], upload_finished: ["Upload finished", "plain"], video_ready: ["Ready to watch", "good"],
		hd_ready: ["HD download ready", "plain"], clip_made: ["Clip made", "plain"],
		removal_requested: ["Video removal asked", "warn"], clip_removal_requested: ["Clip removal asked", "warn"],
		video_deleted: ["Video deleted", "warn"], video_moved: ["Video moved", "plain"],
		live_app_chosen: ["External app chosen", "plain"], live_app_camera: ["Back to the camera", "plain"], live_app_stopped: ["App game ended", "plain"],
		live_started: ["Went live", "plain"], live_ended: ["Game ended", "plain"], live_test: ["Stream thrown away", "warn"], live_saved: ["Stream saved", "plain"],
		live_continued: ["Stream carried on", "plain"], video_joined: ["Video joined", "plain"], join_failed: ["Join failed", "warn"], first_part_kept: ["First part kept", "warn"],
	}),
	...each("photos", {
		photo_added: ["Photos added", "plain"], photo_deleted: ["Photos deleted", "warn"], photo_kept: ["Photo kept", "plain"],
		photo_removal_requested: ["Photo removal asked", "warn"],
	}),
	...each("problems", {
		server_error: ["Request failed", "warn"], job_failed: ["Job failed", "warn"], email_failed: ["Email not sent", "warn"],
		golive_problem: ["Go live problem", "warn"], upload_problem: ["Upload problem", "warn"], photo_problem: ["Photos problem", "warn"],
		stream_problem: ["Stream problem", "warn"], ai_failed: ["AI didn't answer", "warn"], site_problem: ["Site problem", "warn"],
		video_failed: ["Couldn't be processed", "warn"],
	}),
	...each("signins", {
		code_sent: ["Code sent", "plain"], signed_in: ["Signed in", "good"], wrong: ["Wrong code", "warn"], unknown_email: ["Not on a team", "warn"],
		limited: ["Over a limit", "warn"], robot: ["Robot check said no", "warn"], desktop_view: ["Desktop view", "plain"], mobile_view: ["Mobile view", "plain"],
	}),
};

/** The device-view lines: one each time a device is first seen or changes view, so the noisiest; they can be hidden. */
export const DEVICE_VIEWS: readonly LogEvent[] = ["desktop_view", "mobile_view"];
