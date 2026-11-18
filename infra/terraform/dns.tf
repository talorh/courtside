# The site's mail records (infra/zone/dns-*.json): the SPF, and DMARC once the zone's DMARC Management address is in
# deploy.config.ts. They're on the site's own names, so they're the site's on a zone it shares too.
locals {
  mail_records = {
    for name, body in { spf = local.json["zone/dns-spf"], dmarc = local.json["zone/dns-dmarc"] } : name => body
    if name == "spf" || var.dmarc_reports != ""
  }
}

resource "cloudflare_dns_record" "mail" {
  for_each = local.mail_records
  zone_id  = var.zone_id
  type     = each.value.type
  name     = each.value.name
  content  = each.value.content
  ttl      = each.value.ttl
  comment  = each.value.comment
}
