# Deployment patterns

This doc covers the 4 deployment patterns for `gitagent`
and the tradeoffs of each.

## Pattern 1: Per-repo webhook server

A single Hono server that:
- Receives GitHub webhooks at `/webhook`
- Loads manifests from `.github/agents/<name>.md` of the
  receiving repo
- Dispatches to the matching manifest
- Runs the agent
- Returns the result

**Pros:**
- Simple. One server, one repo.
- Fast. Webhook is instant.
- Local. No external service.

**Cons:**
- Need to run the server somewhere (VPS, K8s, Fly.io)
- Need to handle authentication (GitHub App)
- Need to handle secrets (env vars)
- Scales per-repo, not per-agent

**Use when:** you have 1-10 repos. You want simple. You
control the infrastructure.

## Pattern 2: GitHub Actions (per-agent)

A GitHub Actions workflow per agent that:
- Triggers on the matching event
- Sets up Node.js
- Installs `gitagent`
- Loads the manifest
- Runs the agent
- Posts the result

**Pros:**
- Zero infrastructure. GitHub runs it.
- Free for public repos. Cheap for private.
- Scales automatically.
- Logs are in GitHub.

**Cons:**
- Slow (cold start ~30s)
- Limited (no long-running, max 6h)
- Cost ($0.008/minute for Linux)
- Secrets need to be in GitHub

**Use when:** you have many repos. You want zero
infrastructure. The agent runs < 6h.

## Pattern 3: Serverless (Lambda, Cloud Run)

A serverless function that:
- Receives the webhook
- Loads the manifest from S3/GCS
- Runs the agent
- Returns the result

**Pros:**
- Zero ops. Cloud runs it.
- Cheap (pay per use).
- Auto-scales.

**Cons:**
- Cold start (1-5s)
- Vendor lock-in (AWS, GCP)
- Stateless (no memory between runs)
- Complex (IAM, secrets, etc.)

**Use when:** you have many agents. You want zero ops. You
trust the cloud.

## Pattern 4: Self-hosted (Kubernetes, Docker)

A Docker container running the webhook server, deployed to
K8s/Docker.

**Pros:**
- Full control. You own the infra.
- Portable (any cloud, any K8s).
- Stateful (memory between runs).

**Cons:**
- Complex (K8s, Docker, ingress)
- Cost (need to run 24/7)
- Ops (monitoring, logging, alerting)

**Use when:** you have many agents. You need state. You
control the infrastructure.

## The 4 patterns together

The 4 are the deployment. The deployment is the operation.
The operation is the scale.

| Pattern | Ops | Cost | State | Best for |
|---|---|---|---|---|
| Per-repo webhook | Medium | Low | Yes | 1-10 repos |
| GitHub Actions | Low | Low | No | Many repos |
| Serverless | Low | Lowest | No | Many agents |
| Self-hosted | High | Medium | Yes | Full control |

The deployment that matches the need is the right
deployment.

## The 80/20

80% of the value comes from:
- GitHub Actions (zero infra, fast to set up)
- Per-repo webhook (full control)

20% comes from:
- Serverless (cheapest at scale)
- Self-hosted (most flexible)

Start with GitHub Actions. Add the others as you grow.

## The lesson

4 patterns. 1 deployment. 1 lesson: pick the right one.

The deployment that matches the need is the right
deployment. The deployment that doesn't match is the wrong
deployment.

The agent era is here. The deployment is the design. The
design is the choice. The choice is the discipline.
