#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[run]${NC} $1"; }
warn() { echo -e "${YELLOW}[run]${NC} $1"; }
err()  { echo -e "${RED}[run]${NC} $1"; exit 1; }

# -- Pre-flight checks --
command -v pnpm  >/dev/null 2>&1 || err "pnpm not found. Install: npm i -g pnpm"
command -v node  >/dev/null 2>&1 || err "node not found."

# -- Env files --
if [ ! -f apps/api/.env ]; then
  warn "apps/api/.env not found — copying from .env.example"
  cp .env.example apps/api/.env
fi

if [ ! -f apps/web/.env.local ]; then
  warn "apps/web/.env.local not found — creating with defaults"
  echo 'NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1' > apps/web/.env.local
fi

# -- Install deps --
log "Installing dependencies..."
pnpm install --frozen-lockfile 2>/dev/null || pnpm install

# -- Database --
log "Generating Prisma client..."
pnpm db:generate

log "Pushing database schema..."
pnpm db:push

# -- Start --
log "Starting API + Web..."
pnpm dev
