#!/usr/bin/env bash
set -euo pipefail

# Hujjah Web Deploy Script with Cloudflare Tunnel
# Usage: ./scripts/deploy-web.sh [HOST]

HOST="${1:-signalstack}"
IMAGE_NAME="hujjah-web"
DB_HOST_DIR="/data/hujjah"
HOST_PORT="${HOST_PORT:-3002}"
CONTAINER_PORT="${CONTAINER_PORT:-3000}"
CLOUDFLARE_TUNNEL_NAME="hujjah-web"
DOMAIN="hujjah.fazleyrabbi.xyz"

echo "=== Building Docker image for amd64 ==="
# Create multi-arch builder
docker buildx create --name multi --driver docker-container 2>/dev/null || true
docker buildx use multi
docker buildx build --platform linux/amd64 --push -t "${IMAGE_NAME}:amd64" -f apps/web/Dockerfile .

echo "=== Pulling amd64 image locally ==="
docker pull "${IMAGE_NAME}:amd64"
docker tag "${IMAGE_NAME}:amd64" "${IMAGE_NAME}:latest"

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

echo "=== Waiting for service ==="
sleep 5

# Verify container is running
if ssh "${HOST}" "curl -sf http://localhost:${HOST_PORT}/api/health"; then
  echo "Container is running"
else
  echo "=== Container health check failed ==="
  ssh "${HOST}" "docker logs hujjah-web --tail 20"
  exit 1
fi

echo "=== Setting up Cloudflare Tunnel ==="
ssh "${HOST}" << 'TUNNEL_SETUP'
# Install cloudflared if not present
if ! command -v cloudflared &> /dev/null; then
    echo "Installing cloudflared..."
    curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /tmp/cloudflared
    chmod +x /tmp/cloudflared
    sudo mv /tmp/cloudflared /usr/local/bin/cloudflared
fi

# Stop any existing tunnel
pkill -f "cloudflared tunnel run" 2>/dev/null || true
sleep 1

# Create tunnel if not exists
if ! cloudflared tunnel list 2>/dev/null | grep -q "hujjah-web"; then
    echo "Creating tunnel hujjah-web..."
    cloudflared tunnel create hujjah-web
fi

# Point domain to tunnel
echo "Routing domain to tunnel..."
cloudflared tunnel route dns hujjah-web hujjah.fazleyrabbi.xyz || true
cloudflared tunnel route dns hujjah-web www.hujjah.fazleyrabbi.xyz || true

# Run tunnel
echo "Starting tunnel..."
nohup cloudflared tunnel run --url http://localhost:3002 hujjah-web > ~/cloudflared.log 2>&1 &
echo "Cloudflared tunnel started"
TUNNEL_SETUP

echo "=== Checking tunnel ==="
sleep 3
ssh "${HOST}" "curl -sfI https://hujjah.fazleyrabbi.xyz/api/health" || echo "Tunnel not ready yet"

echo "=== Deploy complete ==="
echo "URL: https://hujjah.fazleyrabbi.xyz"
