# The zone's protection on a domain of the site's own (local.owns_zone): its rule phases, zone-wide settings and bot
# management, from infra/zone/. Each ruleset is its phase's entry point and owns every rule in it.

locals {
  phases = { for phase, body in {
    http_request_firewall_custom  = local.json["zone/waf-custom-rules"]
    http_request_firewall_managed = local.json["zone/waf-managed"]
    http_ratelimit                = local.json["zone/rate-limit-rules"]
    http_request_dynamic_redirect = local.json["zone/redirect-rules"]
  } : phase => body if local.owns_zone }
  # Zone-wide settings, each from its own file in infra/zone/, as cf zones settings edit sends it.
  settings = { for id, file in {
    min_tls_version   = "zone/min-tls"
    security_header   = "zone/security-header"
    browser_cache_ttl = "zone/browser-cache-ttl"
    always_use_https  = "zone/always-use-https"
    email_obfuscation = "zone/email-obfuscation"
  } : id => local.json[file].value if local.owns_zone }
}

resource "cloudflare_ruleset" "zone" {
  for_each    = local.phases
  zone_id     = var.zone_id
  kind        = "zone"
  phase       = each.key
  name        = "default"
  description = each.value.description
  rules       = each.value.rules
}

# Removing one of these from the config leaves the setting as it is in Cloudflare: the provider's delete does nothing.
resource "cloudflare_zone_setting" "zone" {
  for_each   = local.settings
  zone_id    = var.zone_id
  setting_id = each.key
  value      = each.value
}

resource "cloudflare_bot_management" "zone" {
  count              = local.owns_zone ? 1 : 0
  zone_id            = var.zone_id
  enable_js          = local.json["zone/bot-management"].enable_js
  ai_bots_protection = local.json["zone/bot-management"].ai_bots_protection
}
