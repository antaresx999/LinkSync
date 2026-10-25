#!/usr/bin/env bash
# Testet install.sh auf einem echten Linux mit systemd (läuft in der GitHub-CI auf Ubuntu).
# Spielt durch: Installation, Sync, Sicherung, Update, misslungenes Update mit Rückkehr, Deinstallation.
#
#   sudo deploy/test-install.sh apps/server/dist/linksync-server-<version>.tar.gz
set -euo pipefail

PACKAGE=$(realpath "$1")
HERE=$(cd "$(dirname "$0")" && pwd)
INSTALL="$HERE/install.sh"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

pass() { echo "✓ $*"; }
fail() {
  echo "✗ $*" >&2
  journalctl -u linksync -n 50 --no-pager >&2 || true
  exit 1
}

# Paketvariante mit anderer Version bauen: variant NEUE_VERSION [kaputt]
variant() {
  local version=$1 broken=${2:-} dir="$WORK/linksync-server-$1" src="$WORK/original"
  rm -rf "$dir" "$src"
  mkdir -p "$dir" "$src"
  tar -xzf "$PACKAGE" -C "$src"
  cp -r "$src"/linksync-server-*/. "$dir/"
  echo "$version" >"$dir/VERSION"
  [[ -n $broken ]] && echo 'console.error("absichtlich kaputt"); process.exit(1);' >"$dir/main.js"
  tar -czf "$WORK/pkg-$version.tar.gz" -C "$WORK" "linksync-server-$version"
  echo "$WORK/pkg-$version.tar.gz"
}

SYNC_ID="6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b"
TOKEN="testtoken_abcdefghijklmnopqrstuvwxyz"
api() { curl -fsS -H "Authorization: Bearer $TOKEN" "$@"; }

# --- Installation ---
bash "$INSTALL" install --file "$PACKAGE"
systemctl is-active --quiet linksync || fail "Dienst läuft nicht"
pass "Installation: Dienst läuft"
[[ $(curl -fsS http://127.0.0.1:8080/health) == ok ]] || fail "health"
ss -ltn | grep -q '127.0.0.1:8080' || fail "Server lauscht nicht nur lokal"
pass "Server lauscht nur auf 127.0.0.1:8080"
[[ -x /usr/local/sbin/linksync ]] || fail "Befehl linksync fehlt"
[[ $(stat -c %U /var/lib/linksync) == linksync ]] || fail "Datenverzeichnis gehört nicht linksync"
[[ $(ps -o user= -p "$(systemctl show -p MainPID --value linksync)") == linksync ]] || fail "Dienst läuft nicht als Benutzer linksync"
pass "Dienst läuft als eigener Benutzer"

# Zweite Installation wird abgelehnt, statt etwas kaputt zu machen.
bash "$INSTALL" install --file "$PACKAGE" | grep -q "bereits installiert" || fail "Doppelte Installation nicht erkannt"
pass "Doppelte Installation erkannt"

# --- Daten anlegen ---
api -X POST -H 'Content-Type: application/json' -d "{\"syncId\":\"$SYNC_ID\"}" http://127.0.0.1:8080/v1/accounts >/dev/null
api -X POST -H 'Content-Type: application/json' -d '{"records":[{"id":"r1","baseSeq":0,"data":"1.test"}]}' \
  "http://127.0.0.1:8080/v1/accounts/$SYNC_ID/records" >/dev/null
pass "Konto und Eintrag angelegt"

# --- Sicherung ---
linksync backup
ls /var/lib/linksync/backups/linksync-*.sqlite >/dev/null || fail "Keine Sicherung erstellt"
pass "Sicherung erstellt"

# --- Update ---
sleep 1 # Sicherungen tragen die Uhrzeit auf die Sekunde im Namen
linksync update --file "$(variant 9.9.1)"
[[ $(cat /opt/linksync/app/VERSION) == 9.9.1 ]] || fail "Version nach Update falsch"
api "http://127.0.0.1:8080/v1/accounts/$SYNC_ID/records" | grep -q '"r1"' || fail "Daten nach Update verloren"
pass "Update auf 9.9.1, Daten erhalten"
[[ $(ls /var/lib/linksync/backups/ | wc -l) -ge 2 ]] || fail "Vor dem Update wurde nicht gesichert"
pass "Vor dem Update automatisch gesichert"

linksync update --file "$(variant 9.9.1)" | grep -q "bereits aktuell" || fail "Gleiche Version nicht erkannt"
pass "Gleiche Version wird nicht neu installiert"

# --- Misslungenes Update: zurück zur vorherigen Version ---
if linksync update --file "$(variant 9.9.2 kaputt)"; then fail "Kaputtes Update wurde nicht erkannt"; fi
[[ $(cat /opt/linksync/app/VERSION) == 9.9.1 ]] || fail "Nicht zur vorherigen Version zurückgekehrt"
systemctl is-active --quiet linksync || fail "Dienst läuft nach Rückkehr nicht"
api "http://127.0.0.1:8080/v1/accounts/$SYNC_ID/records" | grep -q '"r1"' || fail "Daten nach Rückkehr verloren"
pass "Kaputtes Update erkannt, Version 9.9.1 läuft wieder"

# --- Einstellungen überstehen Updates ---
sed -i 's/^SERVER_MESSAGE=.*/SERVER_MESSAGE=Hallo aus dem Test/' /etc/linksync/linksync.env
linksync update --file "$(variant 9.9.3)"
curl -fsS http://127.0.0.1:8080/v1/info | grep -q 'Hallo aus dem Test' || fail "Einstellungen nach Update verloren"
pass "Eigene Einstellungen bleiben bei Updates erhalten"

linksync status

# --- Deinstallation ---
linksync uninstall --yes
[[ ! -e /opt/linksync && ! -e /etc/systemd/system/linksync.service ]] || fail "Programm nicht entfernt"
[[ -f /var/lib/linksync/linksync.sqlite ]] || fail "Daten wurden ohne --purge gelöscht"
pass "Deinstallation: Programm weg, Daten erhalten"

bash "$INSTALL" install --file "$PACKAGE"
api "http://127.0.0.1:8080/v1/accounts/$SYNC_ID/records" | grep -q '"r1"' || fail "Neuinstallation findet alte Daten nicht"
pass "Neuinstallation übernimmt vorhandene Daten"

linksync uninstall --purge --yes
[[ ! -e /var/lib/linksync && ! -e /etc/linksync ]] || fail "--purge hat nicht alles gelöscht"
! id linksync >/dev/null 2>&1 || fail "Benutzer nicht gelöscht"
pass "Deinstallation mit --purge: alles entfernt"

echo
echo "Alles in Ordnung."
