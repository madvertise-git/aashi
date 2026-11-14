variable "name" {
  description = "Short product name used in resource names."
  type        = string
  default     = "aashi"
}

variable "environment" {
  description = "production, staging, ..."
  type        = string
}

variable "region" {
  description = "AWS region. Data stays in India: Mumbai."
  type        = string
  default     = "ap-south-1"
}

variable "domain" {
  description = "Where the app is served, e.g. app.example.com."
  type        = string
}

variable "cloudflare_zone_id" {
  description = "The Cloudflare zone that holds the domain."
  type        = string
}

variable "cloudflare_api_token" {
  description = "Cloudflare token with DNS edit rights on the zone. Pass as TF_VAR_cloudflare_api_token; never commit it."
  type        = string
  sensitive   = true
}

variable "github_repository" {
  description = "owner/name of the repository allowed to deploy."
  type        = string
}

variable "create_github_oidc_provider" {
  description = "Set false if this AWS account already trusts GitHub Actions."
  type        = bool
  default     = true
}

variable "vpc_cidr" {
  type    = string
  default = "10.20.0.0/16"
}

variable "postgres_version" {
  description = "Aurora PostgreSQL version."
  type        = string
  default     = "17.4"
}

variable "database_min_capacity" {
  description = "Aurora Serverless v2 minimum capacity (ACUs)."
  type        = number
  default     = 0.5
}

variable "database_max_capacity" {
  type    = number
  default = 4
}

variable "cache_node_type" {
  type    = string
  default = "cache.t4g.small"
}

variable "api_count" {
  description = "How many copies of the API run."
  type        = number
  default     = 2
}

variable "web_count" {
  type    = number
  default = 2
}

variable "alarm_email" {
  description = "Where alarms are sent. Empty means no subscription."
  type        = string
  default     = ""
}
