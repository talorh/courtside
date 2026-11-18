locals {
  # A domain of the site's own owns the zone's rule phases and zone-wide settings. On a zone shared with the club's
  # website a phase's ruleset holds the club's rules too, and a cloudflare_ruleset owns its whole phase, so there the
  # zone is left to cf and the runbook's merge (docs/runbooks/cloudflare-setup.md, On a subdomain).
  owns_zone = var.domain == var.zone

  # infra/'s JSON bodies, the same files the runbook's cf commands send, with their placeholders filled in as its sed
  # does. infra/zone/cache-rules.json is for a subdomain only, so it isn't here.
  files = [
    "r2-cors", "r2-lifecycle", "r2-lock", "staging/r2-cors", "staging/r2-lifecycle",
    "images-variant-thumb", "images-variant-large",
    "zone/waf-custom-rules", "zone/waf-managed", "zone/rate-limit-rules", "zone/redirect-rules",
    "zone/min-tls", "zone/security-header", "zone/browser-cache-ttl", "zone/always-use-https", "zone/email-obfuscation",
    "zone/bot-management", "zone/dns-spf", "zone/dns-dmarc",
  ]
  placeholders = {
    "<domain>"                        = var.domain
    "<worker>"                        = var.worker
    "<subdomain>"                     = split(".", var.staging_host)[1]
    "<your DMARC Management address>" = var.dmarc_reports
  }
  json = { for f in local.files : f => jsondecode(
    replace(replace(replace(replace(file("${path.module}/../${f}.json"),
      "<domain>", local.placeholders["<domain>"]),
      "<worker>", local.placeholders["<worker>"]),
      "<subdomain>", local.placeholders["<subdomain>"]),
    "<your DMARC Management address>", local.placeholders["<your DMARC Management address>"])
  ) }
}
