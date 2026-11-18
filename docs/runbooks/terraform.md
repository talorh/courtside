# Runbook: the Cloudflare setup with Terraform

Some clubs already manage their Cloudflare account with Terraform, and would rather keep the site's setup there too.
`infra/terraform/` does that, as an optional second way of applying what `docs/runbooks/cloudflare-setup.md` applies
with `cf`. Both read the same JSON bodies in `infra/`, so they can't drift apart. A club picks one way and keeps to it,
since two tools editing one resource undo each other. Either way an AI coding agent can do the work, following
INSTALL.md and this runbook, with the owner saying yes to each plan. The rules for the code are in
`docs/development-standards.md` §12.

Rules: the site owner's yes before every apply, read-only commands any time, the same as for `cf`
(`docs/cloudflare-standards.md`). `npm run terraform` refuses to apply anything but a plan it saved, so the plan the
owner read is the one applied. The state and the saved plan file hold secrets, like `.secrets.*.json`: the files are
never printed, pasted or committed (reading the plan on screen is fine: Terraform hides the secrets in it).

## 1. What Terraform manages, and what it doesn't

| Terraform (`infra/terraform/`) | From |
| --- | --- |
| The live and staging D1 databases (not their tables) | `deploy.config.ts` `d1Name`, `staging.d1Name` |
| The live and staging R2 buckets, their CORS and lifecycle rules, and the backups' lock | `infra/r2-*.json`, `infra/staging/` |
| The two Turnstile sign-in widgets | the site's domain, staging's address |
| The Images variants `thumb` and `large` | `infra/images-variant-*.json` |
| The SPF record, and DMARC once `deploy.config.ts` `dmarcReports` is filled in. One already on the name is taken over and made the file's | `infra/zone/dns-*.json` |
| On a domain of the site's own only: the custom WAF, managed WAF, rate limit and redirect rules, five zone-wide settings (minimum TLS 1.2, HSTS, Browser Cache TTL 0, Always Use HTTPS, email obfuscation off) and bot management. What the zone already has of these is taken over on the first plan | `infra/zone/` |

These stay out of Terraform, because something else already owns each one:

- The Workers, their crons, domains and bindings: `cloudflare.config.ts` and Workers Builds.
- The Worker secrets: `cf workers secrets`.
- D1's tables: `migrations/` and `cf d1 migrations apply`.
- Stream, Email Sending, Email Routing, Artifacts and Cloudflare's notifications: the setup runbook. Email Routing and the
  notifications name the owner's email, which can't be in a public repository.

**On a subdomain** (`CLUB.domain` isn't `CLUB.zone`) Terraform leaves the zone's rules and zone-wide settings alone. A
`cloudflare_ruleset` owns its whole phase, so it would delete the club's own rules there. They stay with the setup
runbook's merge (On a subdomain). The site's mail records are on its own names, so Terraform still manages them.

## 2. Setting up

- **The choice.** `deploy.config.ts` `cloudflareSetup` says how this club sets Cloudflare up: `"cf"` (the usual way)
  or `"terraform"`. INSTALL.md asks it first. `npm run terraform` plans and applies only while it's `"terraform"`, so
  a club on `cf` can't change its account through Terraform by mistake, and agents know which way to work.
- **The computer.** `npm run terraform -- setup` gets it ready, and is safe to run again:
  - **Terraform 1.10 or later**, from HashiCorp's own packages. These need sudo, so setup shows the commands for this
    system (HashiCorp's dnf repository on Fedora, its apt repository on Debian or Ubuntu, its Homebrew tap on a Mac)
    to run with the owner's yes. On Fedora, if HashiCorp has no packages for the newest release yet, put the previous
    release's number for `$releasever` in `/etc/yum.repos.d/hashicorp.repo`.
  - **cf-terraforming** (§6), which the systems don't package: setup downloads Cloudflare's release for this computer,
    checks it against the SHA-256 pinned in `scripts/terraform-steps.mjs`, and installs it in `~/.local/bin`. Nothing
    is piped into a shell.
- **The token.** Nothing to make: `npm run terraform` uses the `cf` login's own token (`CF_PROFILE` picks the login),
  refreshed first and never printed. The `cf` login can write everything Terraform makes here (D1, R2, Turnstile,
  Images, zone settings, WAF, redirects, bot management and DNS). A club that would rather use an API token sets
  `CLOUDFLARE_API_TOKEN` in the shell, never a file: this account and zone only, with Account: D1, Workers R2 Storage,
  Turnstile and Cloudflare Images Edit, and Account Settings Read; Zone: Zone Settings, Zone WAF, Dynamic URL
  Redirects, Bot Management and DNS Edit.

## 3. The commands

| Purpose | Command |
| --- | --- |
| This computer made ready: Terraform checked, cf-terraforming installed (§2) | `npm run terraform -- setup` |
| Formatted, valid and its tests pass, against a stand-in provider: no token, nothing sent | `npm run terraform -- check` |
| Plan a change, saved for apply (writes `courtside.auto.tfvars.json` from `deploy.config.ts` and `src/club.ts`) | `npm run terraform -- plan` |
| Plan taking over an install that `cf` made (§5) | `npm run terraform -- adopt` |
| Apply the saved plan, once the owner has read it and said yes. Then it writes the databases' ids and the site keys into `deploy.config.ts`, and the Turnstile secrets into the secrets files | `npm run terraform -- apply` |
| Does Cloudflare still match `infra/`? Changes nothing | `npm run terraform -- drift` |
| A newer provider within `terraform.tf`'s range, locked for every platform | `npm run terraform -- upgrade` |

A change to `infra/` (a rule, a lifecycle, a variant) is made in its JSON file, then `check`, then `plan`. Read the plan
with the owner, `apply` on their yes, and commit the file. A club that applies with `cf` follows the setup runbook §3 for
the same file.

## 4. A new install with Terraform

INSTALL.md section 5 makes everything with `cf`. A club using Terraform instead lets Terraform make what §1 lists, in
the same order INSTALL.md gives:

1. `deploy.config.ts` with `cloudflareSetup: "terraform"`, and the account, zone, Worker name and staging's address
   filled in (INSTALL.md). `npm run terraform -- setup` says the computer is ready.
2. `npm run terraform -- plan`, read it with the owner, their yes, `npm run terraform -- apply`. The apply writes the
   databases' ids and the two site keys into `deploy.config.ts` (commit it), and the Turnstile secrets into the
   git-ignored `.secrets.production.json` and `.secrets.staging.json`, without showing them. From there INSTALL.md's
   secrets step puts the live one on the Worker, and `npm run staging -- setup` staging's.
3. Everything else in INSTALL.md section 5 as it stands: the migrations, Stream, Email Sending and Routing, the tokens,
   the other secrets, Artifacts.
4. Once Email Routing is on, the zone's DMARC Management page shows its reports address: its first part goes in
   `deploy.config.ts` `dmarcReports`, then `plan` and `apply` again add the DMARC record.

## 5. Taking over an install that cf made

Set `deploy.config.ts` `cloudflareSetup` to `"terraform"`, run `npm run terraform -- setup`, and fill in
`dmarcReports` from the `rua` address in the zone's DMARC record (`_dmarc.<domain>`), or the DMARC record is left
unmanaged. Then `npm run terraform -- adopt` plans importing what exists, by the ids in `deploy.config.ts` and by looking up the zone's
entry-point rulesets and mail records. Read every line of the plan:

- "will be imported" alone is the goal: Cloudflare already matches `infra/`.
- A change means the account differs from `infra/`. Either someone changed it by hand, or `infra/` moved on and wasn't
  applied. Settle which is right with the owner before the apply.
- R2's CORS, lifecycle and lock rules can't be imported. The plan writes them from the same files, which leaves them as
  they are.
- On first import each zone rule gains its `ref`, so it shows as changed once.
- On a domain of the site's own, the SPF record found is made the file's (Email Routing only). A club that also sends
  its own mail from that domain adds its senders to `infra/zone/dns-spf.json` first.

Then `npm run terraform -- apply` on the owner's yes, and from then on `plan` and `apply` only.

## 6. cf-terraforming

`npm run terraform` already knows the site's resources. cf-terraforming is for what's outside them: seeing what a zone
or account holds before adopting, or bringing the club's other Cloudflare setup under Terraform. It's read-only.

```bash
export CLOUDFLARE_API_TOKEN=<a read-only token>   # cf-terraforming reads it; set it in the shell, never a file
cf-terraforming generate --resource-type cloudflare_ruleset --zone <zone id>
cf-terraforming import --resource-type cloudflare_ruleset --zone <zone id> --modern-import-block
```

It doesn't know `cloudflare_image_variant` or R2's CORS, lifecycle and lock resources, so those are written by hand.

## 7. The state

The state is `infra/terraform/terraform.tfstate`, git-ignored. It holds the Turnstile secrets in plain text, so it's
kept like `.secrets.*.json`. Losing it loses nothing in Cloudflare: `adopt` builds it again. For more than one computer,
keep it in an R2 bucket of its own with Terraform's `s3` backend (Cloudflare's guide: Terraform, Remote R2 backend),
`use_lockfile = true` and `use_path_style = true`. The backend goes in a git-ignored `infra/terraform/backend.tf`, and
its R2 key is set in the shell as `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`, never in a file. The key is for that
one bucket only (Object Read and Write).

## 8. Removing something

The databases and buckets have `prevent_destroy`: no plan deletes them. Deleting one is done by hand, with the owner's
yes, as the setup runbook says. Taking a resource out of the config leaves zone settings, bot management, and R2's
lifecycle and lock rules as they are in Cloudflare, because the provider's delete does nothing for them. To stop
managing a resource without deleting it, use a `removed` block with `destroy = false`.
