# Encryption key, database, cache, file storage and secrets.
data "aws_caller_identity" "current" {}

resource "aws_kms_key" "main" {
  description             = "${local.prefix}: database, cache, secrets, logs and files"
  enable_key_rotation     = true
  deletion_window_in_days = 30

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AccountAdministers"
        Effect    = "Allow"
        Principal = { AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root" }
        Action    = "kms:*"
        Resource  = "*"
      },
      {
        Sid       = "LogsMayEncrypt"
        Effect    = "Allow"
        Principal = { Service = "logs.${var.region}.amazonaws.com" }
        Action    = ["kms:Encrypt*", "kms:Decrypt*", "kms:ReEncrypt*", "kms:GenerateDataKey*", "kms:Describe*"]
        Resource  = "*"
      },
    ]
  })
}

resource "aws_kms_alias" "main" {
  name          = "alias/${local.prefix}"
  target_key_id = aws_kms_key.main.key_id
}

# --- PostgreSQL (Aurora Serverless v2) ----------------------------------------
resource "aws_db_subnet_group" "main" {
  name       = local.prefix
  subnet_ids = aws_subnet.private[*].id
}

resource "aws_rds_cluster" "main" {
  cluster_identifier = local.prefix
  engine             = "aurora-postgresql"
  engine_mode        = "provisioned"
  engine_version     = var.postgres_version
  database_name      = var.name

  # AWS creates and rotates the administrator password in Secrets Manager.
  # Only the one-off bootstrap task reads it.
  master_username               = "platform_admin"
  manage_master_user_password   = true
  master_user_secret_kms_key_id = aws_kms_key.main.arn

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.database.id]
  storage_encrypted      = true
  kms_key_id             = aws_kms_key.main.arn

  # At most five minutes of data loss: point-in-time recovery, kept two weeks.
  backup_retention_period         = 14
  preferred_backup_window         = "20:00-21:00" # 01:30 IST
  copy_tags_to_snapshot           = true
  deletion_protection             = true
  skip_final_snapshot             = false
  final_snapshot_identifier       = "${local.prefix}-final"
  enabled_cloudwatch_logs_exports = ["postgresql"]

  serverlessv2_scaling_configuration {
    min_capacity = var.database_min_capacity
    max_capacity = var.database_max_capacity
  }
}

resource "aws_rds_cluster_instance" "main" {
  count                        = 2 # one writer, one standby in the other zone
  identifier                   = "${local.prefix}-${count.index}"
  cluster_identifier           = aws_rds_cluster.main.id
  engine                       = aws_rds_cluster.main.engine
  engine_version               = aws_rds_cluster.main.engine_version
  instance_class               = "db.serverless"
  performance_insights_enabled = true
}

# --- Valkey (sessions, rate limits) -------------------------------------------
resource "aws_elasticache_subnet_group" "main" {
  name       = local.prefix
  subnet_ids = aws_subnet.private[*].id
}

resource "random_password" "cache" {
  length  = 48
  special = false
}

resource "aws_elasticache_replication_group" "main" {
  replication_group_id       = local.prefix
  description                = "${local.prefix} sessions and rate limits"
  engine                     = "valkey"
  engine_version             = "8.0"
  node_type                  = var.cache_node_type
  num_cache_clusters         = 2
  automatic_failover_enabled = true
  multi_az_enabled           = true
  port                       = 6379
  subnet_group_name          = aws_elasticache_subnet_group.main.name
  security_group_ids         = [aws_security_group.cache.id]
  at_rest_encryption_enabled = true
  kms_key_id                 = aws_kms_key.main.arn
  transit_encryption_enabled = true
  auth_token                 = random_password.cache.result
  snapshot_retention_limit   = 1
}

# --- Files --------------------------------------------------------------------
resource "aws_s3_bucket" "files" {
  bucket = "${local.prefix}-files-${data.aws_caller_identity.current.account_id}"
}

resource "aws_s3_bucket_public_access_block" "files" {
  bucket                  = aws_s3_bucket.files.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "files" {
  bucket = aws_s3_bucket.files.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.main.arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_versioning" "files" {
  bucket = aws_s3_bucket.files.id
  versioning_configuration {
    status = "Enabled"
  }
}

# --- Secrets ------------------------------------------------------------------
# One password per database role, a secret for cookies and two-factor
# encryption, and the connection strings the containers read. Values are
# generated here and never appear in the repository. They do appear in the
# state file, which is why the state bucket is encrypted and private.
resource "random_password" "database" {
  for_each = toset(["owner", "app", "auth"])
  length   = 40
  special  = false
}

resource "random_password" "auth_secret" {
  length  = 64
  special = false
}

locals {
  database_host = "${aws_rds_cluster.main.endpoint}:5432/${var.name}?sslmode=verify-full"

  secrets = {
    DATABASE_OWNER_URL      = "postgres://platform_owner:${random_password.database["owner"].result}@${local.database_host}"
    DATABASE_URL            = "postgres://platform_app:${random_password.database["app"].result}@${local.database_host}"
    AUTH_DATABASE_URL       = "postgres://platform_auth:${random_password.database["auth"].result}@${local.database_host}"
    PLATFORM_OWNER_PASSWORD = random_password.database["owner"].result
    PLATFORM_APP_PASSWORD   = random_password.database["app"].result
    PLATFORM_AUTH_PASSWORD  = random_password.database["auth"].result
    AUTH_SECRET             = random_password.auth_secret.result
    REDIS_URL               = "rediss://:${random_password.cache.result}@${aws_elasticache_replication_group.main.primary_endpoint_address}:6379"
  }
}

locals {
  secret_names = toset([
    "DATABASE_OWNER_URL", "DATABASE_URL", "AUTH_DATABASE_URL", "PLATFORM_OWNER_PASSWORD",
    "PLATFORM_APP_PASSWORD", "PLATFORM_AUTH_PASSWORD", "AUTH_SECRET", "REDIS_URL",
  ])
}

resource "aws_secretsmanager_secret" "app" {
  for_each   = local.secret_names
  name       = "${local.prefix}/${each.key}"
  kms_key_id = aws_kms_key.main.arn
}

resource "aws_secretsmanager_secret_version" "app" {
  for_each      = local.secret_names
  secret_id     = aws_secretsmanager_secret.app[each.key].id
  secret_string = local.secrets[each.key]
}
