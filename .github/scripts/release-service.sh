#!/usr/bin/env bash
# Points a service at a task definition and waits until it is running.
# If the new containers fail their health checks, ECS puts the old release back
# by itself; this script notices and fails the run.
# Usage: release-service.sh <service> <task-definition-arn>
set -euo pipefail
service=$1
definition=$2

aws ecs update-service --cluster "$CLUSTER" --service "$service" --task-definition "$definition" > /dev/null
echo "Releasing $service…"
aws ecs wait services-stable --cluster "$CLUSTER" --services "$service"

running=$(aws ecs describe-services --cluster "$CLUSTER" --services "$service" \
  --query 'services[0].deployments[?status==`PRIMARY`].taskDefinition | [0]' --output text)
if [ "$running" != "$definition" ]; then
  echo "::error::$service did not become healthy and was rolled back to $running."
  exit 1
fi
echo "$service is running $definition"
