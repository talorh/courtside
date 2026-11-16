import { describe, expect, it } from "vitest";
import { basisWords } from "../../../src/features/admin/views/costs-team-page.ts";

const game = { minutes: 42, clipMinutes: 0.5, watched: 259, gb: 3.25 };

describe("a team's Costs page: what each game left is estimated from", () => {
	it("says the team's own figures, the other teams' average, or the baseline, for its video and its watching", () => {
		expect(basisWords({ ...game, from: { length: "own", watched: "own" } })).toBe("Each game left: 42 minutes of video (its own so far), 3 clips, 259 minutes watched (its own so far) and a 3.3 GB original.");
		expect(basisWords({ ...game, from: { length: "teams", watched: "teams" } })).toBe("Each game left: 42 minutes of video (the other teams' average so far), 3 clips, 259 minutes watched (the other teams' average so far) and a 3.3 GB original.");
		expect(basisWords({ ...game, minutes: 60, watched: 1080, from: { length: "baseline", watched: "baseline" } })).toBe("Each game left: 60 minutes of video (the baseline), 3 clips, 1,080 minutes watched (the baseline: 9 families each watching it twice) and a 3.3 GB original.");
	});
});
