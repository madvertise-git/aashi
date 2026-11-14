#!/usr/bin/env bash
# Runs a one-off task to completion and fails if it did not exit cleanly.
# Usage: run-task.sh <task-definition-arn> <command...>
# Needs CLUSTER, SUBNETS (comma-separated) and SECURITY_GROUP in the environment.
set -euo pipefail
definition=$1
shift
command=$(jq --compact-output --null-input '$ARGS.positional' --args "$@")

task=$(aws ecs run-task \
  --cluster "$CLUSTER" \
  --task-definition "$definition" \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$SUBNETS],securityGroups=[$SECURITY_GROUP],assignPublicIp=DISABLED}" \
  --overrides "{\"containerOverrides\":[{\"name\":\"tasks\",\"command\":$command}]}" \
  --query 'tasks[0].taskArn' --output text)
echo "Started $task"

aws ecs wait tasks-stopped --cluster "$CLUSTER" --tasks "$task"
code=$(aws ecs describe-tasks --cluster "$CLUSTER" --tasks "$task" --query 'tasks[0].containers[0].exitCode' --output text)
if [ "$code" != "0" ]; then
  reason=$(aws ecs describe-tasks --cluster "$CLUSTER" --tasks "$task" --query 'tasks[0].stoppedReason' --output text)
  echo "::error::Task failed (exit code $code): $reason. Logs are in CloudWatch under /$PREFIX/tasks."
  exit 1
fi
echo "Task finished."
