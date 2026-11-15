#!/usr/bin/env bash
# Build the badge's own Lua 5.5 host tools (tools/host_luac, tools/host_lua55)
# from solana-os at the pinned commit. Needs git, a C compiler (cc) and network
# for the first fetch. Usage: scripts/setup-lua55.sh [solana-os-dir]
#   default dir: $SOLANA_OS_DIR, else ../solana-os next to the kit.
set -euo pipefail
PIN=64a474b698008dfff09d321dd1a8584ba96ccb5f
kit="$(cd "$(dirname "$0")/.." && pwd)"
dir="${1:-${SOLANA_OS_DIR:-$kit/../solana-os}}"
if [ ! -f "$dir/main/lua/vendor/lapi.c" ]; then
  echo "fetching solana-os@${PIN:0:7} into $dir"
  mkdir -p "$dir"
  git -C "$dir" init -q
  git -C "$dir" fetch -q --depth 1 https://github.com/solana-foundation/solana-os "$PIN"
  git -C "$dir" checkout -q FETCH_HEAD
fi
got="$(git -C "$dir" rev-parse HEAD 2>/dev/null || echo unknown)"
[ "$got" = "$PIN" ] || echo "warning: $dir is at $got, kit is pinned to $PIN" >&2
"$kit/tools/host_luac/build.sh" "$dir"
"$kit/tools/host_lua55/build.sh" "$dir"
