# The sign-in page's human check, one widget for the site and one for staging, each on its own hostname only. A
# widget's secret is in the state, which is why the state is kept as a secret (docs/runbooks/terraform.md).
resource "cloudflare_turnstile_widget" "sign_in" {
  for_each        = { live = var.domain, staging = var.staging_host }
  account_id      = var.account_id
  name            = each.key == "live" ? "${var.worker} sign-in" : "${var.worker} staging sign-in"
  domains         = [each.value]
  mode            = "managed"
  clearance_level = "no_clearance"
}
