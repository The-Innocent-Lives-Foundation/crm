#!/usr/bin/env bash
set -euo pipefail

THIS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$THIS_DIR"

echo "=== CRM deploy: $(date -u) ==="
echo "Working dir: $THIS_DIR"

# 1. Restore the front-component-renderer stub that the frontend build requires
#    (the original package needs generated sandbox files missing in a source checkout)
mkdir -p packages/twenty-front-component-renderer/dist
cat > packages/twenty-front-component-renderer/dist/index.cjs <<'EOF'
'use strict';
const React = require('react');
exports.FrontComponentRenderer = () => React.createElement('div', null);
exports.FrontComponentInputFocusContext = React.createContext(() => {});
exports.default = exports.FrontComponentRenderer;
EOF
cat > packages/twenty-front-component-renderer/dist/index.mjs <<'EOF'
import React from 'react';
export const FrontComponentRenderer = () => React.createElement('div', null);
export const FrontComponentInputFocusContext = React.createContext(() => {});
export default FrontComponentRenderer;
EOF
cat > packages/twenty-front-component-renderer/dist/index.d.ts <<'EOF'
import React from 'react';
export declare const FrontComponentRenderer: () => React.ReactElement;
export declare const FrontComponentInputFocusContext: React.Context<() => void>;
export default FrontComponentRenderer;
EOF

echo "=== Ensuring empty yarn config (disable workspace checksum) ==="
echo "module.exports = {};" > yarn.config.cjs

echo "=== Node toolchain ==="
if ! command -v node >/dev/null 2>&1; then
  echo "Building/installing with Docker (node:22-alpine) is required on host."
  echo "Install node >= 22 + corepack, or run the dockerized build script instead."
  exit 1
fi

echo "=== yarn install ==="
corepack enable 2>/dev/null || true
yarn install 2>&1 | tail -5

echo "=== Stub 2: link the front-component-renderer build resolution ==="

echo "=== Build twenty-shared ==="
yarn workspace twenty-shared build 2>&1 | tail -3

echo "=== Build twenty-ui (used by frontend) ==="
yarn workspace twenty-ui build 2>&1 | tail -3

echo "=== Build twenty-server ==="
yarn nx build twenty-server 2>&1 | tail -5

echo "=== Build twenty-front ==="
( cd packages/twenty-front && NODE_OPTIONS=--max-old-space-size=4096 npx vite build ) 2>&1 | tail -8

echo "=== Compose stack ==="
# Reuse existing secrets on this server (never committed to git)
if [ -f /opt/twenty/.env ] && [ ! -f .env ]; then
  echo "Reusing /opt/twenty/.env for the stack"
  cp /opt/twenty/.env .env
fi
if [ -f /home/stephen/resend-bridge/.env ] && [ ! -f resend-bridge/.env ]; then
  echo "Reusing resend-bridge/.env"
  cp /home/stephen/resend-bridge/.env resend-bridge/.env
elif [ ! -f resend-bridge/.env ]; then
  echo "Creating resend-bridge/.env from example"
  cp resend-bridge/.env.example resend-bridge/.env
fi

# Stop any legacy standalone stacks (they share container names and host ports)
if [ -d /opt/twenty ] && [ -f /opt/twenty/docker-compose.yml ]; then
  echo "Stopping legacy stack at /opt/twenty"
  (cd /opt/twenty && docker compose down 2>/dev/null || true)
fi
if [ -d /home/stephen/resend-bridge ] && [ -f /home/stephen/resend-bridge/docker-compose.yml ]; then
  echo "Stopping legacy resend-bridge stack"
  (cd /home/stephen/resend-bridge && docker compose down 2>/dev/null || true)
fi
# Clean up any leftover containers from previous runs
docker compose -p crm down 2>/dev/null || true
docker rm -f twenty-server twenty-worker twenty-db twenty-redis resend-bridge crm-server-1 2>/dev/null || true

docker compose up -d --build --force-recreate 2>&1 | tail -10

echo "=== Health check ==="
for i in $(seq 1 24); do
  if curl -sf http://127.0.0.1:3000/healthz >/dev/null 2>&1; then
    echo "Twenty is healthy."
    break
  fi
  echo "waiting for Twenty... ($i)"
  sleep 5
done

echo "=== Deploy complete: $(date -u) ==="