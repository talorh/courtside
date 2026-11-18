# The token comes from CLOUDFLARE_API_TOKEN, which npm run terraform sets (the cf login's own unless one is set), and
# never from a file.
provider "cloudflare" {}
