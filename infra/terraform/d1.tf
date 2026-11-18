# The live and staging databases. Their tables come from migrations/ through cf d1 migrations apply, never Terraform.
resource "cloudflare_d1_database" "site" {
  for_each   = var.d1
  account_id = var.account_id
  name       = each.value

  lifecycle {
    # A database is the site's data: deleting one is done by hand, never by a plan.
    prevent_destroy = true
    # Where a database lives is fixed when it's made, and a change would replace it.
    ignore_changes = [primary_location_hint]
  }
}
