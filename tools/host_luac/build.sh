#!/usr/bin/env bash
# Build tools/host_luac/host_luac: the badge's own Lua 5.5 parser as a host
# syntax checker (what `badge check` prefers as its compile engine).
# Needs: a C compiler (cc) and solana-os@64a474b sources.
# Usage: tools/host_luac/build.sh [solana-os-dir]
#   default: ../solana-os (sibling checkout of
#   https://github.com/solana-foundation/solana-os, pinned commit 64a474b)
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
src="${1:-$(cd "$here/../.." && pwd)/../solana-os}"
vendor="$src/main/lua/vendor"
test -f "$vendor/lapi.c" || { echo "no vendored Lua at $vendor (clone solana-os@64a474b next to the kit)" >&2; exit 1; }
# shellcheck disable=SC2207
srcs=($(ls "$vendor"/lapi.c "$vendor"/lauxlib.c "$vendor"/lcode.c "$vendor"/lctype.c \
  "$vendor"/ldebug.c "$vendor"/ldo.c "$vendor"/ldump.c "$vendor"/lfunc.c \
  "$vendor"/lgc.c "$vendor"/llex.c "$vendor"/lmem.c "$vendor"/lobject.c \
  "$vendor"/lopcodes.c "$vendor"/lparser.c "$vendor"/lstate.c "$vendor"/lstring.c \
  "$vendor"/ltable.c "$vendor"/ltm.c "$vendor"/lundump.c "$vendor"/lvm.c "$vendor"/lzio.c))
cc -O2 -I"$vendor" "$here/host_luac.c" "${srcs[@]}" -o "$here/host_luac" -lm
echo "built $here/host_luac"
printf 'local x = 1\n' > "$here/.smoke.lua"
"$here/host_luac" "$here/.smoke.lua"
rm -f "$here/.smoke.lua"
