# Every value comes from deploy.config.ts and src/club.ts: npm run terraform writes them to courtside.auto.tfvars.json
# (git-ignored), so no id or name of a club's lives in this folder.

variable "account_id" {
  description = "The Cloudflare account id (deploy.config.ts accountId)."
  type        = string
  validation {
    condition     = can(regex("^[0-9a-f]{32}$", var.account_id))
    error_message = "account_id is 32 hex characters."
  }
}

variable "zone_id" {
  description = "The zone id of CLUB.zone (deploy.config.ts zoneId)."
  type        = string
  validation {
    condition     = can(regex("^[0-9a-f]{32}$", var.zone_id))
    error_message = "zone_id is 32 hex characters."
  }
}

variable "domain" {
  description = "The site's hostname (src/club.ts domain)."
  type        = string
  validation {
    condition     = can(regex("^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$", var.domain))
    error_message = "domain is a lower-case hostname."
  }
}

variable "zone" {
  description = "The zone the domain sits in (src/club.ts zone): the same as domain for a domain of the site's own."
  type        = string
  validation {
    condition     = var.domain == var.zone || endswith(var.domain, ".${var.zone}")
    error_message = "zone is the domain itself, or the domain the site's subdomain is under."
  }
}

variable "worker" {
  description = "The Worker's name (deploy.config.ts worker): the prefix of every rule's description."
  type        = string
  validation {
    condition     = can(regex("^[a-z0-9-]+$", var.worker))
    error_message = "worker is lower-case letters, digits and dashes."
  }
}

variable "d1" {
  description = "The live and staging databases' names (deploy.config.ts d1Name, staging.d1Name)."
  type        = object({ live = string, staging = string })
}

variable "buckets" {
  description = "The live and staging R2 buckets' names (deploy.config.ts bucket, staging.bucket)."
  type        = object({ live = string, staging = string })
}

variable "staging_host" {
  description = "Staging's address, staging-<worker>.<subdomain>.workers.dev (deploy.config.ts staging.host)."
  type        = string
  validation {
    condition     = can(regex("^staging-[a-z0-9-]+\\.[a-z0-9-]+\\.workers\\.dev$", var.staging_host))
    error_message = "staging_host is staging-<worker>.<subdomain>.workers.dev."
  }
}

variable "dmarc_reports" {
  description = "The local part of the zone's DMARC Management address (deploy.config.ts dmarcReports); empty leaves DMARC out."
  type        = string
  default     = ""
}

variable "adopt" {
  description = "Import what an install made with cf, rather than create it (npm run terraform -- adopt)."
  type        = bool
  default     = false
}

variable "ids" {
  description = "Ids of an existing install, for adopt: the databases' (deploy.config.ts d1Id) and the Turnstile site keys."
  type = object({
    d1        = object({ live = string, staging = string })
    turnstile = object({ live = string, staging = string })
  })
  default = {
    d1        = { live = "", staging = "" }
    turnstile = { live = "", staging = "" }
  }
}
