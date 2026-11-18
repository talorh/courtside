# The whole setup against a stand-in provider: nothing reaches Cloudflare and no token is needed
# (npm run terraform -- check). The values are the example club's, and the zone's lookups find nothing of the site's.
# A mocked nested list is written as one object, which the mock makes a list of one.

mock_provider "cloudflare" {
  mock_data "cloudflare_rulesets" {
    defaults = {
      rulesets = { id = "1111111111111111111111111111aaaa", kind = "managed", phase = "http_request_firewall_managed", name = "Cloudflare Managed Free Ruleset" }
    }
  }
  mock_data "cloudflare_dns_records" {
    defaults = {
      result = { id = "3333333333333333333333333333cccc", content = "\"google-site-verification=example\"" }
    }
  }
}

# A zone's settings and bot management always exist, so every plan imports them; a mock provider can't import, so
# they're stand-ins. Their configured values are still the config's.
override_resource {
  target = cloudflare_zone_setting.zone
}
override_resource {
  target = cloudflare_bot_management.zone
}

variables {
  account_id   = "0123456789abcdef0123456789abcdef"
  zone_id      = "fedcba9876543210fedcba9876543210"
  domain       = "saints.example"
  zone         = "saints.example"
  worker       = "courtside"
  d1           = { live = "courtside", staging = "courtside-staging" }
  buckets      = { live = "courtside-originals", staging = "courtside-staging" }
  staging_host = "staging-courtside.saints-club.workers.dev"
  # Set here so a courtside.auto.tfvars.json left by a plan on this computer can't change what's tested.
  dmarc_reports = ""
  adopt         = false
}

run "own_domain_gets_the_zones_rules_and_settings" {
  command = plan
  assert {
    condition     = toset(keys(cloudflare_ruleset.zone)) == toset(["http_request_firewall_custom", "http_request_firewall_managed", "http_ratelimit", "http_request_dynamic_redirect"])
    error_message = "four rule phases, not the cache rules: Browser Cache TTL does their job on a zone of the site's own"
  }
  assert {
    condition     = length(cloudflare_ruleset.zone["http_request_firewall_custom"].rules) == 2 && length(cloudflare_ruleset.zone["http_ratelimit"].rules) == 1
    error_message = "every rule in each file"
  }
  assert {
    condition     = alltrue([for r in cloudflare_ruleset.zone : alltrue([for rule in r.rules : startswith(rule.ref, "courtside_") && !strcontains(rule.expression, "<")])])
    error_message = "each rule keeps its ref, and no placeholder is left"
  }
  assert {
    condition     = strcontains(cloudflare_ruleset.zone["http_request_firewall_custom"].rules[1].expression, "http.cookie contains \"courtside_session=\"")
    error_message = "the human check skips the site's own session cookie"
  }
  assert {
    condition     = cloudflare_zone_setting.zone["min_tls_version"].value == "1.2" && cloudflare_zone_setting.zone["security_header"].value.strict_transport_security.preload
    error_message = "TLS 1.2 and HSTS preload, from infra/zone/"
  }
  assert {
    condition     = cloudflare_bot_management.zone[0].ai_bots_protection == "block" && !cloudflare_bot_management.zone[0].enable_js
    error_message = "AI bots blocked, JavaScript detections off"
  }
}

run "live_and_staging_each_get_a_database_bucket_and_widget" {
  command = plan
  assert {
    condition     = cloudflare_turnstile_widget.sign_in["live"].domains == tolist(["saints.example"]) && cloudflare_turnstile_widget.sign_in["staging"].domains == tolist(["staging-courtside.saints-club.workers.dev"])
    error_message = "each widget answers on its own hostname only"
  }
  assert {
    condition     = cloudflare_d1_database.site["staging"].name == "courtside-staging" && cloudflare_r2_bucket.site["live"].name == "courtside-originals"
    error_message = "the names are deploy.config.ts's"
  }
  assert {
    condition     = cloudflare_r2_bucket_cors.site["live"].rules[0].allowed.origins == tolist(["https://saints.example"]) && cloudflare_r2_bucket_cors.site["staging"].rules[0].allowed.origins == tolist(["https://staging-courtside.saints-club.workers.dev"])
    error_message = "each bucket takes uploads from its own site only"
  }
  assert {
    condition     = [for r in cloudflare_r2_bucket_lifecycle.site["live"].rules : r.delete_objects_transition.condition.max_age] == [2592000, 1209600]
    error_message = "originals go at 30 days and backups at 14"
  }
  assert {
    condition     = cloudflare_r2_bucket_lock.backups.bucket_name == "courtside-originals" && cloudflare_r2_bucket_lock.backups.rules[0].prefix == "backups/d1/"
    error_message = "only the live bucket's backups are locked"
  }
  assert {
    condition     = cloudflare_image_variant.photo["thumb"].options.width == 512 && cloudflare_image_variant.photo["large"].options.fit == "scale-down" && !cloudflare_image_variant.photo["large"].never_require_signed_urls
    error_message = "the variants are infra/'s, signed links only"
  }
}

run "subdomain_leaves_the_shared_zone_to_cf" {
  command = plan
  variables {
    domain = "courtside.saints.example"
  }
  assert {
    condition     = length(cloudflare_ruleset.zone) == 0 && length(cloudflare_zone_setting.zone) == 0 && length(cloudflare_bot_management.zone) == 0
    error_message = "no ruleset, zone-wide setting or bot setting on a zone the club shares"
  }
  assert {
    condition     = cloudflare_dns_record.mail["spf"].name == "courtside.saints.example"
    error_message = "the site's own mail records are still made, on its own name"
  }
}

run "dmarc_record_once_its_address_is_known" {
  command = plan
  assert {
    condition     = keys(cloudflare_dns_record.mail) == ["spf"]
    error_message = "SPF alone until the DMARC Management address is in deploy.config.ts"
  }
}

run "dmarc_record_with_its_address" {
  command = plan
  variables {
    dmarc_reports = "0a1b2c3d4e5f"
  }
  assert {
    condition     = cloudflare_dns_record.mail["dmarc"].name == "_dmarc.saints.example" && strcontains(cloudflare_dns_record.mail["dmarc"].content, "rua=mailto:0a1b2c3d4e5f@dmarc-reports.cloudflare.net")
    error_message = "DMARC reports go to the zone's DMARC Management address"
  }
}

run "the_outputs_give_what_deploy_config_needs" {
  assert {
    condition     = toset(keys(output.d1_ids)) == toset(["live", "staging"]) && toset(keys(output.turnstile_site_keys)) == toset(["live", "staging"])
    error_message = "the ids and site keys an install writes into deploy.config.ts"
  }
}
