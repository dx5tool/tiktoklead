#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright 2026 Bogdan Shapovalov and the XChange authors
#
# The signed in-app update for a Windows-only release: what the application's
# "Update" button downloads (desktop/src-tauri/src/update.rs).
#
#     tools/release/updater-feed-windows.sh <version> <setup.exe> <out dir>
#
# Writes into <out dir>:
#   xchange-<version>-windows-x64-setup.exe       the NSIS installer
#   xchange-<version>-windows-x64-setup.exe.sig   its minisign signature
#   latest.json                                  the manifest the updater reads
#   SHA256SUMS                                   every artifact in <out dir>
#
# The private key is the one whose public half is in tauri.conf.json. Losing it
# means no installed copy can be updated again.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

version="${1:?usage: updater-feed-windows.sh <version> <setup.exe> <out dir>}"
setup="${2:?the Windows setup.exe}"
out="$(cd "${3:?the release directory}" && pwd)"
key="${FURY_UPDATER_KEY:-$HOME/.tauri/xchange-tiktoklead.key}"

if ! printf '%s' "$version" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.]+)?$'; then
  echo "!! version must look like 1.2.3 (got \"$version\")" >&2
  exit 1
fi
[ -f "$setup" ] || { echo "!! no installer at $setup" >&2; exit 1; }
[ -f "$key" ] || { echo "!! no updater key at $key" >&2; exit 1; }

win="xchange-$version-windows-x64-setup.exe"
if [ "$(cd "$(dirname "$setup")" && pwd)/$(basename "$setup")" != "$out/$win" ]; then
  cp "$setup" "$out/$win"
fi

rm -f "$out/$win.sig"
(
  cd "$here/desktop"
  TAURI_SIGNING_PRIVATE_KEY_PASSWORD="" \
    npx tauri signer sign -f "$key" -p "" "$out/$win" >/dev/null
)
[ -s "$out/$win.sig" ] || { echo "!! no signature written for $win" >&2; exit 1; }

PY="${PYTHON:-python3}"
"$PY" -c '' >/dev/null 2>&1 || PY=python
"$PY" -c '' >/dev/null 2>&1 || { echo "!! no Python 3 found" >&2; exit 1; }
"$PY" - "$out" "$version" "$win" <<'PY'
import datetime, json, sys

out, version, win = sys.argv[1:]
sig = open(f"{out}/{win}.sig").read().strip()
feed = {
    "version": version,
    "notes": f"https://github.com/dx5tool/tiktoklead/releases/tag/v{version}",
    "pub_date": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "platforms": {
        "windows-x86_64": {
            "signature": sig,
            "url": f"https://github.com/dx5tool/tiktoklead/releases/download/v{version}/{win}",
        },
    },
}
json.dump(feed, open(f"{out}/latest.json", "w"), indent=2)
print(f"wrote {out}/latest.json")
PY

cd "$out"
files=()
for f in xchange-core-*.tar.xz xchange-*-setup.exe xchange-*-setup.exe.sig latest.json; do
  [ -f "$f" ] && files+=("$f")
done
[ ${#files[@]} -gt 0 ] || { echo "!! nothing to checksum in $out" >&2; exit 1; }
if command -v sha256sum >/dev/null 2>&1; then
  sha256sum "${files[@]}" > SHA256SUMS
else
  shasum -a 256 "${files[@]}" > SHA256SUMS
fi
cat SHA256SUMS
