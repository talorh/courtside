# Terraform 1.10 or later: import blocks with for_each, cross-variable validation, and terraform test's mock providers.
# The provider's checksums are in .terraform.lock.hcl beside this file, committed, and changed only by
# npm run terraform -- upgrade.
terraform {
  required_version = ">= 1.10.0"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.29"
    }
  }
}
