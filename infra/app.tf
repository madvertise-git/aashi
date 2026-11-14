# Container registry, load balancer and the ECS services.
resource "aws_ecr_repository" "app" {
  for_each             = toset(["api", "web"])
  name                 = "${local.prefix}-${each.key}"
  image_tag_mutability = "IMMUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
  encryption_configuration {
    encryption_type = "KMS"
    kms_key         = aws_kms_key.main.arn
  }
}

resource "aws_ecr_lifecycle_policy" "app" {
  for_each   = aws_ecr_repository.app
  repository = each.value.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep the last 50 images, enough to roll back a long way"
      selection    = { tagStatus = "any", countType = "imageCountMoreThan", countNumber = 50 }
      action       = { type = "expire" }
    }]
  })
}

resource "aws_cloudwatch_log_group" "app" {
  for_each          = toset(["api", "web", "tasks"])
  name              = "/${local.prefix}/${each.key}"
  retention_in_days = 90
  kms_key_id        = aws_kms_key.main.arn
}

# --- Load balancer ------------------------------------------------------------
resource "aws_acm_certificate" "main" {
  domain_name       = var.domain
  validation_method = "DNS"
  lifecycle { create_before_destroy = true }
}

resource "cloudflare_record" "certificate_validation" {
  for_each = {
    for o in aws_acm_certificate.main.domain_validation_options : o.domain_name => o
  }
  zone_id = var.cloudflare_zone_id
  name    = trimsuffix(each.value.resource_record_name, ".")
  type    = each.value.resource_record_type
  content = trimsuffix(each.value.resource_record_value, ".")
  proxied = false
  ttl     = 60
}

resource "aws_acm_certificate_validation" "main" {
  certificate_arn         = aws_acm_certificate.main.arn
  validation_record_fqdns = [for r in cloudflare_record.certificate_validation : r.hostname]
}

resource "aws_lb" "main" {
  name                       = local.prefix
  load_balancer_type         = "application"
  security_groups            = [aws_security_group.load_balancer.id]
  subnets                    = aws_subnet.public[*].id
  drop_invalid_header_fields = true
  enable_deletion_protection = true
}

resource "aws_lb_target_group" "web" {
  name                 = "${local.prefix}-web"
  port                 = 3000
  protocol             = "HTTP"
  target_type          = "ip"
  vpc_id               = aws_vpc.main.id
  deregistration_delay = 30

  health_check {
    path                = "/sign-in"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    interval            = 15
    timeout             = 5
  }
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.main.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = aws_acm_certificate_validation.main.certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.web.arn
  }
}

# The public name. Cloudflare sits in front and is the only caller the load balancer accepts.
resource "cloudflare_record" "app" {
  zone_id = var.cloudflare_zone_id
  name    = var.domain
  type    = "CNAME"
  content = aws_lb.main.dns_name
  proxied = true
}

# --- ECS ----------------------------------------------------------------------
resource "aws_ecs_cluster" "main" {
  name = local.prefix
  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

# Lets the web containers reach the API by the name "api" (http://api:4000).
resource "aws_service_discovery_http_namespace" "main" {
  name = local.prefix
}

locals {
  secret = { for name in local.secret_names : name => aws_secretsmanager_secret.app[name].arn }

  api_environment = [
    { name = "NODE_ENV", value = "production" },
    { name = "PORT", value = "4000" },
    { name = "APP_URL", value = "https://${var.domain}" },
    { name = "KEY_PREFIX", value = local.prefix },
    # Cloudflare, the load balancer and the web app's proxy sit in front of the API.
    { name = "TRUSTED_PROXY_HOPS", value = "3" },
  ]
  api_secrets = [
    for name in ["DATABASE_URL", "AUTH_DATABASE_URL", "REDIS_URL", "AUTH_SECRET"] : { name = name, valueFrom = local.secret[name] }
  ]
  log = {
    for stream in ["api", "web", "tasks"] : stream => {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.app[stream].name
        awslogs-region        = var.region
        awslogs-stream-prefix = stream
      }
    }
  }
  # The deploy pipeline replaces the image on every release; this is only the first one.
  placeholder_image = "public.ecr.aws/docker/library/node:22-slim"
}

resource "aws_ecs_task_definition" "api" {
  family                   = "${local.prefix}-api"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 512
  memory                   = 1024
  execution_role_arn       = aws_iam_role.task_execution.arn
  task_role_arn            = aws_iam_role.api.arn

  runtime_platform {
    cpu_architecture        = "ARM64"
    operating_system_family = "LINUX"
  }

  container_definitions = jsonencode([{
    name             = "api"
    image            = local.placeholder_image
    essential        = true
    portMappings     = [{ name = "api", containerPort = 4000, protocol = "tcp" }]
    environment      = local.api_environment
    secrets          = local.api_secrets
    logConfiguration = local.log["api"]
    healthCheck = {
      command     = ["CMD-SHELL", "node -e \"fetch('http://localhost:4000/readyz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))\""]
      interval    = 15
      timeout     = 5
      retries     = 3
      startPeriod = 20
    }
  }])
}

resource "aws_ecs_task_definition" "web" {
  family                   = "${local.prefix}-web"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.task_execution.arn

  runtime_platform {
    cpu_architecture        = "ARM64"
    operating_system_family = "LINUX"
  }

  container_definitions = jsonencode([{
    name             = "web"
    image            = local.placeholder_image
    essential        = true
    portMappings     = [{ name = "web", containerPort = 3000, protocol = "tcp" }]
    environment      = [{ name = "NODE_ENV", value = "production" }]
    logConfiguration = local.log["web"]
  }])
}

# One-off tasks from the API image: migrations on every release, and the
# database bootstrap once. Only this task definition holds the owner and
# administrator credentials; the running API never sees them.
resource "aws_ecs_task_definition" "tasks" {
  family                   = "${local.prefix}-tasks"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.task_execution.arn

  runtime_platform {
    cpu_architecture        = "ARM64"
    operating_system_family = "LINUX"
  }

  container_definitions = jsonencode([{
    name             = "tasks"
    image            = local.placeholder_image
    essential        = true
    workingDirectory = "/repo/packages/db"
    command          = ["node", "--import", "tsx", "scripts/migrate.ts"]
    environment = [
      { name = "NODE_ENV", value = "production" },
      { name = "DATABASE_SUPERUSER_HOST", value = aws_rds_cluster.main.endpoint },
      { name = "DATABASE_SUPERUSER_USER", value = aws_rds_cluster.main.master_username },
      { name = "BOOTSTRAP_DATABASES", value = var.name },
    ]
    secrets = concat(
      [for name in ["DATABASE_OWNER_URL", "PLATFORM_OWNER_PASSWORD", "PLATFORM_APP_PASSWORD", "PLATFORM_AUTH_PASSWORD"] : { name = name, valueFrom = local.secret[name] }],
      [{ name = "DATABASE_SUPERUSER_PASSWORD", valueFrom = "${aws_rds_cluster.main.master_user_secret[0].secret_arn}:password::" }],
    )
    logConfiguration = local.log["tasks"]
  }])
}

resource "aws_ecs_service" "api" {
  name                   = "api"
  cluster                = aws_ecs_cluster.main.id
  task_definition        = aws_ecs_task_definition.api.arn
  desired_count          = var.api_count
  launch_type            = "FARGATE"
  enable_execute_command = false

  network_configuration {
    subnets         = aws_subnet.private[*].id
    security_groups = [aws_security_group.app.id]
  }

  service_connect_configuration {
    enabled   = true
    namespace = aws_service_discovery_http_namespace.main.arn
    service {
      port_name      = "api"
      discovery_name = "api"
      client_alias {
        port     = 4000
        dns_name = "api"
      }
    }
  }

  # A release that fails its health checks is rolled back by ECS itself.
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }
  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200

  # The deploy pipeline owns which image runs.
  lifecycle { ignore_changes = [task_definition] }
}

resource "aws_ecs_service" "web" {
  name                              = "web"
  cluster                           = aws_ecs_cluster.main.id
  task_definition                   = aws_ecs_task_definition.web.arn
  desired_count                     = var.web_count
  launch_type                       = "FARGATE"
  health_check_grace_period_seconds = 30

  network_configuration {
    subnets         = aws_subnet.private[*].id
    security_groups = [aws_security_group.app.id]
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.web.arn
    container_name   = "web"
    container_port   = 3000
  }

  # A client of the namespace only: it can call "api" but offers nothing itself.
  service_connect_configuration {
    enabled   = true
    namespace = aws_service_discovery_http_namespace.main.arn
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }
  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200

  lifecycle { ignore_changes = [task_definition] }
  depends_on = [aws_lb_listener.https, aws_ecs_service.api]
}
