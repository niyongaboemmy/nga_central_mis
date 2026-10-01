#!/usr/bin/env bash
# Refresh the offline IP-location databases used by Usage & Monitoring
# (USAGE_ANALYTICS_IMPLEMENTATION_PLAN.md §7.2). No user IP ever leaves the server:
# the databases are downloaded and read locally.
#
# Default provider: DB-IP Lite (CC BY 4.0, no account needed; attribution
# "IP geolocation by DB-IP" is shown on the Locations page).
#   GEOIP_DIR             target directory          (default /var/lib/nga-geo)
#   GEOIP_PROVIDER        dbip | maxmind            (default dbip)
#   MAXMIND_LICENSE_KEY   required for maxmind
#
# Run monthly from cron, e.g.:
#   17 3 2 * * /opt/apps/nga_central_mis/backend/scripts/geoip-update.sh >> /var/log/nga-geoip.log 2>&1
# The MIS picks the new files up within a minute (it watches their mtime); no restart.
set -euo pipefail

DIR="${GEOIP_DIR:-/var/lib/nga-geo}"
PROVIDER="${GEOIP_PROVIDER:-dbip}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$DIR"

fetch_dbip() { # $1 = city|asn
  local kind="$1" month url
  for offset in 0 1; do
    month="$(date -u -d "-${offset} month" +%Y-%m 2>/dev/null || date -u -v-"${offset}"m +%Y-%m)"
    url="https://download.db-ip.com/free/dbip-${kind}-lite-${month}.mmdb.gz"
    if curl -fsSL --retry 3 -o "$TMP/${kind}.mmdb.gz" "$url"; then
      gunzip -f "$TMP/${kind}.mmdb.gz"
      echo "downloaded $url"
      return 0
    fi
  done
  echo "could not download DB-IP ${kind} database" >&2
  return 1
}

fetch_maxmind() { # $1 = City|ASN
  local edition="GeoLite2-$1"
  : "${MAXMIND_LICENSE_KEY:?MAXMIND_LICENSE_KEY is required for GEOIP_PROVIDER=maxmind}"
  curl -fsSL --retry 3 -o "$TMP/$edition.tgz" \
    "https://download.maxmind.com/app/geoip_download?edition_id=${edition}&license_key=${MAXMIND_LICENSE_KEY}&suffix=tar.gz"
  tar -xzf "$TMP/$edition.tgz" -C "$TMP"
  find "$TMP" -name "$edition.mmdb" -exec mv {} "$TMP/$edition.mmdb" \;
}

if [ "$PROVIDER" = "maxmind" ]; then
  fetch_maxmind City
  fetch_maxmind ASN
  # Sanity: a real database is several MB.
  for f in GeoLite2-City GeoLite2-ASN; do [ "$(wc -c < "$TMP/$f.mmdb")" -gt 1000000 ] || { echo "$f looks truncated" >&2; exit 1; }; done
  mv -f "$TMP/GeoLite2-City.mmdb" "$DIR/GeoLite2-City.mmdb"
  mv -f "$TMP/GeoLite2-ASN.mmdb" "$DIR/GeoLite2-ASN.mmdb"
else
  fetch_dbip city
  fetch_dbip asn
  for f in city asn; do [ "$(wc -c < "$TMP/$f.mmdb")" -gt 1000000 ] || { echo "$f database looks truncated" >&2; exit 1; }; done
  # Atomic swap: write next to the target, then rename.
  cp "$TMP/city.mmdb" "$DIR/.dbip-city-lite.mmdb.new" && mv -f "$DIR/.dbip-city-lite.mmdb.new" "$DIR/dbip-city-lite.mmdb"
  cp "$TMP/asn.mmdb" "$DIR/.dbip-asn-lite.mmdb.new" && mv -f "$DIR/.dbip-asn-lite.mmdb.new" "$DIR/dbip-asn-lite.mmdb"
fi
ls -la "$DIR"
