#!/usr/bin/env bash
# بيتشغّل على السيرفر (root). بيقوّم حاوية صفحة الصيانة وبيدّي Traefik
# الراوتر بتاعها. آمن يتشغّل تاني — بيبدّل الحاوية والملفات بالجديد.
set -euo pipefail

SRC="$(cd "$(dirname "$0")" && pwd)"
DEST=/etc/dokploy/maintenance

mkdir -p "$DEST"
cp "$SRC/index.html" "$SRC/nginx.conf" "$DEST/"

docker rm -f platform-maintenance >/dev/null 2>&1 || true
docker run -d --name platform-maintenance --restart unless-stopped \
  --network dokploy-network \
  --memory 32m --cpus 0.1 \
  -v "$DEST/index.html:/usr/share/nginx/html/index.html:ro" \
  -v "$DEST/nginx.conf:/etc/nginx/conf.d/default.conf:ro" \
  nginx:alpine >/dev/null

cp "$SRC/traefik.yml" /etc/dokploy/traefik/dynamic/maintenance.yml
echo "maintenance page installed"
