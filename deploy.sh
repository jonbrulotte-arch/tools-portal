#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Tools Portal deployment script
#
#   ./deploy.sh install            First-time setup: create .env, build, start
#   ./deploy.sh update             Back up DB, pull latest code, rebuild, restart
#                                  (rolls back automatically if the new version
#                                  doesn't come up healthy)
#   ./deploy.sh rollback           Go back to the previous image (optionally DB)
#   ./deploy.sh backup             Database dump + copy of in-app backups
#   ./deploy.sh restore-db FILE    Restore a database dump
#   ./deploy.sh status | logs | start | stop | restart | env-check | help
#
# Run ./deploy.sh help for all options.
# ─────────────────────────────────────────────────────────────────────────────
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

readonly ENV_FILE=".env"
readonly ENV_EXAMPLE=".env.example"
readonly STATE_DIR=".deploy"
readonly DB_BACKUP_DIR="$STATE_DIR/db-backups"
readonly APP_BACKUP_DIR="$STATE_DIR/app-backups"
readonly LOG_FILE="$STATE_DIR/deploy.log"
readonly LOCK_FILE="$STATE_DIR/deploy.lock"
readonly IMAGE="tools-portal"
readonly APP_PORT=8016
readonly DEFAULT_URL="http://10.0.10.106:${APP_PORT}"

# Options (set by flags)
ASSUME_YES=false
BRANCH=""
OPT_URL=""
OPT_ADMIN_EMAIL=""
OPT_ADMIN_NAME=""
OPT_ADMIN_PASSWORD=""
NO_PULL=false
SKIP_BACKUP=false
FORCE=false
WITH_DB=""
HEALTH_TIMEOUT=300
KEEP_DUMPS=10
LOG_SERVICE="app"
POSITIONAL=()

# ─── Output ──────────────────────────────────────────────────────────────────
if [[ -t 1 ]]; then
  C_RESET=$'\e[0m' C_BOLD=$'\e[1m' C_DIM=$'\e[2m' C_RED=$'\e[31m' C_GREEN=$'\e[32m' C_YELLOW=$'\e[33m' C_BLUE=$'\e[34m'
else
  C_RESET="" C_BOLD="" C_DIM="" C_RED="" C_GREEN="" C_YELLOW="" C_BLUE=""
fi
INTERACTIVE=false
[[ -t 0 ]] && INTERACTIVE=true

ts()    { date '+%Y-%m-%d %H:%M:%S'; }
step()  { printf '\n%s==> %s%s\n' "$C_BOLD$C_BLUE" "$*" "$C_RESET"; }
info()  { printf '%s[%s]%s %s\n' "$C_DIM" "$(ts)" "$C_RESET" "$*"; }
ok()    { printf '%s✔ %s%s\n' "$C_GREEN" "$*" "$C_RESET"; }
warn()  { printf '%s⚠ %s%s\n' "$C_YELLOW" "$*" "$C_RESET" >&2; }
err()   { printf '%s✖ %s%s\n' "$C_RED" "$*" "$C_RESET" >&2; }
die()   { err "$*"; exit 1; }

on_error() {
  local code=$? line=${1:-?}
  err "Command failed (exit $code) at deploy.sh line $line: ${BASH_COMMAND}"
  [[ -f "$LOG_FILE" ]] && err "Full log: $SCRIPT_DIR/$LOG_FILE"
  exit "$code"
}
trap 'on_error $LINENO' ERR

start_logging() {
  mkdir -p "$STATE_DIR"
  chmod 700 "$STATE_DIR" 2>/dev/null || true
  {
    printf '\n══════ %s  deploy.sh %s ══════\n' "$(ts)" "$*"
  } >>"$LOG_FILE"
  # Mirror everything to the log file (colours stripped).
  exec > >(tee >(sed -u 's/\x1b\[[0-9;]*m//g' >>"$LOG_FILE")) 2>&1
}

confirm() {
  local prompt=$1
  $ASSUME_YES && return 0
  $INTERACTIVE || die "$prompt — re-run with --yes to confirm non-interactively."
  local reply
  read -r -p "$prompt [y/N] " reply
  [[ $reply =~ ^[Yy]([Ee][Ss])?$ ]]
}

ask() { # ask VAR "Prompt" "default"
  local __var=$1 prompt=$2 default=${3:-} reply
  if ! $INTERACTIVE || $ASSUME_YES; then printf -v "$__var" '%s' "$default"; return; fi
  if [[ -n $default ]]; then read -r -p "$prompt [$default]: " reply; else read -r -p "$prompt: " reply; fi
  printf -v "$__var" '%s' "${reply:-$default}"
}

ask_secret() { # ask_secret VAR "Prompt"
  local __var=$1 prompt=$2 a b
  while :; do
    read -r -s -p "$prompt: " a; echo
    [[ -z $a ]] && { printf -v "$__var" ''; return; }
    read -r -s -p "Repeat to confirm: " b; echo
    [[ $a == "$b" ]] && { printf -v "$__var" '%s' "$a"; return; }
    warn "Entries didn't match, try again."
  done
}

# ─── Helpers ─────────────────────────────────────────────────────────────────
have() { command -v "$1" >/dev/null 2>&1; }

COMPOSE=()
detect_compose() {
  if docker compose version >/dev/null 2>&1; then
    COMPOSE=(docker compose)
  elif have docker-compose; then
    COMPOSE=(docker-compose)
    warn "Using legacy docker-compose v1; Docker Compose v2 (docker compose) is recommended."
  else
    die "Docker Compose is not installed. Install the Docker Compose plugin: https://docs.docker.com/compose/install/"
  fi
}
compose() { "${COMPOSE[@]}" "$@"; }

env_get() { # value of KEY in .env (last occurrence, quotes stripped)
  local key=$1 line val
  [[ -f $ENV_FILE ]] || return 0
  line=$(grep -E "^[[:space:]]*${key}=" "$ENV_FILE" | tail -n 1 || true)
  val=${line#*=}
  val=${val%$'\r'}
  if [[ $val =~ ^\'(.*)\'$ || $val =~ ^\"(.*)\"$ ]]; then val=${BASH_REMATCH[1]}; fi
  printf '%s' "$val"
}

env_set() { # env_set KEY VALUE  (replaces or appends; value written single-quoted when needed)
  local key=$1 value=$2 out tmp
  if [[ $value =~ ^[A-Za-z0-9_./:@+=,-]*$ ]]; then out=$value; else out="'$value'"; fi
  tmp=$(mktemp "$ENV_FILE.XXXXXX")
  KEY="$key" VAL="$out" awk '
    BEGIN { k = ENVIRON["KEY"]; v = ENVIRON["VAL"]; done = 0 }
    $0 ~ "^[[:space:]]*#?[[:space:]]*" k "=" && !done { print k "=" v; done = 1; next }
    { print }
    END { if (!done) print k "=" v }
  ' "$ENV_FILE" >"$tmp"
  cat "$tmp" >"$ENV_FILE"
  rm -f -- "$tmp"
}

gen_b64() { if have openssl; then openssl rand -base64 32; else head -c 32 /dev/urandom | base64; fi; }
gen_hex() { if have openssl; then openssl rand -hex 24; else head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n'; fi; }

app_version() {
  if have git && git rev-parse --git-dir >/dev/null 2>&1; then
    git describe --tags --always --dirty 2>/dev/null || git rev-parse --short HEAD
  else
    echo "unknown"
  fi
}
current_commit() { git rev-parse --short HEAD 2>/dev/null || echo "unknown"; }

app_cid() { compose ps -q app 2>/dev/null | head -n 1; }

image_exists() { docker image inspect "$1" >/dev/null 2>&1; }

prune_old() { # prune_old DIR GLOB KEEP
  local dir=$1 glob=$2 keep=$3 i
  local -a files=()
  mapfile -t files < <(ls -1t "$dir"/$glob 2>/dev/null || true)
  for ((i = keep; i < ${#files[@]}; i++)); do
    rm -f -- "${files[$i]}"
    info "Pruned old file ${files[$i]}"
  done
}

acquire_lock() {
  mkdir -p "$STATE_DIR"
  exec 9>"$LOCK_FILE"
  if have flock; then
    flock -n 9 || die "Another deploy.sh run is in progress (lock: $LOCK_FILE)."
  fi
}

# ─── Checks ──────────────────────────────────────────────────────────────────
preflight() {
  step "Pre-flight checks"
  have docker || die "Docker is not installed. See https://docs.docker.com/engine/install/ (e.g. curl -fsSL https://get.docker.com | sudo sh)."
  local out
  if ! out=$(docker info 2>&1); then
    if grep -qi "permission denied" <<<"$out"; then
      die "This user can't talk to Docker. Run with sudo, or add the user to the docker group (sudo usermod -aG docker \$USER, then log out and back in)."
    fi
    die "The Docker daemon is not running or not reachable:"$'\n'"$out"
  fi
  detect_compose
  ok "Docker $(docker version --format '{{.Server.Version}}' 2>/dev/null || echo '?') and $(compose version --short 2>/dev/null || echo compose) available"

  have git || warn "git is not installed; 'update' will not be able to pull new code."

  local avail_kb
  avail_kb=$(df -Pk . | awk 'NR==2 {print $4}')
  if [[ -n $avail_kb && $avail_kb -lt 3145728 ]]; then
    warn "Only $((avail_kb / 1024)) MB free on this disk; building the image needs about 3 GB."
  else
    ok "Disk space OK ($((avail_kb / 1024 / 1024)) GB free)"
  fi
}

check_port_free() {
  [[ -n $(app_cid) ]] && return 0
  if have ss && ss -ltnH "sport = :$APP_PORT" 2>/dev/null | grep -q .; then
    die "Port $APP_PORT is already in use by another process: $(ss -ltnpH "sport = :$APP_PORT" 2>/dev/null | head -n1)"
  fi
  ok "Port $APP_PORT is free"
}

# Validate .env. Prints problems; returns non-zero on errors.
check_env() {
  local errors=0 v perm
  if [[ ! -f $ENV_FILE ]]; then err "$ENV_FILE not found. Run ./deploy.sh install to create it."; return 1; fi

  perm=$(stat -c '%a' "$ENV_FILE" 2>/dev/null || echo 600)
  if [[ ${perm: -1} != 0 ]]; then
    warn "$ENV_FILE is readable by other users (mode $perm); tightening to 600."
    chmod 600 "$ENV_FILE" || true
  fi

  for k in AUTH_SECRET APP_ENCRYPTION_KEY POSTGRES_PASSWORD AUTH_URL APP_URL; do
    if [[ -z $(env_get "$k") ]]; then err ".env: $k is empty"; errors=$((errors + 1)); fi
  done

  v=$(env_get AUTH_SECRET)
  if [[ -n $v && ${#v} -lt 32 ]]; then err ".env: AUTH_SECRET is too short (use: openssl rand -base64 32)"; errors=$((errors + 1)); fi

  v=$(env_get APP_ENCRYPTION_KEY)
  if [[ -n $v ]] && [[ $(printf '%s' "$v" | base64 -d 2>/dev/null | wc -c) -ne 32 ]]; then
    err ".env: APP_ENCRYPTION_KEY must be 32 random bytes, base64-encoded (use: openssl rand -base64 32)"
    errors=$((errors + 1))
  fi

  v=$(env_get POSTGRES_PASSWORD)
  if [[ -n $v && ! $v =~ ^[A-Za-z0-9._~-]+$ ]]; then
    err ".env: POSTGRES_PASSWORD may only contain letters, digits and . _ ~ - (it is used inside a URL; use: openssl rand -hex 24)"
    errors=$((errors + 1))
  fi

  for k in AUTH_URL APP_URL; do
    v=$(env_get "$k")
    if [[ -n $v && ! $v =~ ^https?://[^/]+$ ]]; then err ".env: $k must look like http://host:port with no trailing slash (got '$v')"; errors=$((errors + 1)); fi
  done
  if [[ $(env_get AUTH_URL) != "$(env_get APP_URL)" ]]; then warn ".env: AUTH_URL and APP_URL differ; they should normally be the same address."; fi
  if [[ $(env_get AUTH_TRUST_HOST) != "true" ]]; then warn ".env: AUTH_TRUST_HOST should be true behind Docker."; fi

  v=$(env_get SEED_ADMIN_EMAIL)
  if [[ -z $v ]]; then
    warn ".env: SEED_ADMIN_EMAIL is empty; no first admin account will be created."
  else
    [[ $v == "admin@yourcompany.com" ]] && warn ".env: SEED_ADMIN_EMAIL is still the example address."
    local pw; pw=$(env_get SEED_ADMIN_PASSWORD)
    if [[ ${#pw} -lt 10 ]]; then err ".env: SEED_ADMIN_PASSWORD must be at least 10 characters"; errors=$((errors + 1)); fi
  fi

  if ((errors > 0)); then err "$errors problem(s) in $ENV_FILE. Edit it and run again."; return 1; fi
  ok "$ENV_FILE looks valid"
}

# ─── .env creation ───────────────────────────────────────────────────────────
create_env() {
  step "Creating $ENV_FILE"
  [[ -f $ENV_EXAMPLE ]] || die "$ENV_EXAMPLE is missing; is this the tools-portal folder?"
  if ! $INTERACTIVE && { [[ -z ${OPT_ADMIN_EMAIL:-${SEED_ADMIN_EMAIL:-}} ]]; }; then
    die "No terminal for prompts. Pass --admin-email (and optionally --admin-name, --admin-password, --url)."
  fi

  local url email name password
  url=${OPT_URL:-}
  [[ -z $url ]] && ask url "Address users will open in the browser" "$DEFAULT_URL"
  url=${url%/}

  email=${OPT_ADMIN_EMAIL:-${SEED_ADMIN_EMAIL:-}}
  while [[ ! $email =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]]; do
    [[ -n $email ]] && warn "'$email' is not a valid email address."
    if ! $INTERACTIVE || $ASSUME_YES; then die "Pass a valid --admin-email."; fi
    ask email "First admin's email address" ""
  done

  name=${OPT_ADMIN_NAME:-${SEED_ADMIN_NAME:-}}
  [[ -z $name ]] && ask name "First admin's name" "Portal Admin"

  password=${OPT_ADMIN_PASSWORD:-${SEED_ADMIN_PASSWORD:-}}
  local generated_pw=false
  while [[ -z $password || ${#password} -lt 10 || $password == *"'"* ]]; do
    if [[ -n $password ]]; then warn "Password must be at least 10 characters and must not contain a single quote."; fi
    if $INTERACTIVE && ! $ASSUME_YES; then
      ask_secret password "First admin's password (min 10 chars; leave blank to generate one)"
    elif [[ -n $password ]]; then
      die "--admin-password must be at least 10 characters and must not contain a single quote."
    fi
    if [[ -z $password ]]; then password="Tp-$(gen_hex | cut -c1-16)"; generated_pw=true; fi
  done

  cp "$ENV_EXAMPLE" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  env_set AUTH_URL "$url"
  env_set APP_URL "$url"
  env_set AUTH_TRUST_HOST true
  env_set AUTH_SECRET "$(gen_b64)"
  env_set APP_ENCRYPTION_KEY "$(gen_b64)"
  env_set POSTGRES_PASSWORD "$(gen_hex)"
  env_set SEED_ADMIN_EMAIL "$email"
  env_set SEED_ADMIN_NAME "$name"
  env_set SEED_ADMIN_PASSWORD "$password"
  ok "Wrote $SCRIPT_DIR/$ENV_FILE (mode 600) with freshly generated secrets"
  if $generated_pw; then
    warn "A password was generated for $email. Read it with:  grep SEED_ADMIN_PASSWORD $SCRIPT_DIR/$ENV_FILE"
  fi
  warn "Save a copy of APP_ENCRYPTION_KEY from $ENV_FILE in your password manager. Without it, stored API secrets in backups can't be decrypted."
}

# ─── Docker operations ───────────────────────────────────────────────────────
build_image() {
  step "Building the application image"
  export APP_VERSION
  APP_VERSION=$(app_version)
  info "Version: $APP_VERSION"
  compose pull --quiet db || warn "Could not pull the postgres image (offline?); using the local copy if present."
  compose build --pull app
  ok "Image $IMAGE:latest built ($APP_VERSION)"
}

wait_db() {
  local i
  compose up -d db >/dev/null
  for ((i = 0; i < 60; i++)); do
    if compose exec -T db sh -c 'pg_isready -q -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >/dev/null 2>&1; then return 0; fi
    sleep 2
  done
  die "The database did not become ready within 2 minutes. Check: ./deploy.sh logs db"
}

wait_healthy() {
  local timeout=${1:-$HEALTH_TIMEOUT} start=$SECONDS cid state status restarts last=""
  info "Waiting for the app to report healthy (up to ${timeout}s)…"
  while :; do
    cid=$(app_cid)
    if [[ -n $cid ]]; then
      read -r state status restarts < <(docker inspect -f '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}} {{.RestartCount}}' "$cid" 2>/dev/null || echo "missing missing 0")
      if [[ "$state/$status" != "$last" ]]; then info "  container: $state, health: $status"; last="$state/$status"; fi
      if [[ $state == running && ($status == healthy || $status == none) ]]; then ok "App is healthy"; return 0; fi
      if [[ $status == unhealthy ]]; then err "The app reported unhealthy."; break; fi
      if [[ $state == exited || $state == dead ]]; then err "The app container stopped."; break; fi
      if ((restarts >= 3)); then err "The app container keeps restarting ($restarts restarts)."; break; fi
    fi
    if ((SECONDS - start >= timeout)); then err "Timed out after ${timeout}s waiting for the app."; break; fi
    sleep 3
  done
  warn "Last 60 lines of the app log:"
  compose logs --no-color --tail=60 app || true
  return 1
}

http_check() {
  local url body
  url="$(env_get APP_URL)"
  for base in "$url" "http://127.0.0.1:$APP_PORT"; do
    [[ -z $base ]] && continue
    if have curl; then
      body=$(curl -fsS --max-time 5 "$base/api/public/health" 2>/dev/null) || continue
    elif have wget; then
      body=$(wget -qO- --timeout=5 "$base/api/public/health" 2>/dev/null) || continue
    else
      return 0
    fi
    ok "Reachable at $base  →  $body"
    [[ $base != "$url" ]] && warn "Reachable on localhost but not at $url from this server. Check the firewall / APP_URL."
    return 0
  done
  warn "Could not reach the health endpoint over HTTP from this server. Check that port $APP_PORT is open."
}

tag_previous() {
  if image_exists "$IMAGE:latest"; then
    docker image tag "$IMAGE:latest" "$IMAGE:previous"
    cp -f "$STATE_DIR/current_commit" "$STATE_DIR/previous_commit" 2>/dev/null || true
    info "Saved the running image as $IMAGE:previous (for rollback)"
  fi
}

record_success() { # record_success ACTION [VERSION]  (VERSION defaults to the checked-out code)
  local version=${2:-$(app_version)}
  printf '%s\n' "${2:-$(current_commit)}" >"$STATE_DIR/current_commit"
  printf '%s %s %s\n' "$(ts)" "$1" "$version" >>"$STATE_DIR/history"
}

# ─── Backups ─────────────────────────────────────────────────────────────────
db_dump() { # db_dump LABEL  → prints path
  local label=$1 file
  mkdir -p "$DB_BACKUP_DIR"
  chmod 700 "$DB_BACKUP_DIR" 2>/dev/null || true
  wait_db
  file="$DB_BACKUP_DIR/db-$(date +%Y%m%d-%H%M%S)-$label.dump"
  info "Dumping database to $file"
  if ! compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' >"$file"; then
    rm -f -- "$file"
    die "Database dump failed."
  fi
  [[ -s $file ]] || { rm -f -- "$file"; die "Database dump is empty."; }
  chmod 600 "$file"
  ok "Database dump saved ($(du -h "$file" | cut -f1)): $file"
  prune_old "$DB_BACKUP_DIR" "db-*.dump" "$KEEP_DUMPS"
  LAST_DUMP=$file
}

db_restore() { # db_restore FILE
  local file=$1
  [[ -s $file ]] || die "Dump file not found or empty: $file"
  step "Restoring database from $file"
  compose stop app >/dev/null 2>&1 || true
  wait_db
  compose exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --single-transaction' <"$file"
  ok "Database restored"
}

resolve_dump() { # resolve_dump ARG → path ("latest" = newest pre-update dump)
  local arg=$1
  if [[ $arg == latest ]]; then
    arg=$(ls -1t "$DB_BACKUP_DIR"/db-*-pre-update.dump 2>/dev/null | head -n 1 || true)
    [[ -n $arg ]] || die "No pre-update database dumps found in $DB_BACKUP_DIR."
  fi
  [[ -f $arg ]] || die "Dump not found: $arg"
  printf '%s' "$arg"
}

# ─── Commands ────────────────────────────────────────────────────────────────
cmd_install() {
  start_logging install
  acquire_lock
  preflight
  if [[ -f $ENV_FILE ]]; then
    info "Using existing $ENV_FILE"
  else
    create_env
  fi
  step "Checking configuration"
  check_env || exit 1
  check_port_free
  if [[ -n $(app_cid) ]]; then
    warn "Tools Portal is already running here."
    confirm "Rebuild and restart it now? (Use './deploy.sh update' for routine upgrades.)" || die "Cancelled."
  fi

  tag_previous
  build_image
  step "Starting services"
  compose up -d --remove-orphans
  wait_healthy || die "Tools Portal did not start. Fix the problem shown above, then run ./deploy.sh install again."
  http_check
  record_success install

  local url email
  url=$(env_get APP_URL)
  email=$(env_get SEED_ADMIN_EMAIL)
  step "Tools Portal is running"
  printf '  URL:          %s%s%s\n' "$C_BOLD" "$url" "$C_RESET"
  [[ -n $email ]] && printf '  Admin login:  %s (password in %s as SEED_ADMIN_PASSWORD)\n' "$email" "$ENV_FILE"
  cat <<EOF

  Next steps:
    1. Sign in and change your password (My Profile).
    2. Admin → Settings → Email: configure Microsoft Graph, then "Send test email".
    3. Shopify Discount Code Generator → Stores: connect each store, "Test connection".
    4. Admin → Roles & Permissions, then Admin → Users → Invite User.
    5. Back up APP_ENCRYPTION_KEY from $ENV_FILE somewhere safe.

  Useful: ./deploy.sh status | ./deploy.sh logs | ./deploy.sh backup | ./deploy.sh update
EOF
}

cmd_update() {
  start_logging update
  acquire_lock
  preflight
  step "Checking configuration"
  check_env || exit 1

  local before after branch
  before=$(current_commit)

  if ! $NO_PULL; then
    step "Fetching new code"
    have git && git rev-parse --git-dir >/dev/null 2>&1 || die "This folder is not a git checkout; use --no-pull to rebuild the local code."
    if [[ -n $(git status --porcelain --untracked-files=no) ]]; then
      warn "There are local changes to tracked files:"
      git status --short --untracked-files=no
      confirm "Continue anyway? (git pull may fail if they conflict)" || die "Cancelled."
    fi
    branch=${BRANCH:-$(git symbolic-ref --short -q HEAD || true)}
    [[ -n $branch ]] || die "Not on a branch (detached HEAD, e.g. after a manual checkout). Pass --branch <name>."
    git fetch --prune origin
    if [[ $branch != "$(git symbolic-ref --short -q HEAD || true)" ]]; then
      info "Switching to branch $branch"
      git checkout "$branch" 2>/dev/null || git checkout -b "$branch" --track "origin/$branch"
    fi
    git pull --ff-only origin "$branch"
    after=$(current_commit)
    if [[ $before == "$after" ]] && ! $FORCE && [[ -n $(app_cid) ]]; then
      ok "Already up to date at $after on $branch. Nothing to deploy (use --force to rebuild anyway)."
      return 0
    fi
    info "Code: $before → $after ($branch)"
    git --no-pager log --oneline --no-decorate "$before..$after" 2>/dev/null | head -n 20 | sed 's/^/    /' || true
  fi

  if $SKIP_BACKUP; then
    warn "Skipping the pre-update database backup (--skip-backup)."
  elif [[ -n $(compose ps -q db 2>/dev/null) ]]; then
    step "Backing up the database before updating"
    db_dump pre-update
  else
    info "Database is not running yet; no pre-update dump needed."
  fi

  tag_previous
  build_image

  step "Restarting with the new version"
  compose up -d --remove-orphans
  if wait_healthy; then
    http_check
    record_success update
    docker image prune -f >/dev/null 2>&1 || true
    ok "Update complete: now running $(app_version)"
    return 0
  fi

  err "The new version did not start correctly."
  if image_exists "$IMAGE:previous"; then
    step "Rolling back to the previous image automatically"
    docker image tag "$IMAGE:previous" "$IMAGE:latest"
    compose up -d --no-build app
    if wait_healthy; then
      warn "Rolled back: the previous version is running again."
    else
      err "The previous version also failed to start. Check ./deploy.sh logs."
    fi
    if [[ -n ${LAST_DUMP:-} ]]; then
      warn "If the failed version changed the database (migrations), restore the pre-update dump with:"
      warn "  ./deploy.sh rollback --with-db $LAST_DUMP"
    fi
  else
    err "No previous image to roll back to."
  fi
  exit 1
}

cmd_rollback() {
  start_logging rollback
  acquire_lock
  preflight
  image_exists "$IMAGE:previous" || die "No previous image ($IMAGE:previous) to roll back to."
  local prev_commit dump=""
  prev_commit=$(cat "$STATE_DIR/previous_commit" 2>/dev/null || echo "unknown")
  [[ -n $WITH_DB ]] && dump=$(resolve_dump "$WITH_DB")

  step "Rollback plan"
  info "Application image → previous build (commit $prev_commit)"
  if [[ -n $dump ]]; then
    warn "Database → REPLACED with $dump. Everything changed since that dump will be lost."
  else
    info "Database → unchanged"
  fi
  confirm "Proceed with the rollback?" || die "Cancelled."

  if [[ -n $dump ]]; then
    db_dump pre-rollback
    db_restore "$dump"
  fi
  docker image tag "$IMAGE:latest" "$IMAGE:rolled-back" 2>/dev/null || true
  docker image tag "$IMAGE:previous" "$IMAGE:latest"
  compose up -d --no-build
  wait_healthy
  http_check
  record_success rollback "$prev_commit"
  ok "Rolled back to the previous image (commit $prev_commit)."
  warn "The code checkout was not changed. Before the next update, fix the problem or run: git checkout $prev_commit"
}

cmd_backup() {
  start_logging backup
  acquire_lock
  preflight
  step "Database backup"
  db_dump manual
  local cid
  cid=$(app_cid)
  if [[ -n $cid ]]; then
    step "Copying in-app backups (Admin → Backup & Restore) to the host"
    mkdir -p "$APP_BACKUP_DIR"
    chmod 700 "$APP_BACKUP_DIR" 2>/dev/null || true
    docker cp "$cid:/app/backups/." "$APP_BACKUP_DIR/"
    ok "In-app backups copied to $SCRIPT_DIR/$APP_BACKUP_DIR ($(find "$APP_BACKUP_DIR" -type f | wc -l) files)"
  else
    warn "The app container isn't running; skipped copying in-app backups."
  fi
  info "Copy $SCRIPT_DIR/$STATE_DIR off this server regularly (e.g. rsync/scp to a file share)."
}

cmd_restore_db() {
  start_logging restore-db
  acquire_lock
  preflight
  local dump
  [[ ${#POSITIONAL[@]} -ge 1 ]] || die "Usage: ./deploy.sh restore-db <dump file | latest>"
  dump=$(resolve_dump "${POSITIONAL[0]}")
  warn "This REPLACES the entire database with $dump."
  confirm "Restore now?" || die "Cancelled."
  db_dump pre-restore
  db_restore "$dump"
  compose up -d --no-build app
  wait_healthy
  ok "Database restored from $dump. Users may need to sign in again."
}

cmd_status() {
  have docker || die "Docker is not installed."
  detect_compose
  step "Containers"
  compose ps
  step "Application"
  local cid
  cid=$(app_cid)
  if [[ -n $cid ]]; then
    docker inspect -f '  state: {{.State.Status}}   health: {{if .State.Health}}{{.State.Health.Status}}{{else}}n/a{{end}}   started: {{.State.StartedAt}}   restarts: {{.RestartCount}}' "$cid"
    http_check || true
  else
    warn "The app container is not running."
  fi
  step "Version"
  info "Code checkout: $(app_version) on $(git symbolic-ref --short -q HEAD 2>/dev/null || echo 'detached')"
  for tag in latest previous; do
    image_exists "$IMAGE:$tag" && info "Image $IMAGE:$tag: $(docker image inspect -f '{{index .Config.Labels "org.opencontainers.image.version"}} built {{.Created}}' "$IMAGE:$tag")"
  done
  step "Database dumps ($DB_BACKUP_DIR)"
  ls -1t "$DB_BACKUP_DIR"/db-*.dump 2>/dev/null | head -n 5 | while read -r f; do info "$(du -h "$f" | cut -f1)  $f"; done || true
  [[ -n $(ls -A "$DB_BACKUP_DIR" 2>/dev/null) ]] || info "(none yet: run ./deploy.sh backup)"
  step "Recent deploys"
  tail -n 5 "$STATE_DIR/history" 2>/dev/null || info "(no history)"
  step "Disk"
  df -h . | sed 's/^/  /'
}

cmd_logs() {
  detect_compose
  compose logs -f --tail=200 "${POSITIONAL[0]:-$LOG_SERVICE}"
}

cmd_start() {
  start_logging start
  preflight
  check_env || exit 1
  compose up -d --no-build
  wait_healthy
  http_check
}

cmd_stop() {
  start_logging stop
  detect_compose
  confirm "Stop Tools Portal (users will lose access until started again)?" || die "Cancelled."
  compose stop
  ok "Stopped. Start again with ./deploy.sh start"
}

cmd_restart() {
  start_logging restart
  preflight
  compose restart app
  wait_healthy
  http_check
}

cmd_env_check() {
  check_env || exit 1
}

usage() {
  cat <<EOF
${C_BOLD}Tools Portal deploy script${C_RESET}

Usage: ./deploy.sh <command> [options]

Commands:
  install              First-time setup. Creates .env (generating all secrets and
                       asking for the first admin), builds the image, starts the
                       database and app, and waits until it is healthy.
  update               Pre-update database dump → git pull → rebuild → restart →
                       health check. Automatically rolls back the app image if the
                       new version doesn't become healthy.
  rollback             Switch back to the previous image. Add --with-db <file|latest>
                       to also restore a database dump (latest = newest pre-update dump).
  backup               Database dump + copy of the in-app backups into .deploy/.
  restore-db <file|latest>
                       Replace the database with a dump (a safety dump is taken first).
  status               Containers, health, versions, recent dumps and deploys.
  logs [service]       Follow logs (app by default, or db).
  start | stop | restart
  env-check            Validate .env without touching Docker.
  help                 This help.

Options:
  -y, --yes                Don't ask for confirmation (for automation).
  --url <url>              Address for AUTH_URL/APP_URL on install (default $DEFAULT_URL).
  --admin-email <email>    First admin on install.
  --admin-name <name>      First admin's display name on install.
  --admin-password <pw>    First admin's password on install (generated if omitted with --yes).
  --branch <name>          Branch to deploy on update (default: current branch).
  --no-pull                Update: rebuild the local code without git pull.
  --force                  Update: rebuild even if there are no new commits.
  --skip-backup            Update: skip the pre-update database dump (not recommended).
  --with-db <file|latest>  Rollback: also restore this database dump.
  --timeout <seconds>      How long to wait for the app to become healthy (default $HEALTH_TIMEOUT).
  --keep <n>               How many database dumps to keep (default $KEEP_DUMPS).

Files:
  .env                     Configuration and secrets (git-ignored, mode 600).
  .deploy/db-backups/      Database dumps (pg_dump custom format).
  .deploy/app-backups/     Copies of the in-app backups.
  .deploy/deploy.log       Log of every deploy.sh run.

Examples:
  ./deploy.sh install
  ./deploy.sh install --yes --admin-email it@company.com --admin-name "IT Admin"
  ./deploy.sh update
  ./deploy.sh update --branch main
  ./deploy.sh rollback --with-db latest
  ./deploy.sh backup
EOF
}

# ─── Argument parsing ────────────────────────────────────────────────────────
COMMAND=${1:-help}
[[ $# -gt 0 ]] && shift

need_val() { [[ $# -ge 2 && -n $2 ]] || die "Option $1 needs a value."; }
while [[ $# -gt 0 ]]; do
  case $1 in
    -y | --yes) ASSUME_YES=true ;;
    --url) need_val "$@"; OPT_URL=$2; shift ;;
    --admin-email) need_val "$@"; OPT_ADMIN_EMAIL=$2; shift ;;
    --admin-name) need_val "$@"; OPT_ADMIN_NAME=$2; shift ;;
    --admin-password) need_val "$@"; OPT_ADMIN_PASSWORD=$2; shift ;;
    --branch) need_val "$@"; BRANCH=$2; shift ;;
    --no-pull) NO_PULL=true ;;
    --force) FORCE=true ;;
    --skip-backup) SKIP_BACKUP=true ;;
    --with-db) need_val "$@"; WITH_DB=$2; shift ;;
    --timeout) need_val "$@"; [[ $2 =~ ^[0-9]+$ ]] || die "--timeout must be a number of seconds"; HEALTH_TIMEOUT=$2; shift ;;
    --keep) need_val "$@"; [[ $2 =~ ^[1-9][0-9]*$ ]] || die "--keep must be a positive number"; KEEP_DUMPS=$2; shift ;;
    -h | --help) COMMAND=help ;;
    -*) die "Unknown option: $1 (see ./deploy.sh help)" ;;
    *) POSITIONAL+=("$1") ;;
  esac
  shift
done

LAST_DUMP=""
case $COMMAND in
  install) cmd_install ;;
  update | upgrade) cmd_update ;;
  rollback) cmd_rollback ;;
  backup) cmd_backup ;;
  restore-db) cmd_restore_db ;;
  status) cmd_status ;;
  logs) cmd_logs ;;
  start) cmd_start ;;
  stop) cmd_stop ;;
  restart) cmd_restart ;;
  env-check) cmd_env_check ;;
  help | -h | --help) usage ;;
  *) err "Unknown command: $COMMAND"; usage; exit 1 ;;
esac
