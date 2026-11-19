# To do

Outstanding tasks only (done items are deleted). Ideas for later are in `docs/spec.md` ("Later, not now").

## Costs

- [ ] A deleted team's minutes watched: `costs-viewing.ts` re-reads last month and this month every hour and maps each
      video to its team with `streamUidTeams`, which can't see a purged team's videos, so its watching that month moves
      into the shared figure (`''`) and onto the teams still running. Keep a video-to-team record that outlives the purge,
      or stop re-reading a month once a team in it is deleted. Low in dollars: it matters at the season's end.
- [ ] The Stream storage tile (`costs-widgets.ts`) counts only the shown season's teams' minutes, "at any time in the
      month", and is labelled actual: use Stream's own `usedMinutes`, as Platform does.
