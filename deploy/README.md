# World deployment

The World image is built once by GitHub Actions for `linux/amd64` (VPS) and
`linux/arm64` (Pi 4). Hosts pull the same immutable digest; they never run
`npm ci` or build TypeScript during deployment.

## Release policy

- Successful CI on `main` builds an image and deploys it to `staging`.
- A published GitHub Release builds the tagged revision and waits for approval
  on the `production` GitHub Environment.
- Production creates a PostgreSQL custom-format dump before replacing the API.
- API and worker update sequentially. A failed health check rolls the
  application image back, but never restores or deletes a database volume.

## Host preparation

Both hosts need Docker Compose v2 and a clone of this repository. Keep the
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

The Pi deployment uses its normal OpenSSH daemon over the Tailscale network.
Tailscale SSH must be disabled or it intercepts port 22 and rejects the
key-based CI identity:

```bash
sudo tailscale set --ssh=false
sudo systemctl enable --now ssh
```

Install that key in `~/.ssh/authorized_keys` on each target. Record the host key
from a trusted connection using the exact hostname or IP that the workflow will
use:

```bash
ssh-keyscan -H staging-pi-tailnet-name
ssh-keyscan -H production-hostname-or-ip
```

Verify the fingerprint interactively before saving the output as a secret.

## GitHub Environments

Create `staging` and `production` under repository Settings → Environments.
Configure the following Environment variables in both:

- `DEPLOY_HOST`: Tailscale hostname/IP for staging; public hostname/IP for VPS.
- `DEPLOY_USER`: SSH deploy account.
- `DEPLOY_PATH`: repository path, normally `/opt/airframe`.
- `DEPLOY_HEALTH_URL`: public health endpoint. Staging currently uses
  `https://staging-world.playairframe.com/api/health`.

Configure these Environment secrets:

- `DEPLOY_SSH_KEY`: private Ed25519 deploy key, including header/footer.
- `DEPLOY_KNOWN_HOSTS`: verified `known_hosts` line for `DEPLOY_HOST`.

Add the repository secrets below for the temporary Tailscale runner:

- `TS_OAUTH_CLIENT_ID`
- `TS_OAUTH_SECRET`

Protect `production` with a required reviewer and restrict it to release tags
or the `main` branch. Do not protect `staging` with manual approval.

## Tailscale policy for staging

Create a `tag:ci` owner and an OAuth client with writable `auth_keys` scope for
that tag. Limit the tag to TCP 22 on the Pi. A minimal policy fragment is:

```json
{
  "tagOwners": {
    "tag:ci": ["autogroup:admin"]
  },
  "hosts": {
    "airframe-pi": "100.x.y.z"
  },
  "grants": [
    {
      "src": ["tag:ci"],
      "dst": ["airframe-pi"],
      "ip": ["tcp:22"]
    }
  ]
}
```

Merge this fragment into the existing tailnet policy; do not replace unrelated
rules. If device approval or Tailnet Lock is enabled, authorize the ephemeral
CI identity as required by that policy.

## First deployment

1. Commit and push the CI/CD files to `main`.
2. Wait for `CI`, `World deploy / Build multi-architecture image`, and
   `Deploy Pi staging`.
   The first image extraction can take 15–45 minutes on a Pi using microSD;
   subsequent deploys reuse Docker layers.
3. Confirm the Pi is using the digest recorded in `/opt/airframe/.env.deploy`:

   ```bash
   cat /opt/airframe/.env.deploy
   docker inspect --format '{{.Config.Image}}' skyline-career-world-api
   curl -fsS https://staging-world.playairframe.com/api/health
   ```

4. Publish the next desktop release. Approve `production` from the workflow run
   only after staging is healthy.
5. Confirm API, worker, Postgres and the external production health endpoint.

Pre-deploy dumps are retained for 14 days in
`$DEPLOY_BACKUP_DIR` or `<DEPLOY_PATH>/backups/predeploy`. Ensure this directory
is included in the existing encrypted restic/R2 backup policy.

## Pi disk maintenance

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

The workflow supports `Run workflow` with a target and Git ref. It still builds
and deploys by immutable digest. For a host-side emergency rollback, run the
same sequential deploy script with a previous digest:

```bash
previous='ghcr.io/daniielsantos/skyline-career-world@sha256:...'
bash scripts/deploy-world.sh \
  --image "$previous" \
  --health-url https://world.playairframe.com/api/health
```

Database restoration is deliberately manual because application rollback does
not imply that destructive loss of newer database writes is acceptable.
