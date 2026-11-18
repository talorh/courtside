# The live and staging buckets with their CORS, lifecycle and lock rules, from infra/ (live) and infra/staging/. cf's
# JSON names are camelCase; the provider's are snake_case, so each rule is renamed here.

locals {
  bucket_files = {
    live    = { cors = "r2-cors", lifecycle = "r2-lifecycle" }
    staging = { cors = "staging/r2-cors", lifecycle = "staging/r2-lifecycle" }
  }
}

resource "cloudflare_r2_bucket" "site" {
  for_each   = var.buckets
  account_id = var.account_id
  name       = each.value

  lifecycle {
    # A bucket holds the originals and the backups: emptying and deleting one is done by hand, never by a plan.
    prevent_destroy = true
    # Where a bucket lives is fixed when it's made.
    ignore_changes = [location]
  }
}

resource "cloudflare_r2_bucket_cors" "site" {
  for_each    = cloudflare_r2_bucket.site
  account_id  = var.account_id
  bucket_name = each.value.name
  rules = [for r in local.json[local.bucket_files[each.key].cors] : {
    allowed         = r.allowed
    expose_headers  = r.exposeHeaders
    max_age_seconds = r.maxAgeSeconds
  }]
}

resource "cloudflare_r2_bucket_lifecycle" "site" {
  for_each    = cloudflare_r2_bucket.site
  account_id  = var.account_id
  bucket_name = each.value.name
  rules = [for r in local.json[local.bucket_files[each.key].lifecycle] : {
    id         = r.id
    enabled    = r.enabled
    conditions = r.conditions
    delete_objects_transition = {
      condition = { type = r.deleteObjectsTransition.condition.type, max_age = r.deleteObjectsTransition.condition.maxAge }
    }
    abort_multipart_uploads_transition = try({
      condition = { type = r.abortMultipartUploadsTransition.condition.type, max_age = r.abortMultipartUploadsTransition.condition.maxAge }
    }, null)
  }]
}

# Only the live bucket's nightly backups are locked: for their first 14 days nothing can delete or overwrite one.
resource "cloudflare_r2_bucket_lock" "backups" {
  account_id  = var.account_id
  bucket_name = cloudflare_r2_bucket.site["live"].name
  rules = [for r in local.json["r2-lock"].rules : {
    id        = r.id
    enabled   = r.enabled
    prefix    = r.prefix
    condition = { type = r.condition.type, max_age_seconds = r.condition.maxAgeSeconds }
  }]
}
