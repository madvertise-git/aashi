#!/usr/bin/env bash
# Copies the newest task definition in a family, swaps in a new image, registers
# it and prints the new definition's ARN.
# Usage: register-task-definition.sh <family> <image>
set -euo pipefail
family=$1
image=$2

aws ecs describe-task-definition --task-definition "$family" --query taskDefinition \
  | jq --arg image "$image" '
      del(.taskDefinitionArn, .revision, .status, .requiresAttributes, .compatibilities, .registeredAt, .registeredBy)
      | .containerDefinitions[0].image = $image' > "/tmp/$family.json"

aws ecs register-task-definition --cli-input-json "file:///tmp/$family.json" \
  --query taskDefinition.taskDefinitionArn --output text
