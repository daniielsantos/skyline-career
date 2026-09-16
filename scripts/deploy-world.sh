#!/usr/bin/env bash
set -Eeuo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/deploy-world.sh --image IMAGE[@DIGEST] --health-url URL [--backup]

Deploys the single-writer world-api without rebuilding or touching Docker
volumes. Any legacy world-worker is stopped before the API is replaced and
removed only after health checks pass. The repository must already be checked
out at the intended revision and contain a host-specific, gitignored .env file.
EOF
}

image=''
health_url=''
backup=0

while (($#)); do
  case "$1" in
    --image)
      image="${2:-}"
      shift 2
      ;;
    --health-url)
      health_url="${2:-}"
      shift 2
      ;;
    --backup)
      backup=1
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ -z "$image" || -z "$health_url" ]]; then
  usage >&2
  exit 2
fi
if [[ "$image" != ghcr.io/daniielsantos/skyline-career-world:* &&
      "$image" != ghcr.io/daniielsantos/skyline-career-world@sha256:* ]]; then
  echo "Refusing unexpected world image: $image" >&2
  exit 2
fi
if [[ "$health_url" != https://* && "$health_url" != http://127.0.0.1:* ]]; then
  echo "Health URL must use HTTPS or loopback HTTP: $health_url" >&2
  exit 2
fi

root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

if [[ ! -f .env ]]; then
  echo "Missing $root/.env; deployment secrets must be provisioned on the host." >&2
  exit 1
fi

deploy_env="$root/.env.deploy"
compose=(
  docker compose
  --env-file "$root/.env"
  --env-file "$deploy_env"
  -f "$root/docker-compose.yml"
  -f "$root/docker-compose.prod.yml"
  --profile world
)

# Compose requires every explicit env file to exist.
touch "$deploy_env"

previous_image="$(
  awk -F= '$1 == "CAREER_WORLD_IMAGE" { sub(/^[^=]*=/, ""); print; exit }' \
    "$deploy_env"
)"
if [[ -z "$previous_image" ]]; then
  previous_image="$(
    docker inspect --format '{{.Config.Image}}' skyline-career-world-api \
      2>/dev/null || true
  )"
fi

check_api_contract() {
  local url="$1"
  local require_writer="${2:-1}"
  docker exec skyline-career-world-api node -e '
    const url = process.argv[1];
    const requireWriter = process.argv[2] === "1";
    const timeout = setTimeout(() => process.exit(2), 10000);
    fetch(url)
      .then(async (res) => {
        const body = await res.json();
        const valid =
          res.ok &&
          body.ok === true &&
          body.worldFixed === true &&
          body.needsProfile === false &&
          body.store === "postgres" &&
          (!requireWriter || body.worldWriter === "api");
        if (!valid) {
          console.error(JSON.stringify({ status: res.status, body }));
          process.exit(1);
        }
      })
      .catch((err) => {
        console.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      })
      .finally(() => clearTimeout(timeout));
  ' "$url" "$require_writer"
}

wait_for_api() {
  local require_writer="${1:-1}"
  local attempt
  for attempt in $(seq 1 36); do
    if [[ "$(docker inspect --format '{{.State.Health.Status}}' \
      skyline-career-world-api 2>/dev/null || true)" == healthy ]] &&
      check_api_contract 'http://127.0.0.1:8787/api/health' "$require_writer"; then
      return 0
    fi
    sleep 5
  done
  return 1
}

deploy_image() {
  local target_image="$1"
  local require_writer="${2:-1}"
  CAREER_WORLD_IMAGE="$target_image" "${compose[@]}" up -d \
    --no-deps --no-build --force-recreate world-api || return 1
  wait_for_api "$require_writer" || return 1
  check_api_contract "$health_url" "$require_writer" || return 1
}

write_deploy_env() {
  local target_image="$1"
  printf 'CAREER_WORLD_IMAGE=%s\n' "$target_image" >"$deploy_env.tmp"
  mv "$deploy_env.tmp" "$deploy_env"
}

if ((backup)); then
  backup_dir="${DEPLOY_BACKUP_DIR:-$root/backups/predeploy}"
  mkdir -p "$backup_dir"
  backup_path="$backup_dir/world-$(date -u +%Y%m%dT%H%M%SZ).dump"
  echo "[deploy] creating pre-deploy PostgreSQL backup: $backup_path"
  "${compose[@]}" exec -T postgres sh -c \
    'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' >"$backup_path.tmp"
  test -s "$backup_path.tmp"
  mv "$backup_path.tmp" "$backup_path"
  find "$backup_dir" -type f -name 'world-*.dump' -mtime +14 -delete
fi

echo "[deploy] pulling $image"
CAREER_WORLD_IMAGE="$image" "${compose[@]}" pull world-api

# Transition invariant: never let the legacy worker overlap the API writer.
docker stop skyline-career-world-worker >/dev/null 2>&1 || true

echo "[deploy] updating single-writer API and checking health"
if deploy_image "$image" 1; then
  docker rm -f skyline-career-world-worker >/dev/null 2>&1 || true
  write_deploy_env "$image"
  echo "[deploy] healthy: $image"
  exit 0
fi

echo "[deploy] failed health checks for $image" >&2
if [[ -z "$previous_image" || "$previous_image" == "$image" ]]; then
  echo "[deploy] no distinct previous image is available for rollback" >&2
  exit 1
fi

echo "[deploy] rolling application back to $previous_image" >&2
if ! docker image inspect "$previous_image" >/dev/null 2>&1; then
  CAREER_WORLD_IMAGE="$previous_image" "${compose[@]}" pull world-api || true
fi
if deploy_image "$previous_image" 0; then
  docker rm -f skyline-career-world-worker >/dev/null 2>&1 || true
  write_deploy_env "$previous_image"
  echo "[deploy] rollback healthy; database backup was not restored automatically" >&2
else
  echo "[deploy] rollback also failed; manual intervention is required" >&2
fi
exit 1
