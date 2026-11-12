import { CLUB } from "../../../club.ts";
import { html, type SafeHtml } from "../../../shared/html.ts";
import { selectOptions } from "../../../ui/components.ts";
import { COMPETITIONS, type GameInput } from "../games-repository.ts";
import { PHASE_LABELS, SEASON_PHASES } from "../season-phase.ts";

const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));

/** Splits 'HH:MM' (24h) into 12-hour select values. Minutes off the 5-minute grid are kept as an extra option. */
function clockParts(time: string) {
	const [h = 18, m = 40] = time.split(":").map(Number);
	return { hour: String(h % 12 === 0 ? 12 : h % 12), minute: String(m).padStart(2, "0"), period: h < 12 ? "am" : "pm" };
}

const options = (values: string[], selected: string) =>
	selectOptions((values.includes(selected) ? values : [...values, selected].sort()).map((v) => ({ value: v === "00" ? "0" : String(Number(v)), label: v })), String(Number(selected)));

const PHASES = [{ value: "", label: "Not set" }, ...SEASON_PHASES.map((p) => ({ value: p, label: PHASE_LABELS[p] }))];
const VIDEO = [{ value: "live", label: "Live stream" }, { value: "record", label: "Record and upload after" }, { value: "none", label: "No video" }];

/** Game form fields for fixture add and edit. Tip-off is always 12-hour (local time). Video: Live stream unless the
 * game is set to be recorded, or to No video. A new game starts at `start`: the coming Friday, at the team's usual
 * tip-off (teams/team-code.ts usualTipOff). */
export function gameFields(values: Partial<GameInput> & { liveStream?: boolean; noVideo?: boolean }, start: { date: string; time: string }): SafeHtml {
	const [date = start.date, time = start.time] = values.startsAt ? values.startsAt.split("T") : [];
	const clock = clockParts(time);
	const competitions = COMPETITIONS.map((c) => ({ value: c, label: c }));
	return html`<div class="formgrid">
<label>Date<input name="date" type="date" required value="${date}"></label>
<fieldset class="clock"><legend>Tip-off (local time)</legend>
<select name="hour" aria-label="Hour">${options(HOURS, clock.hour)}</select><span aria-hidden="true">:</span>
<select name="minute" aria-label="Minutes">${options(MINUTES, clock.minute)}</select>
<select name="period" aria-label="am or pm">${selectOptions([{ value: "am", label: "am" }, { value: "pm", label: "pm" }], clock.period)}</select></fieldset>
<label>Competition<select name="competition">${selectOptions(competitions, values.competition ?? CLUB.league)}</select></label>
<label>Phase (${CLUB.league})<select name="phase">${selectOptions(PHASES, values.phase ?? "")}</select></label>
<label>Round / event<input name="roundLabel" type="text" maxlength="40" value="${values.roundLabel ?? ""}" placeholder="10, or Semi Final"></label>
<label>Opponent<input name="opponent" type="text" maxlength="80" value="${values.opponent === "TBC" ? "" : (values.opponent ?? "")}" placeholder="Leave blank for TBC"></label>
<label>Venue and court<input name="venue" type="text" maxlength="120" value="${values.venue ?? ""}"></label>
<label>Video<select name="video">${selectOptions(VIDEO, values.noVideo ? "none" : values.liveStream === false ? "record" : "live")}</select></label>
</div>`;
}
