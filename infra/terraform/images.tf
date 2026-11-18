# The photos' two sizes, both stripped of metadata and reached only by signed links (infra/images-variant-*.json).
locals {
  variants = { thumb = local.json["images-variant-thumb"], large = local.json["images-variant-large"] }
}

resource "cloudflare_image_variant" "photo" {
  for_each                  = local.variants
  account_id                = var.account_id
  id                        = each.value.id
  never_require_signed_urls = each.value.neverRequireSignedURLs
  options                   = each.value.options
}
