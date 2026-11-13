# 16. Privacy and child safety

*Courtside Documentation › How it works. [Contents](README.md).*

The site holds footage of children, so privacy isn't a setting: it's how the site is built. Every page and file sits behind the sign-in, each team sees only its own, nothing is ever public, and the site makes its best efforts to meet Basketball Victoria's Child Safe Standards. Help tells families what's filmed, who sees it, how long it's kept and how to ask for something to be removed.

| Rule | How the site keeps it |
| --- | --- |
| Nothing is public | The only open pages are the sign-in and security.txt. Every page says noindex, AI crawlers are blocked at the edge, and videos, clips and photos are only ever reached through short-lived signed links. |
| Each team sees only its own | Every row carries its team, every query names it, every write is refused for another team, and a two-team test of every route proves it on each change. |
| Only the team's own people get in | Codes go only to addresses on a team's list or an admin's; the lists are checked on every request, so removal is instant. |
| Game footage only | One video a game; photos of the team's games and events; no training, no other teams, no chat, comments or stats. |
| Families can say no | Any family can ask for a video, clip or photo to be removed, or that their child isn't filmed or shown; requests go to the team manager and are logged. |
| Nothing is kept for keeps | Everything a team puts up is deleted at the end of 31 December of the year its season ends; the download log is the one record kept longer, two years. |
| No real names outside a team | Help, the documentation and tests use made-up names after NBA players; counts on Insights, never anyone's email. |
| Nothing about where a photo was taken | Photos are made smaller on the phone, which drops the location; the Worker strips any metadata left. |
| Admins see counts, not people | Insights and Costs show figures; the Log shows who changed what, sign-in attempts, which device each line came from ("iPhone, Safari", nothing finer) and what failed for whom, for a month, because that's what safety and support need. Coaches' notes are the coaches' own: View as coach leaves them out, and the notes' pages refuse. |

### What the site can't do

A downloaded video or photo can be shared on, and other parents can film or photograph on their own phones. Both are matters for the club and the families, and Help points to Basketball Victoria's standards rather than lecturing. The club's own child safety policies live in the club's handbook and website; the site isn't the club's own and doesn't speak for it.

### Security reports

Anyone who finds a security problem can write to security@saints.example, named on the site's security.txt and forwarded to the owner. Cloudflare emails the owner about abuse reports and certificate changes as well.
