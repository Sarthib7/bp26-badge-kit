#!/usr/bin/env bash
# Build tools/host_lua55/host_lua55: the badge's own Lua 5.5 sources as a host
# interpreter (for running the kit's Lua test suite on genuine 5.5).
# Needs: a C compiler (cc) and solana-os@64a474b sources.
# Usage: tools/host_lua55/build.sh [solana-os-dir]
#   default: ../solana-os (sibling checkout of
#   https://github.com/solana-foundation/solana-os, pinned commit 64a474b)
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
src="${1:-$(cd "$here/../.." && pwd)/../solana-os}"
vendor="$src/main/lua/vendor"
test -f "$vendor/lapi.c" || { echo "no vendored Lua at $vendor (clone solana-os@64a474b next to the kit)" >&2; exit 1; }
# shellcheck disable=SC2207
srcs=($(ls "$vendor"/lapi.c "$vendor"/lauxlib.c "$vendor"/lbaselib.c "$vendor"/lcode.c "$vendor"/lctype.c \
  "$vendor"/lcorolib.c "$vendor"/ldebug.c "$vendor"/ldo.c "$vendor"/ldump.c "$vendor"/lfunc.c \
  "$vendor"/lgc.c "$vendor"/llex.c "$vendor"/lmathlib.c "$vendor"/lmem.c "$vendor"/lobject.c \
  "$vendor"/lopcodes.c "$vendor"/lparser.c "$vendor"/lstate.c "$vendor"/lstring.c "$vendor"/lstrlib.c \
  "$vendor"/ltable.c "$vendor"/ltablib.c "$vendor"/ltm.c "$vendor"/lundump.c "$vendor"/lutf8lib.c \
  "$vendor"/lvm.c "$vendor"/lzio.c))
cc -O2 -I"$vendor" "$here/run.c" "${srcs[@]}" -o "$here/host_lua55" -lm
echo "built $here/host_lua55"
printf 'print("host lua " .. _VERSION)\n' > "$here/.smoke.lua"
"$here/host_lua55" "$here/.smoke.lua"
rm -f "$here/.smoke.lua"
