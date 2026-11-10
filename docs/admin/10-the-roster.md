# 10. The roster

*Courtside Documentation › How it works. [Contents](README.md).*

The Roster says which family does which game-day duty. Every member sees it; the team manager runs it from the same page. It's built from the fixture: each week (Monday to Sunday) of the team's season with a game in it has duties, and the roster follows the fixture as games are added, moved or deleted.

### Duties

| Duty | Each game | The team manager can |
| --- | --- | --- |
| Scoring | Always two scorers | Nothing to set: every team has it |
| The extra duty | One family (Lollies, unless the team manager names it otherwise) | Switch it off, rename it, or give it to one family every week |
| Video | One family, filming the game; none for a No video game | Switch it off, or give it to one family every week |

- **A family on a duty every week** (a parent who'd rather film every game than score) gets no other duty, and isn't counted when the rest are shared out.
- **Saving the duties** changes them from this week on; earlier weeks keep what was done, and it still counts. The weeks from next week on are shared out again, and this week stays as families already know it.
- **A week's own settings:** **No video this week** marks that week's games No video (a tournament that doesn't allow filming). **Scorers only this week** drops the extra duty as well and marks its games No video, so the week has two scorers a game and nothing else. A weekend whose games are all a tournament's starts as scorers only until **All duties this week**.

### How a week is filled

> **How a roster week is filled.** The roster takes the fixture's weeks, gives each game its slots, gives a duty one family does every week to that family, then shares the rest among the families free that week with the fewest duties, in the cheapest way for evenness, and afterwards swaps duties between families wherever that evens them out. Weeks are filled in date order, a game at a time. Families on the roster now share the duties; duties set by hand are kept and counted.

- **Slots:** each game in the week, in playing order, wants video first (it takes the most organising), then two scorers, then the extra duty. A slot is a week, a duty, a position and a game, so a tournament weekend's games each get their own scorers.
- **Who's free:** the families with no duty yet that week, apart from every-week families, sorted by fewest duties so far, then the longest since their last duty, then the order they were added.
- **The cheapest share:** among the families tied on fewest duties, up to five are tried at once in every order (at most 120 ways a game), each way costing each family's count of that duty after this week, squared, so one family two ahead costs more than two families one ahead, plus half a point for the same duty as the week before or after. The cheapest wins; a tie keeps the first.
- **More slots than families** (a tournament weekend): a family takes a second game. Never the same game twice, and not a game straight before or after its own while another family can take it; then the fewest duties, the fewest of that duty, the one whose own game is furthest away, and the longest since its last duty.
- **Evening out:** going week by week can't see ahead, so afterwards two families swap duties whenever that evens them out, in the same week or in two weeks where each is free in the other's. Totals stay as they were, and only the new slots move.
- **The result:** every family's total, and each duty, within one of each other. It's tested for 4 to 16 families and seasons up to 30 weeks, and a whole season takes a few milliseconds.

### What changes it

> **What changes the roster.** Six things change the roster: opening it fills new games' weeks and clears ones with no games, Generate roster shares out next week on again, Change on a week fills that week around the families picked, saving the duties shares out next week on again, a family's time off counts as done, and Scorers only this week leaves a week with two scorers a game. Past weeks keep what was done, and it still counts. A closed season's roster stays exactly as it was.

- **Opening the Roster** brings it up to date once Generate roster has been tapped, while the season's on: new games' weeks are filled, a week or a game that's gone loses its slots, and from this week on so does a slot the week no longer wants (a duty switched off, video in a No video week).
- **Generate roster** needs families and an upcoming game. It clears next week on, keeping duties set by hand, and shares the rest out around them. A duty left with a family that's since been taken off goes to one on the roster.
- **Change** on a week gives each duty a family picked by hand, or leaves it as **Roster's pick**, showing the family the roster chose. A family picked comes off any other duty that week, a family does one duty a game at most, and whatever's left is filled fairly. The week then says "Set by hand" for the team manager.
- **Time off the roster** (a child away or injured): taking a family off starts its time away, and adding the same surname back ends it. Each week away, and each week before a family added partway through the season, counts as its fair share of that week's duties (the week's duties over the families on the roster then), so a family back takes turns like everyone else instead of duty after duty to catch up.
- **A closed season's** roster stays exactly as it was.

### What families see

- **Your duty:** a member whose last name matches a family sees that family's next duty.
- **The weeks:** each week's games and who's on each duty. The next six weeks show; Earlier weeks and Later weeks fold the rest, as a season runs to 40 weeks or more.
- **Roster fairness:** a plain verdict ("Fair", or "Not even yet" when families are more than one apart, which tells the team manager to Generate roster), each family's count of each duty with its total and its time off, and a week-by-week chart of who was on.
- **The WhatsApp message** (team managers, one a game): the opponent, the venue and when, arrive 30 minutes early, the uniform (Green or White, always packing the other) and who's on each duty, with Copy and Open WhatsApp. The team manager can change it in the box first; both send it as it stands (public/match-message.js), and it isn't saved: Update message makes it again from the roster.
- **Export to Excel** (everyone but Watch only): the season as an .xlsx, a row a week and a line a game.

| Table | Holds |
| --- | --- |
| `roster_families` | Each family by surname: when it was added and removed, and its periods away |
| `roster_slots` | Who does each duty: the week, the duty, its position, the game, the family, and whether it was set by hand |
| `roster_duties` | The team's duties: the extra duty on or off and its name, video on or off, and any every-week families |
| `roster_weeks` | The weeks set to Scorers only, or back to All duties |
