#!/usr/bin/env bash
# Baut das Server-Paket für die Installation ohne Docker:
#   dist/linksync-server-<version>.tar.gz
# Inhalt: main.js (Server, alles in einer Datei), install.sh (Installations- und Verwaltungsskript),
# VERSION, NODE_MAJOR (benötigte Node.js-Hauptversion), LICENSE.
set -euo pipefail
cd "$(dirname "$0")/.."

version=$(node -p "require('./package.json').version")
name="linksync-server-${version}"
stage="dist/${name}"

pnpm run build >/dev/null
rm -rf "$stage" "dist/${name}.tar.gz"
mkdir -p "$stage"
cp dist/main.js "$stage/"
cp ../../deploy/install.sh "$stage/"
cp ../../LICENSE "$stage/"
echo "$version" > "$stage/VERSION"
echo "24" > "$stage/NODE_MAJOR"
chmod +x "$stage/install.sh"

# COPYFILE_DISABLE: unter macOS keine versteckten ._-Dateien ins Archiv packen.
COPYFILE_DISABLE=1 tar -czf "dist/${name}.tar.gz" -C dist "$name"
rm -rf "$stage"
echo "dist/${name}.tar.gz"
