# What already exists is imported into the state rather than made again, so the plan shows what would change about
# it. The zone's entry-point rulesets, its settings, bot management and the site's mail records are looked up on every
# plan: a new zone already has its settings and may have an entry point or an SPF record, and making a second SPF or
# DMARC record would break both. The databases, buckets, widgets and variants are imported when adopting an install
# cf made (npm run terraform -- adopt), by the ids in deploy.config.ts. R2's CORS, lifecycle and lock rules can't be
# imported; the plan writes them again from the same files. An import of something already in the state does nothing.

locals {
  # How each mail record the files make is told apart from a name's other TXT records.
  mail_marker = { spf = "v=spf1", dmarc = "v=DMARC1" }
  mail_found = { for k, d in data.cloudflare_dns_records.mail : k => [
    for r in d.result : r.id if strcontains(r.content, local.mail_marker[k])
  ] }
  entry_points = local.owns_zone ? {
    for r in data.cloudflare_rulesets.zone[0].rulesets : r.phase => r.id if r.kind == "zone" && contains(keys(local.phases), r.phase)
  } : {}
}

data "cloudflare_rulesets" "zone" {
  count   = local.owns_zone ? 1 : 0
  zone_id = var.zone_id
}

data "cloudflare_dns_records" "mail" {
  for_each = { for k, r in local.mail_records : k => r.name }
  zone_id  = var.zone_id
  type     = "TXT"
  name     = { exact = each.value }
}

import {
  for_each = { for k, id in var.ids.d1 : k => id if var.adopt }
  to       = cloudflare_d1_database.site[each.key]
  id       = "${var.account_id}/${each.value}"
}

import {
  for_each = { for k, name in var.buckets : k => name if var.adopt }
  to       = cloudflare_r2_bucket.site[each.key]
  id       = "${var.account_id}/${each.value}/default"
}

import {
  for_each = { for k, key in var.ids.turnstile : k => key if var.adopt }
  to       = cloudflare_turnstile_widget.sign_in[each.key]
  id       = "${var.account_id}/${each.value}"
}

import {
  for_each = { for k, v in local.variants : k => v.id if var.adopt }
  to       = cloudflare_image_variant.photo[each.key]
  id       = "${var.account_id}/${each.value}"
}

import {
  # Only the phases that have an entry point already: one never used is created.
  for_each = local.entry_points
  to       = cloudflare_ruleset.zone[each.key]
  id       = "zones/${var.zone_id}/${each.value}"
}

import {
  for_each = { for id, value in local.settings : id => id }
  to       = cloudflare_zone_setting.zone[each.key]
  id       = "${var.zone_id}/${each.key}"
}

import {
  for_each = local.owns_zone ? toset(["zone"]) : []
  to       = cloudflare_bot_management.zone[0]
  id       = var.zone_id
}

import {
  # The record the file made, or the one already there: one not there yet is created.
  for_each = { for k, ids in local.mail_found : k => ids[0] if length(ids) > 0 }
  to       = cloudflare_dns_record.mail[each.key]
  id       = "${var.zone_id}/${each.value}"
}
