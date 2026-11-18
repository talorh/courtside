# Adopting an install cf made, against a stand-in provider as in setup.tftest.hcl.

mock_provider "cloudflare" {
  mock_data "cloudflare_rulesets" {
    defaults = {
      rulesets = { id = "1111111111111111111111111111aaaa", kind = "zone", phase = "http_request_firewall_custom", name = "default" }
    }
  }
  mock_data "cloudflare_dns_records" {
    defaults = {
      result = { id = "3333333333333333333333333333cccc", content = "\"v=spf1 include:_spf.mx.cloudflare.net ~all\"" }
    }
  }
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

run "adopt_looks_up_what_cf_made" {
  command = plan
  variables {
    adopt = true
    ids = {
      d1        = { live = "00000000-0000-4000-8000-000000000001", staging = "00000000-0000-4000-8000-000000000002" }
      turnstile = { live = "0x4AAAAAAAexamplelive", staging = "0x4AAAAAAAexamplestaging" }
    }
  }
  # A mock provider can't import, so each imported resource is a stand-in.
  override_resource {
    target = cloudflare_d1_database.site
  }
  override_resource {
    target = cloudflare_r2_bucket.site
  }
  override_resource {
    target = cloudflare_turnstile_widget.sign_in
  }
  override_resource {
    target = cloudflare_image_variant.photo
  }
  override_resource {
    target = cloudflare_ruleset.zone
  }
  override_resource {
    target = cloudflare_zone_setting.zone
  }
  override_resource {
    target = cloudflare_bot_management.zone
  }
  override_resource {
    target = cloudflare_dns_record.mail
  }
  assert {
    condition     = length(data.cloudflare_rulesets.zone) == 1 && keys(data.cloudflare_dns_records.mail) == ["spf"]
    error_message = "the zone's entry points and the mail records are looked up"
  }
}
