#!/bin/sh
# Samples CPU% / RSS of the processes under test every 2 s into a CSV, and
# kills k6 if the disk drops under 600 MB (this Mac swaps onto the same disk).
#   scripts/load/monitor.sh <out.csv> <api-pid> <web-pid>
OUT=$1; API=$2; WEB=$3
echo 'time,api_cpu,api_rss_mb,web_cpu,web_rss_mb,pg_cpu,redis_cpu,free_mb' > "$OUT"
while kill -0 "$API" 2>/dev/null; do
  a=$(ps -o pcpu=,rss= -p "$API" | awk '{printf "%s,%d", $1, $2/1024}')
  w=$(ps -o pcpu=,rss= -p "$WEB" | awk '{printf "%s,%d", $1, $2/1024}')
  pg=$(ps -Ao pcpu=,comm= | awk '/postgres/ {s+=$1} END {print s+0}')
  rd=$(ps -Ao pcpu=,comm= | awk '/redis-server/ {s+=$1} END {print s+0}')
  free=$(df -m /System/Volumes/Data | awk 'NR==2 {print $4}')
  echo "$(date +%H:%M:%S),$a,$w,$pg,$rd,$free" >> "$OUT"
  if [ "$free" -lt 600 ]; then pkill -INT -x k6; echo "disk low ($free MB), stopped k6" >&2; fi
  sleep 2
done
