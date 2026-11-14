terraform {
  required_version = ">= 1.8"

  required_providers {
    aws        = { source = "hashicorp/aws", version = "~> 5.80" }
    cloudflare = { source = "cloudflare/cloudflare", version = "~> 4.40" }
    random     = { source = "hashicorp/random", version = "~> 3.6" }
  }

  # State lives in an S3 bucket created once by hand (see README.md).
  # Run: tofu init -backend-config=environments/production.backend.hcl
  backend "s3" {}
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project     = var.name
      Environment = var.environment
      ManagedBy   = "opentofu"
    }
  }
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}
