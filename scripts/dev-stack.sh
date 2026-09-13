#!/usr/bin/env bash
# Brings up everything needed to run the full Hardpull scenario on one machine:
# Postgres, Redis, an Anvil node with the contracts deployed, the CRE local gateway, and the API.
#
#   ./scripts/dev-stack.sh up      # start it all, then run the T-090 gate
#   ./scripts/dev-stack.sh down    # stop everything this script started
#
# This is a LOCAL REHEARSAL stack. It runs with HARDPULL_X402_MODE=disabled (payments skipped)
# and against cre/cmd/localgateway (same handler code, but no TEE). Neither is acceptable for a
# demo recording or a deployment -- see docs/demo-video-script.md.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="${TMPDIR:-/tmp}/hardpull-dev"
ANVIL_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

log() { printf '\033[1;34m==>\033[0m %s\n' "$1"; }

wait_for() { # wait_for <description> <command...>
  local what="$1"; shift
  for _ in $(seq 1 60); do
    if "$@" >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  echo "timed out waiting for $what" >&2
  return 1
}

up() {
  mkdir -p "$RUN_DIR"

  log "Postgres and Redis"
  docker start hardpull-postgres >/dev/null 2>&1 || \
    docker run -d --name hardpull-postgres -e POSTGRES_PASSWORD=hardpull -e POSTGRES_DB=hardpull \
      -p 55432:5432 postgres:16-alpine >/dev/null
  docker start hardpull-redis >/dev/null 2>&1 || \
    docker run -d --name hardpull-redis -p 56379:6379 redis:7-alpine >/dev/null
  wait_for "postgres" docker exec hardpull-postgres pg_isready -U postgres

  log "Migrations"
  DATABASE_URL=postgres://postgres:hardpull@localhost:55432/hardpull \
    pnpm --filter @hardpull/api exec node-pg-migrate up -m src/db/migrations >/dev/null

  log "Anvil"
  pkill -f "anvil" >/dev/null 2>&1 || true
  nohup anvil --silent >"$RUN_DIR/anvil.log" 2>&1 &
  wait_for "anvil" cast block-number --rpc-url http://127.0.0.1:8545

  log "CRE keys (keygen refuses to clobber existing ones, so this is safe to re-run)"
  (cd "$ROOT/cre" && go run ./cmd/keygen >"$RUN_DIR/keygen.log" 2>&1) || true
  # keygen records the public halves here; the signer address must be known BEFORE deploying,
  # because VerdictAttestations.creSigner is immutable.
  CRE_SIGNER=$(node -e "
    try { process.stdout.write(require('$ROOT/cre/.keys.public.json').attestationSignerAddress); }
    catch { process.exit(1); }" 2>/dev/null) || CRE_SIGNER=""
  [ -n "$CRE_SIGNER" ] && log "  attestation signer: $CRE_SIGNER"

  log "Deploying contracts"
  # `env` rather than an inline assignment prefix: bash only treats VAR=value as an assignment
  # when it is literal at parse time, so ${CRE_SIGNER:+...} would be read as the command name.
  (cd "$ROOT/contracts" && env DEPLOYER_PRIVATE_KEY="$ANVIL_KEY" \
     ${CRE_SIGNER:+CRE_SIGNER_ADDRESS="$CRE_SIGNER"} \
     forge script script/Deploy.s.sol:Deploy --rpc-url http://127.0.0.1:8545 --broadcast >"$RUN_DIR/deploy.log" 2>&1)

  log "Propagating addresses into env files"
  node "$ROOT/scripts/sync-deployments.mjs" --chain 31337

  log "CRE local gateway (NOT a TEE)"
  pkill -f "localgateway" >/dev/null 2>&1 || true
  (cd "$ROOT/cre" && nohup go run ./cmd/localgateway >"$RUN_DIR/localgateway.log" 2>&1 &)

  log "API"
  pkill -f "tsx src/index.ts" >/dev/null 2>&1 || true
  # The API reads process.env, not a dotenv file, so the contract addresses that
  # sync-deployments.mjs just wrote into api/.env have to be exported here -- otherwise
  # /health/ready correctly reports "one or more *_ADDRESS vars not set" and every chain-backed
  # route 503s.
  (
    cd "$ROOT/api"
    set -a
    # shellcheck disable=SC1091
    [ -f .env ] && . ./.env
    set +a
    DATABASE_URL=postgres://postgres:hardpull@localhost:55432/hardpull \
    REDIS_URL=redis://localhost:56379 JWT_SECRET=local-dev-secret \
    SEPOLIA_RPC_URL=http://127.0.0.1:8545 DEPLOYER_PRIVATE_KEY=$ANVIL_KEY \
    CRE_GATEWAY_URL=http://127.0.0.1:8546 CRE_WORKFLOW_ID=local \
    CRE_CALLER_PRIVATE_KEY=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d \
    HARDPULL_X402_MODE=disabled \
    nohup pnpm exec tsx src/index.ts >"$RUN_DIR/api.log" 2>&1 &
  )
  wait_for "api" curl -sf http://localhost:3001/health

  echo
  log "Up. Logs in $RUN_DIR"
  curl -s http://localhost:3001/health/ready | head -c 400; echo; echo
  log "Run the gate:  (cd api && pnpm exec tsx src/scripts/e2e-scenario.ts --runs 3)"
}

down() {
  log "Stopping"
  pkill -f "tsx src/index.ts" >/dev/null 2>&1 || true
  pkill -f "localgateway" >/dev/null 2>&1 || true
  pkill -f "anvil" >/dev/null 2>&1 || true
  docker stop hardpull-postgres hardpull-redis >/dev/null 2>&1 || true
  log "Stopped. Containers kept (docker rm hardpull-postgres hardpull-redis to remove)."
}

case "${1:-up}" in
  up) up ;;
  down) down ;;
  *) echo "usage: $0 [up|down]" >&2; exit 1 ;;
esac
