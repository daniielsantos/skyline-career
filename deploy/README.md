# World deployment

The World image is built once by GitHub Actions for `linux/amd64` (VPS).
Hosts pull the same immutable digest; they never run
`npm ci` or build TypeScript during deployment.

Pi / `linux/arm64` staging and QEMU multi-arch builds are retired.

## Release policy

- Successful CI on `main` builds and publishes the amd64 image.
- A published GitHub Release **builds** the amd64 image for that tag
  (`sha-<commit>` + `v*` + `main`) and promotes to the VPS after Environment
  approval. It does not wait on a sibling `workflow_run` — that race froze
  releases when a follow-up push cancelled CI for the bump SHA.
- After a release bump, the follow-up `workflow_run` on that same SHA **skips**
  the image build when `HEAD` already has a `v*` tag (avoids a duplicate
  rebuild; production deploy still only runs on `release` / dispatch).
- CI ignores `docs/agent-context/**` and `.cursor/**` so handoff-note commits
  do not rebuild the World image. `release:desktop --bump` writes the
  `01-current-state.md` line in the same bump commit.
- Production creates a PostgreSQL custom-format dump before replacing the API.
- `world-api` is the single writer: it owns HTTP commands and the background
  economy clock. A failed health check rolls the application image back, but
  never restores or deletes a database volume.
- **Two-queue lock (pulse vs Accept):** MP latency fixes in `withCareerWrite` /
  Postgres command slice live only after **world-api** is redeployed. A desktop
  release alone does not change the hosted world lock. After deploy, Accept
  during pulse should show `lockWait` on the order of the tick (~2s), not the
  ~30s PG save.
- **Forced +Nd on PG:** `/api/tick` must mutate live RAM (no
  `isolatePostgresWorldSnapshot` on `catchUp`). Desktop-only update is not
  enough for MP — redeploy **world-api** or Day stays stuck while the client
  JSON briefly lies about the tick.

## Host preparation

The VPS needs Docker Compose v2 and a clone of this repository. Keep the
host-specific `.env` in the clone; it is never fetched from GitHub.

```bash
cd /opt/airframe
test -f .env
docker compose version
git remote get-url origin
```

The SSH deploy account must own the clone and be able to run Docker. Membership
in the `docker` group is effectively root access, so use a dedicated SSH key and
do not reuse a personal key.

Install that key in `~/.ssh/authorized_keys` on the VPS. Record the host key
from a trusted connection using the exact hostname or IP that the workflow will
use:

```bash
ssh-keyscan -H production-hostname-or-ip
```

Verify the fingerprint interactively before saving the output as a secret.

## GitHub Environments

Create `production` under repository Settings → Environments.
Configure the following Environment variables:

- `DEPLOY_HOST`: public hostname/IP for the VPS.
- `DEPLOY_USER`: SSH deploy account.
- `DEPLOY_PATH`: repository path, normally `/opt/airframe`.
- `DEPLOY_HEALTH_URL`: public health endpoint, e.g.
  `https://world.playairframe.com/api/health`.

Configure these Environment secrets:

- `DEPLOY_SSH_KEY`: private Ed25519 deploy key, including header/footer.
- `DEPLOY_KNOWN_HOSTS`: verified `known_hosts` line for `DEPLOY_HOST`.

Protect `production` with a required reviewer and restrict it to release tags
or the `main` branch.

## First deployment

1. Commit and push the CI/CD files to `main`.
2. Wait for `CI` and `World deploy / Build amd64 image`.
3. Publish a desktop release. Approve `production` from the workflow run.
4. Confirm API, Postgres and the external production health endpoint.
   `/api/health` must report `"worldWriter":"api"`; a normal deployment must
   not have a `skyline-career-world-worker` container.

Pre-deploy dumps are retained for 14 days in
`$DEPLOY_BACKUP_DIR` or `<DEPLOY_PATH>/backups/predeploy`. Ensure this directory
is included in the existing encrypted restic/R2 backup policy.

## Disk maintenance

Remote hosts pull the final multi-stage image and do not need Docker build
cache. To inspect usage and safely remove only unused build cache:

```bash
docker system df
docker builder prune -af
docker system df
```

This does not remove running containers, active images, or named volumes. Do
not use `docker system prune --volumes` on a world host.

## Manual redeploy or rollback

The workflow supports `Run workflow` with `target=production` and a Git ref.
It still builds and deploys by immutable digest. For a host-side emergency
rollback, run the same sequential deploy script with a previous digest:

```bash
previous='ghcr.io/daniielsantos/skyline-career-world@sha256:...'
bash scripts/deploy-world.sh \
  --image "$previous" \
  --health-url https://world.playairframe.com/api/health
```

Database restoration is deliberately manual because application rollback does
not imply that destructive loss of newer database writes is acceptable.

## Single-writer invariant

Normal lab and production stacks run only `world-api` plus Postgres.
`CAREER_HEADLESS_PULSE=1` makes the API advance the world even with zero
clients. The old `world-worker` service remains behind the explicit
`legacy-worker` Compose profile for diagnostics only; never run it beside the
normal API writer.

During migration, `deploy-world.sh` stops an existing legacy worker before
replacing the API and removes that container after the new API reports healthy.
