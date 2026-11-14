# Copy these into the GitHub environment's variables (see README.md).
output "deploy_role_arn" {
  value = aws_iam_role.deploy.arn
}

output "region" {
  value = var.region
}

output "cluster" {
  value = aws_ecs_cluster.main.name
}

output "ecr_registry" {
  value = split("/", aws_ecr_repository.app["api"].repository_url)[0]
}

output "name_prefix" {
  value = local.prefix
}

output "private_subnets" {
  value = join(",", aws_subnet.private[*].id)
}

output "app_security_group" {
  value = aws_security_group.app.id
}

output "url" {
  value = "https://${var.domain}"
}
