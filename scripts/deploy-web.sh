#!/usr/bin/env bash
set -euo pipefail

# Hujjah Web Deploy Script
# Usage: ./scripts/deploy-web.sh [HOST]

HOST="${1:-signalstack}"
IMAGE_NAME="hujjah-web"
DB_HOST_DIR="/data/hujjah"
HOST_PORT="${HOST_PORT:-3002}"
CONTAINER_PORT="${CONTAINER_PORT:-3000}"

echo "=== Building Docker image ==="
docker build -f apps/web/Dockerfile -t "${IMAGE_NAME}:latest" .

echo "=== Saving image ==="
docker save "${IMAGE_NAME}:latest" | gzip > /tmp/hujjah-web.tar.gz

echo "=== Copying image to ${HOST} ==="
scp /tmp/hujjah-web.tar.gz "${HOST}:/tmp/"

echo "=== Loading image on ${HOST} ==="
ssh "${HOST}" "docker load < /tmp/hujjah-web.tar.gz"

echo "=== Deploying with Docker Compose ==="
ssh "${HOST}" "mkdir -p ~/hujjah-web"
scp docker-compose.yml "${HOST}:~/hujjah-web/docker-compose.yml"
scp .env "${HOST}:~/hujjah-web/.env" || true

ssh "${HOST}" "cd ~/hujjah-web && \
  HOST_PORT=${HOST_PORT} CONTAINER_PORT=${CONTAINER_PORT} DB_DATA_DIR=${DB_HOST_DIR} \
  docker compose up -d"

echo "=== Waiting for health check ==="
sleep 3
if ssh "${HOST}" "curl -sf http://localhost:${HOST_PORT}/api/health"; then
  echo "=== Deploy successful ==="
else
  echo "=== Health check failed ==="
  ssh "${HOST}" "docker logs hujjah-web --tail 20"
  exit 1
fi
