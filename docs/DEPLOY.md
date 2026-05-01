# Hujjah Web Deployment Guide (Local → VPS)

## Prerequisites

- Local: `apps/tauri/src-tauri/resources/hujjah-hadith-core.db` (updated)
- VPS: `signalstack` server with SSH access
- VPS has `/data/hujjah/` directory (owned by `1001:1001`)
- Local: `sshpass` installed (`brew install hujjah-scp` or use native scp)

---

## Step 1: Update Database on VPS

### 1a. Compress DB (optional — saves upload time)

```bash
cd ~/Desktop/Projects/hujjah
tar -czf hujjah-db.tar.gz apps/tauri/src-tauri/resources/hujjah-hadith-core.db
```

### 1b. Upload to VPS /tmp

```bash
sshpass -p 'YOUR_SSH_PASSWORD' scp hujjah-db.tar.gz signalstack:/tmp/
```

Or upload raw DB directly (if skipping compression):

```bash
sshpass -p 'YOUR_SSH_PASSWORD' scp apps/tauri/src-tauri/resources/hujjah-hadith-core.db signalstack:/tmp/
```

### 1c. Replace DB on VPS

```bash
sshpass -p 'YOUR_SSH_PASSWORD' ssh -t signalstack "sudo mv /tmp/hujjah-hadith-core.db /data/hujjah/ && ls -lh /data/hujjah/hujjah-hadith-core.db"
```

### 1d. Verify DB on VPS

```bash
ssh signalstack "cat > /tmp/query-narrators.js << 'SCRIPT'
const Database = require('/app/node_modules/.pnpm/better-sqlite3@11.10.0/node_modules/better-sqlite3');
const db = new Database('/data/hujjah/hujjah-hadith-core.db', { readonly: true });
const total = db.prepare('SELECT COUNT(*) as c FROM narrators').get().c;
const withBn = db.prepare('SELECT COUNT(*) as c FROM narrators WHERE name_bn IS NOT NULL AND name_bn != \"\"').get().c;
const withEn = db.prepare('SELECT COUNT(*) as c FROM narrators WHERE name_en IS NOT NULL AND name_en != \"\"').get().c;
console.log('Total narrators:', total);
console.log('With Bengali name:', withBn);
console.log('With English name:', withEn);
db.close();
SCRIPT
docker exec hujjah-web node /tmp/query-narrators.js"
```

Expected: `Total narrators: 24190`, `With Bengali name: 16193` (example — reflects your latest translation work).

---

## Step 2: Build Docker Image

```bash
cd ~/Desktop/Projects/hujjah
docker buildx build --platform linux/amd64 --load -t hujjah-web:latest -f apps/web/Dockerfile .
```

---

## Step 3: Transfer Image to VPS

```bash
docker save hujjah-web:latest | ssh signalstack "docker load"
```

---

## Step 4: Deploy with Docker Compose

```bash
scp docker-compose.yml signalstack:~/hujjah-web/docker-compose.yml
ssh signalstack "mkdir -p ~/hujjah-web && cp ~/docker-compose.yml ~/hujjah-web/"
ssh signalstack "cd ~/hujjah-web && DB_DATA_DIR=/data/hujjah docker compose up -d"
```

Check container:

```bash
ssh signalstack "docker ps | grep hujjah-web && docker logs hujjah-web --tail 10"
```

---

## Step 5: Restart Cloudflare Tunnel (if needed)

If tunnel isn't running:

```bash
ssh signalstack << 'TUNNEL'
pkill -f "cloudflared tunnel run" 2>/dev/null || true
sleep 1
cloudflared tunnel run --url http://localhost:3002 hujjah-web > ~/cloudflared.log 2>&1 &
echo "Tunnel started"
TUNNEL
```

---

## Quick Verification Commands

```bash
# Check container health
ssh signalstack "curl -sf http://localhost:3002/api/health"

# Check DB query via container
ssh signalstack "docker exec hujjah-web node /tmp/query-narrators.js"

# Check narrator API
curl -s "https://hujjah.fazleyrabbi.xyz/api/chain?action=search&q=abu&limit=3" | head -c 300

# Check tunnel
ssh signalstack "curl -sfI https://hujjah.fazleyrabbi.xyz/api/health"
```

---

## Troubleshooting

### Permission denied on `/data/hujjah/`
Use `ssh -t` with sudo:
```bash
sshpass -p 'PASSWORD' ssh -t signalstack "sudo mv /tmp/hujjah-hadith-core.db /data/hujjah/"
```

### DB not updating in app
Check mount:
```bash
ssh signalstack "docker inspect hujjah-web --format '{{range .Mounts}}{{.Source}} -> {{.Destination}}{{end}}'"
```

### Build fails with `useSearchParams() should be wrapped in suspense`
Fix in `apps/web/app/chain/page.tsx`:
```tsx
// ChainPage must NOT use searchParams at page level
// ChainContent uses it internally via useEffect
export default function ChainPage() {
  return (
    <Suspense fallback={...}>
      <ChainContent pathname={usePathname()} />
    </Suspense>
  );
}
```

---

## Cron: Auto-Restart on Failure

```bash
ssh signalstack "crontab -l"  # check existing
# Add: @reboot /home/fazley/restart-hujjah.sh
```