# 15. Help, Ask and support

*Courtside Documentation › How it works. [Contents](README.md).*

### Help

Help (`/help`, from the Help button on every page) is questions that open when tapped, with a search box that narrows them as you type. Each person sees only what they do: everyone starts with getting started, then Watch only gets watching, photos and the roster; Watch and film gets filming first; a coach gets their notes; and a team manager's Help is in two parts, each named on the page and in the contents: Running your team (their own questions, ending with removal requests and the support form), then For everyone on the team (everyone's, with child safety last). Every section reads right for its team: who to ask, its own season's date and its own duties. The pictures of the site's pages are screenshots taken on staging with test data, and the fiddly steps have mock screens.

### Ask Virtual Team Manager

Each team's helper is named for its team manager, from the team's own name to ask (Teams): Virtual Sam in B12.1, or plain Virtual Team Manager in a team with none.

> **A question to Ask Virtual Team Manager.** A member asks a question on Help; the Worker counts it against their 20 a day and sends Workers AI their own Help page as text with whether they're on an iPhone, Android or a computer; the model answers from that alone, and the answer is shown; nothing is kept. It answers only from the asker's own Help page, so it changes whenever Help does, and says to ask the real person when Help doesn't cover it.

- **What it knows:** the asker's own Help page as plain text (their role's questions, for their team), so its answers change whenever Help does, and whether they're on an iPhone, Android or a computer, so it gives the steps for their phone. Screenshots and mock screens aren't words, so they're left out.
- **The model:** Workers AI's `@cf/google/gemma-4-26b-a4b-it`, the site's one model, quick and cheap (it uses 4 billion of its 26 billion parameters an answer), with its thinking turned off so the answer starts straight away, at temperature 0.2 with up to 350 tokens. The AI models alert says when Cloudflare plans to retire it. It declines anything off-topic and says to ask the team's own name to ask (or "your team manager") when Help doesn't cover it, and for a team manager it points to the support form.
- **Limits:** 20 questions a member a day, counted in `ask_counts`. The question and the answer are never stored. If Workers AI isn't answering, it says the helper can't answer just now.

### Support, for team managers

> **A support ticket's path.** A team manager asks with Contact support; the ticket is saved first and then emailed to the admins; an admin replies on the site or adds a private note, which leaves it waiting on the team manager, who is emailed; their reply goes back to the admins, and a resolved ticket opens again if they reply. Every email is saved before it's sent, and the 5-minute job sends any that didn't go. Admins' private notes never reach the team manager.

A team manager asks the site's admins with **Contact support** (the bottom of their Help, and their Support page), choosing what it's about. Each question is a ticket, answered on the site: the team manager's Support page lists theirs and where each is at, and a ticket's page shows the conversation, never the admins' private notes. A ticket works for a closed team too. Five questions and twenty replies a team manager a day at most.

**Feature requests** are a ticket type of their own: Feature request in the form's dropdown. They have their own queue on Support (a tab beside Support questions), and a stage instead of a status: Under consideration, Planned, Shipped or Not planned, set on the ticket, each emailed to the team manager. Shipped and Not planned close it; a reply keeps its stage. A ticket can be moved to the other type (Type, beside it), which starts its stage again.

| The admins see | The team manager sees | Meaning |
| --- | --- | --- |
| New | Sent | Nobody's picked it up yet |
| Open | Being looked at | An admin is on it |
| Waiting | Waiting for you | An admin replied and is waiting for the team manager |
| Resolved | Resolved | Done; a reply from the team manager opens it again |

Every message is saved before its email goes, to the admins (Reply-To the team manager) or to the team manager (Reply-To the admin), and the 5-minute job sends any email that didn't go. The site's own monitoring raises tickets on the same desk (Monitoring and support). The tickets are `support_requests`, and their conversations `support_messages`.
