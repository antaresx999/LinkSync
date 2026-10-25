#!/usr/bin/env bash
# LinkSync-Server – Installation und Verwaltung unter Linux (systemd), ohne Docker.
#
# Erstinstallation:
#   curl -fsSL https://raw.githubusercontent.com/antaresx999/LinkSync/main/deploy/install.sh | sudo bash
#
# Danach steht der Befehl "linksync" zur Verfügung:
#   sudo linksync update      neueste Version installieren (mit automatischer Sicherung)
#   sudo linksync status      Zustand, Version, Erreichbarkeit
#   sudo linksync logs        Protokoll live ansehen
#   sudo linksync backup      Datenbank sichern
#   sudo linksync config      Einstellungen bearbeiten und Server neu starten
#   sudo linksync uninstall   entfernen (Daten bleiben, ausser mit --purge)
#
# Optionen:
#   --version v1.2.3   bestimmte Version statt der neuesten
#   --file PAKET       lokales Paket (linksync-server-*.tar.gz) statt Download
#   --force            auch installieren, wenn die Version schon aktuell ist
#   --purge            bei uninstall auch Daten, Einstellungen und Benutzer löschen
#   --yes              keine Rückfragen
set -euo pipefail

REPO="antaresx999/LinkSync"
PREFIX="/opt/linksync"
CONF_DIR="/etc/linksync"
CONF_FILE="$CONF_DIR/linksync.env"
DATA_DIR="/var/lib/linksync"
BACKUP_DIR="$DATA_DIR/backups"
KEEP_BACKUPS=10
SERVICE="linksync"
UNIT_FILE="/etc/systemd/system/$SERVICE.service"
SERVICE_USER="linksync"
COMMAND="/usr/local/sbin/linksync"
TMP_DIR=""

# ---------- Ausgabe ----------

if [[ -t 1 ]]; then
  BOLD=$'\e[1m' GREEN=$'\e[32m' YELLOW=$'\e[33m' RED=$'\e[31m' RESET=$'\e[0m'
else
  BOLD="" GREEN="" YELLOW="" RED="" RESET=""
fi
step() { echo "${BOLD}==>${RESET} $*"; }
ok() { echo "${GREEN}✓${RESET} $*"; }
warn() { echo "${YELLOW}!${RESET} $*" >&2; }
die() {
  echo "${RED}✗ $*${RESET}" >&2
  exit 1
}

# ---------- Hilfsfunktionen ----------

require_root() {
  [[ $EUID -eq 0 ]] || die "Bitte mit sudo ausführen, z. B.: sudo $0 ${CMD:-install}"
}

require_systemd() {
  if ! command -v systemctl >/dev/null || [[ ! -d /run/systemd/system ]]; then
    die "Dieses System nutzt kein systemd. Bitte die Docker-Variante verwenden (docs/SERVER.md)."
  fi
}

require_tools() {
  local missing=()
  for tool in tar gzip sha256sum; do command -v "$tool" >/dev/null || missing+=("$tool"); done
  command -v curl >/dev/null || command -v wget >/dev/null || missing+=("curl")
  [[ ${#missing[@]} -eq 0 ]] || die "Es fehlen Programme: ${missing[*]}. Bitte zuerst installieren (z. B. apt install ${missing[*]})."
}

# Datei herunterladen: fetch URL ZIEL
fetch() {
  if command -v curl >/dev/null; then
    curl -fsSL --retry 3 -o "$2" "$1"
  else
    wget -q -O "$2" "$1"
  fi
}

# URL lesen und auf stdout ausgeben
fetch_text() {
  if command -v curl >/dev/null; then curl -fsSL --retry 3 "$1"; else wget -q -O - "$1"; fi
}

node_arch() {
  case "$(uname -m)" in
    x86_64 | amd64) echo "x64" ;;
    aarch64 | arm64) echo "arm64" ;;
    armv7l) echo "armv7l" ;;
    *) die "Prozessor $(uname -m) wird nicht unterstützt (unterstützt: x86_64, arm64, armv7l)." ;;
  esac
}

# Wert aus der Einstellungsdatei lesen: conf_get NAME STANDARD
conf_get() {
  local value=""
  [[ -f $CONF_FILE ]] && value=$(sed -n "s/^$1=//p" "$CONF_FILE" | tail -n 1 | tr -d '"'"'")
  echo "${value:-$2}"
}

# Temporärer Arbeitsordner, wird beim Beenden automatisch gelöscht.
make_tmp() {
  TMP_DIR=$(mktemp -d)
  trap 'rm -rf "$TMP_DIR"' EXIT
}

installed_version() {
  if [[ -f $PREFIX/app/VERSION ]]; then cat "$PREFIX/app/VERSION"; else echo ""; fi
}

# ---------- Node.js ----------

# Installiert die neueste Node.js-Version der benötigten Hauptversion nach $PREFIX/node.
install_node() {
  local major=$1 arch shasums file version current
  arch=$(node_arch)
  shasums=$(fetch_text "https://nodejs.org/dist/latest-v${major}.x/SHASUMS256.txt") ||
    die "Node.js-Versionsliste konnte nicht geladen werden (nodejs.org erreichbar?)."
  file=$(grep -oE "node-v${major}\.[0-9]+\.[0-9]+-linux-${arch}\.tar\.gz" <<<"$shasums" | head -n 1)
  [[ -n $file ]] || die "Kein Node.js ${major} für linux-${arch} gefunden."
  version=$(sed -E 's/^node-(v[0-9.]+)-.*/\1/' <<<"$file")

  current=""
  [[ -x $PREFIX/node/bin/node ]] && current=$("$PREFIX/node/bin/node" --version 2>/dev/null || true)
  if [[ $current == "$version" ]]; then
    ok "Node.js $version ist aktuell"
    return
  fi

  step "Lade Node.js $version ($arch) …"
  local tmp
  tmp=$(mktemp -d)
  fetch "https://nodejs.org/dist/${version}/${file}" "$tmp/$file"
  (cd "$tmp" && grep " ${file}\$" <<<"$shasums" | sha256sum -c --quiet -) || die "Prüfsumme von Node.js stimmt nicht – Abbruch."
  tar -xzf "$tmp/$file" -C "$tmp"
  rm -rf "$PREFIX/node.new"
  mv "$tmp/${file%.tar.gz}" "$PREFIX/node.new"
  rm -rf "$PREFIX/node.old"
  [[ -d $PREFIX/node ]] && mv "$PREFIX/node" "$PREFIX/node.old"
  mv "$PREFIX/node.new" "$PREFIX/node"
  rm -rf "$PREFIX/node.old" "$tmp"
  ok "Node.js $version installiert"
}

# ---------- LinkSync-Paket ----------

# Paket besorgen (Download mit Prüfsumme oder lokale Datei) und nach $1 entpacken.
# Setzt PKG_DIR auf den entpackten Ordner.
fetch_package() {
  local dest=$1 tarball
  if [[ -n $OPT_FILE ]]; then
    [[ -f $OPT_FILE ]] || die "Datei nicht gefunden: $OPT_FILE"
    tarball=$OPT_FILE
    step "Verwende lokales Paket $OPT_FILE"
  else
    local tag=$OPT_VERSION
    if [[ -z $tag ]]; then
      tag=$(fetch_text "https://api.github.com/repos/$REPO/releases/latest" | grep -oE '"tag_name": *"[^"]+"' | head -n 1 | sed -E 's/.*"([^"]+)"$/\1/') ||
        true
      [[ -n $tag ]] || die "Keine veröffentlichte Version gefunden (https://github.com/$REPO/releases)."
    fi
    [[ $tag == v* ]] || tag="v$tag"
    local name="linksync-server-${tag#v}.tar.gz"
    local base="https://github.com/$REPO/releases/download/$tag"
    step "Lade LinkSync-Server $tag …"
    fetch "$base/$name" "$dest/$name" || die "Paket $name nicht gefunden. Gibt es die Version $tag?"
    fetch "$base/SHA256SUMS.txt" "$dest/SHA256SUMS.txt" || die "Prüfsummen für $tag nicht gefunden."
    (cd "$dest" && grep " ${name}\$" SHA256SUMS.txt | sha256sum -c --quiet -) || die "Prüfsumme des Pakets stimmt nicht – Abbruch."
    ok "Prüfsumme in Ordnung"
    tarball="$dest/$name"
  fi
  tar -xzf "$tarball" -C "$dest"
  PKG_DIR=$(find "$dest" -mindepth 1 -maxdepth 1 -type d -name 'linksync-server-*' | head -n 1)
  [[ -n $PKG_DIR && -f $PKG_DIR/main.js && -f $PKG_DIR/VERSION ]] || die "Das Paket ist unvollständig."
}

# Neue Programmdateien an ihren Platz; die vorherige Version bleibt als app.prev für den Notfall.
install_app() {
  rm -rf "$PREFIX/app.new"
  cp -r "$PKG_DIR" "$PREFIX/app.new"
  rm -rf "$PREFIX/app.prev"
  [[ -d $PREFIX/app ]] && mv "$PREFIX/app" "$PREFIX/app.prev"
  mv "$PREFIX/app.new" "$PREFIX/app"
  chown -R root:root "$PREFIX/app"
  install -d "$(dirname "$COMMAND")"
  install -m 0755 "$PREFIX/app/install.sh" "$COMMAND"
}

rollback_app() {
  [[ -d $PREFIX/app.prev ]] || return 1
  rm -rf "$PREFIX/app"
  mv "$PREFIX/app.prev" "$PREFIX/app"
  install -m 0755 "$PREFIX/app/install.sh" "$COMMAND"
}

# ---------- System einrichten ----------

create_user() {
  if id "$SERVICE_USER" >/dev/null 2>&1; then return; fi
  local nologin
  nologin=$(command -v nologin || echo /usr/sbin/nologin)
  useradd --system --home-dir "$DATA_DIR" --no-create-home --shell "$nologin" "$SERVICE_USER"
  ok "Systembenutzer $SERVICE_USER angelegt"
}

create_dirs() {
  install -d -m 0755 "$PREFIX"
  install -d -m 0750 -o "$SERVICE_USER" -g "$SERVICE_USER" "$DATA_DIR" "$BACKUP_DIR"
  install -d -m 0755 "$CONF_DIR"
}

write_config() {
  if [[ -f $CONF_FILE ]]; then
    ok "Einstellungen bleiben erhalten ($CONF_FILE)"
    return
  fi
  cat >"$CONF_FILE" <<EOF
# Einstellungen des LinkSync-Servers. Nach Änderungen: sudo systemctl restart $SERVICE
# Beschreibung aller Werte: https://github.com/$REPO/blob/main/docs/SERVER.md

# Nur lokal lauschen – ein Reverse-Proxy (nginx, Caddy …) stellt HTTPS bereit.
# 0.0.0.0 = von aussen erreichbar (nur ohne Proxy und nur im vertrauenswürdigen Netz sinnvoll).
HOST=127.0.0.1
PORT=8080
DATABASE_PATH=$DATA_DIR/linksync.sqlite

# Hinter einem Reverse-Proxy: dessen Angabe der echten Absenderadresse vertrauen.
TRUST_PROXY=true

ALLOW_NEW_ACCOUNTS=true
MAX_ACCOUNTS=0
MAX_RECORDS_PER_ACCOUNT=50000
RATE_LIMIT_PER_MINUTE=120
NEW_ACCOUNTS_PER_HOUR=3
DELETE_INACTIVE_AFTER_DAYS=0
SERVER_MESSAGE=
EOF
  chown root:"$SERVICE_USER" "$CONF_FILE"
  chmod 0640 "$CONF_FILE"
  ok "Einstellungen angelegt ($CONF_FILE)"
}

write_unit() {
  cat >"$UNIT_FILE" <<EOF
# Wird von "linksync update" überschrieben. Eigene Anpassungen bitte mit "systemctl edit $SERVICE".
[Unit]
Description=LinkSync-Server (Ende-zu-Ende verschlüsselter Lesezeichen-Sync)
Documentation=https://github.com/$REPO
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$SERVICE_USER
Group=$SERVICE_USER
EnvironmentFile=$CONF_FILE
Environment=NODE_ENV=production
WorkingDirectory=$DATA_DIR
ExecStart=$PREFIX/node/bin/node $PREFIX/app/main.js
Restart=on-failure
RestartSec=5

# Absicherung: Der Dienst darf nur in sein Datenverzeichnis schreiben.
NoNewPrivileges=yes
ProtectSystem=strict
ReadWritePaths=$DATA_DIR
ProtectHome=yes
PrivateTmp=yes
PrivateDevices=yes
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectKernelLogs=yes
ProtectControlGroups=yes
ProtectClock=yes
ProtectHostname=yes
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
RestrictNamespaces=yes
RestrictRealtime=yes
RestrictSUIDSGID=yes
LockPersonality=yes
SystemCallArchitectures=native
# Keine Sonderrechte – deshalb muss PORT 1024 oder höher sein.
CapabilityBoundingSet=
UMask=0077

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
}

# Wartet, bis der Server antwortet. Gibt 1 zurück, wenn nicht.
health_check() {
  local host port url
  host=$(conf_get HOST 127.0.0.1)
  port=$(conf_get PORT 8080)
  [[ $host == "0.0.0.0" || $host == "::" ]] && host=127.0.0.1
  [[ $host == *:* ]] && host="[$host]"
  url="http://$host:$port/health"
  for _ in $(seq 1 30); do
    if [[ $(fetch_text "$url" 2>/dev/null || true) == "ok" ]]; then return 0; fi
    sleep 1
  done
  return 1
}

# ---------- Sicherung ----------

backup_db() {
  local db
  db=$(conf_get DATABASE_PATH "$DATA_DIR/linksync.sqlite")
  if [[ ! -f $db ]]; then
    ok "Noch keine Datenbank vorhanden – nichts zu sichern"
    return
  fi
  [[ -x $PREFIX/node/bin/node ]] || die "Node.js fehlt in $PREFIX/node."
  local target
  target="$BACKUP_DIR/linksync-$(date +%Y%m%d-%H%M%S).sqlite"
  # VACUUM INTO erstellt eine saubere Kopie, auch während der Server läuft.
  runuser -u "$SERVICE_USER" -- "$PREFIX/node/bin/node" -e '
    const { DatabaseSync } = require("node:sqlite");
    const db = new DatabaseSync(process.argv[1], { readOnly: true });
    db.prepare("VACUUM INTO ?").run(process.argv[2]);
    db.close();
  ' "$db" "$target" 2>/dev/null || die "Sicherung fehlgeschlagen."
  ok "Datenbank gesichert: $target"
  # Nur die neuesten Sicherungen behalten.
  find "$BACKUP_DIR" -maxdepth 1 -name 'linksync-*.sqlite' -type f -printf '%T@ %p\n' | sort -rn |
    tail -n +$((KEEP_BACKUPS + 1)) | cut -d' ' -f2- | xargs -r rm -f
}

# ---------- Befehle ----------

cmd_install() {
  require_root
  require_systemd
  require_tools
  if [[ -d $PREFIX/app ]]; then
    warn "LinkSync ist bereits installiert (Version $(installed_version))."
    echo "    Aktualisieren mit: sudo linksync update"
    exit 0
  fi

  step "Installiere LinkSync-Server"
  create_user
  create_dirs
  make_tmp
  fetch_package "$TMP_DIR"
  install_node "$(cat "$PKG_DIR/NODE_MAJOR" 2>/dev/null || echo 24)"
  install_app
  write_config
  write_unit
  systemctl enable --now "$SERVICE" >/dev/null 2>&1
  if health_check; then
    ok "LinkSync-Server $(installed_version) läuft"
  else
    warn "Der Server antwortet nicht. Protokoll ansehen mit: sudo linksync logs"
    exit 1
  fi

  cat <<EOF

${BOLD}Fertig!${RESET} Der Server lauscht auf http://$(conf_get HOST 127.0.0.1):$(conf_get PORT 8080)

Nächste Schritte:
  1. Reverse-Proxy mit HTTPS einrichten, z. B. Caddy:
       sync.example.com {
           reverse_proxy 127.0.0.1:$(conf_get PORT 8080)
       }
     Beispiele für nginx: https://github.com/$REPO/blob/main/docs/SERVER.md
  2. Einstellungen anpassen:   sudo linksync config
  3. In der Erweiterung als Server eintragen:  https://sync.example.com

Später aktualisieren:          sudo linksync update
EOF
}

cmd_update() {
  require_root
  require_systemd
  require_tools
  [[ -d $PREFIX/app ]] || die "LinkSync ist noch nicht installiert. Zuerst: sudo $0 install"

  local before
  before=$(installed_version)
  make_tmp
  fetch_package "$TMP_DIR"
  local after
  after=$(cat "$PKG_DIR/VERSION")
  if [[ $after == "$before" && $OPT_FORCE != 1 ]]; then
    ok "LinkSync $before ist bereits aktuell"
    install_node "$(cat "$PKG_DIR/NODE_MAJOR" 2>/dev/null || echo 24)"
    systemctl try-restart "$SERVICE"
    return
  fi

  step "Aktualisiere LinkSync $before → $after"
  backup_db
  install_node "$(cat "$PKG_DIR/NODE_MAJOR" 2>/dev/null || echo 24)"
  install_app
  write_unit
  systemctl restart "$SERVICE"
  if health_check; then
    ok "LinkSync-Server $after läuft"
  else
    warn "Die neue Version startet nicht – kehre zu $before zurück."
    rollback_app && write_unit && systemctl restart "$SERVICE"
    if health_check; then
      die "Update fehlgeschlagen, Version $before läuft wieder. Protokoll: sudo linksync logs"
    fi
    die "Update fehlgeschlagen und alte Version startet auch nicht. Protokoll: sudo linksync logs"
  fi
}

cmd_status() {
  local version
  version=$(installed_version)
  [[ -n $version ]] || die "LinkSync ist nicht installiert."
  echo "${BOLD}LinkSync-Server $version${RESET}"
  echo "  Programm:      $PREFIX/app"
  echo "  Node.js:       $("$PREFIX/node/bin/node" --version 2>/dev/null || echo fehlt)"
  echo "  Einstellungen: $CONF_FILE"
  echo "  Daten:         $DATA_DIR"
  echo "  Dienst:        $(systemctl is-active "$SERVICE" 2>/dev/null || true), Autostart: $(systemctl is-enabled "$SERVICE" 2>/dev/null || true)"
  if health_check; then ok "Server antwortet"; else warn "Server antwortet nicht"; fi
  local latest
  latest=$(fetch_text "https://api.github.com/repos/$REPO/releases/latest" 2>/dev/null | grep -oE '"tag_name": *"[^"]+"' | head -n 1 | sed -E 's/.*"v?([^"]+)"$/\1/' || true)
  if [[ -n $latest && $latest != "$version" ]]; then
    warn "Neue Version $latest verfügbar – aktualisieren mit: sudo linksync update"
  fi
}

cmd_logs() {
  exec journalctl -u "$SERVICE" -n 100 -f
}

cmd_backup() {
  require_root
  backup_db
  echo "Alle Sicherungen: $BACKUP_DIR (die $KEEP_BACKUPS neuesten werden behalten)"
}

cmd_config() {
  require_root
  [[ -f $CONF_FILE ]] || die "Keine Einstellungen gefunden – ist LinkSync installiert?"
  "${EDITOR:-nano}" "$CONF_FILE"
  systemctl restart "$SERVICE"
  if health_check; then ok "Server mit neuen Einstellungen gestartet"; else die "Server startet nicht. Protokoll: sudo linksync logs"; fi
}

cmd_uninstall() {
  require_root
  if [[ $OPT_YES != 1 && -t 0 ]]; then
    local what="Programm und Dienst"
    [[ $OPT_PURGE == 1 ]] && what="Programm, Dienst, ALLE DATEN und Einstellungen"
    read -r -p "LinkSync entfernen ($what)? [j/N] " answer
    [[ $answer =~ ^[jJyY] ]] || exit 0
  fi
  systemctl disable --now "$SERVICE" >/dev/null 2>&1 || true
  rm -f "$UNIT_FILE"
  systemctl daemon-reload
  rm -rf "$PREFIX" "$COMMAND"
  ok "Programm und Dienst entfernt"
  if [[ $OPT_PURGE == 1 ]]; then
    rm -rf "$DATA_DIR" "$CONF_DIR"
    userdel "$SERVICE_USER" 2>/dev/null || true
    ok "Daten, Einstellungen und Benutzer entfernt"
  else
    echo "Daten ($DATA_DIR) und Einstellungen ($CONF_DIR) bleiben erhalten. Endgültig löschen: sudo $0 uninstall --purge"
  fi
}

usage() {
  sed -n '2,21p' "$0" 2>/dev/null | sed 's/^# \{0,1\}//' || echo "Befehle: install, update, status, logs, backup, config, uninstall"
}

# ---------- Start ----------

CMD="install"
OPT_VERSION="" OPT_FILE="" OPT_FORCE=0 OPT_PURGE=0 OPT_YES=0
args=("$@")
for ((i = 0; i < ${#args[@]}; i++)); do
  case "${args[i]}" in
    install | update | status | logs | backup | config | uninstall) CMD="${args[i]}" ;;
    --version)
      i=$((i + 1))
      OPT_VERSION="${args[i]:-}"
      ;;
    --file)
      i=$((i + 1))
      OPT_FILE="${args[i]:-}"
      [[ -n $OPT_FILE ]] && OPT_FILE=$(realpath "$OPT_FILE" 2>/dev/null || echo "$OPT_FILE")
      ;;
    --force) OPT_FORCE=1 ;;
    --purge) OPT_PURGE=1 ;;
    --yes | -y) OPT_YES=1 ;;
    -h | --help | help)
      usage
      exit 0
      ;;
    *) die "Unbekannte Angabe: ${args[i]} (Hilfe: linksync help)" ;;
  esac
done

"cmd_$CMD"
