output "d1_ids" {
  description = "The databases' ids, for deploy.config.ts d1Id and staging.d1Id."
  value       = { for k, d in cloudflare_d1_database.site : k => d.id }
}

output "turnstile_secrets" {
  description = "The widgets' secrets, for the TURNSTILE_SECRET Worker secrets (docs/runbooks/terraform.md)."
  value       = { for k, w in cloudflare_turnstile_widget.sign_in : k => w.secret }
  sensitive   = true
}

output "turnstile_site_keys" {
  description = "The sign-in widgets' site keys, for deploy.config.ts turnstileSiteKey and staging.turnstileSiteKey."
  value       = { for k, w in cloudflare_turnstile_widget.sign_in : k => w.sitekey }
}

output "zone_rulesets" {
  description = "Each zone phase's ruleset id, on a domain of the site's own."
  value       = { for phase, r in cloudflare_ruleset.zone : phase => r.id }
}
