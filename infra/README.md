# Infrastructure

OpenTofu code for one environment of Aashi on AWS in Mumbai (`ap-south-1`), with Cloudflare in front.

**Status: passes `tofu validate`, never applied.** Validation checks the code is well-formed; it does not prove
the resources will create cleanly. No AWS or Cloudflare account existed when this was written, so nothing here has
created a real resource yet. Expect to fix small things on the first `tofu apply`, and read the
plan before approving it.

## What it creates

| File | What |
| --- | --- |
| `network.tf` | A private network across two zones, a NAT gateway, and firewall rules: the load balancer accepts only Cloudflare; the database and cache accept only the app |
| `data.tf` | One encryption key; Aurora PostgreSQL 17 (Serverless v2, two instances, 14 days of point-in-time recovery, deletion protection); Valkey (two nodes, encrypted, password); a private encrypted S3 bucket; every secret in Secrets Manager |
| `app.tf` | Image registries, the HTTPS load balancer and its certificate, the Cloudflare DNS records, the ECS cluster with the `api` and `web` services, and a `tasks` definition for migrations and the one-off database bootstrap |
| `iam.tf` | Least-privilege roles. GitHub Actions deploys by assuming a role; no AWS keys are stored anywhere |
| `monitoring.tf` | Four starter alarms, sent by email: server errors, no healthy web containers, database CPU, cache memory |

Only the web app is reachable from the internet. It forwards `/api/*` to the API inside the network.
The running API never holds the database owner or administrator passwords; only the one-off `tasks` definition does.

## Rough monthly cost at rest

About ₹15,000–20,000 (US$180–230) before traffic: NAT gateway, load balancer, two small Aurora instances, two
small cache nodes, four small containers. Check the AWS pricing calculator before applying.

## First-time setup (the owner's steps)

1. **Accounts.** An AWS account, a Cloudflare account with the domain added as a zone, and a Cloudflare API token
   with *DNS edit* on that zone.
2. **State bucket** (once, by hand; it holds secrets, so it must be private and encrypted):
   ```bash
   aws s3api create-bucket --bucket aashi-tofu-state-<account-id> --region ap-south-1 \
     --create-bucket-configuration LocationConstraint=ap-south-1
   aws s3api put-bucket-versioning --bucket aashi-tofu-state-<account-id> --versioning-configuration Status=Enabled
   aws s3api put-public-access-block --bucket aashi-tofu-state-<account-id> \
     --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
   ```
3. **Configure.** Copy `environments/production.tfvars.example` to `production.tfvars` and
   `production.backend.hcl.example` to `production.backend.hcl`, and fill both in. Neither is committed.
4. **Create everything** (about 20 minutes):
   ```bash
   cd infra
   export TF_VAR_cloudflare_api_token=...
   tofu init -backend-config=environments/production.backend.hcl
   tofu plan  -var-file=environments/production.tfvars   # read it
   tofu apply -var-file=environments/production.tfvars
   ```
   The two services will sit unhealthy until the first deploy; that is expected.
5. **Tell GitHub.** In the repository, create an environment named `production`, add yourself as a required
   reviewer, and add these environment *variables* from `tofu output`:

   | Variable | Output |
   | --- | --- |
   | `AWS_DEPLOY_ROLE_ARN` | `deploy_role_arn` |
   | `AWS_REGION` | `region` |
   | `ECR_REGISTRY` | `ecr_registry` |
   | `NAME_PREFIX` | `name_prefix` |
   | `ECS_CLUSTER` | `cluster` |
   | `PRIVATE_SUBNETS` | `private_subnets` |
   | `APP_SECURITY_GROUP` | `app_security_group` |
   | `APP_URL` | `url` |

   No secrets go into GitHub.
6. **Cloudflare.** Set the zone's SSL mode to *Full (strict)*.
7. **Bootstrap the database** (once): Actions → Deploy → Run workflow → `bootstrap`.
8. **Deploy:** Actions → Deploy → Run workflow → `deploy`.

## Deploying and rolling back

- **Deploy** builds both images for the chosen commit, applies migrations, releases the API and then the web app,
  and checks the live site. If new containers fail their health checks, ECS restores the previous release by itself
  and the run fails.
- **Roll back** with the same workflow: choose `rollback` and give the commit SHA of an earlier release. It skips
  the build and migrations. This is safe because migrations follow expand → backfill → switch → contract, so the
  previous release still works against the newer schema.
- **Rollback has not been rehearsed.** Do it once on purpose after the first two deploys; "tested rollback" is one
  of the conditions for Phase 3 being done.

## Not here yet

- A preview environment per pull request.
- Amazon SES for email, and the standby region in Hyderabad.
- Grafana, Sentry and tracing (the operations work). The alarms above are a starting point only.
- The API is not directly reachable from the internet. Webhooks from Meta, payment and telephony providers will
  need a public path to it, added with the first of those modules.
