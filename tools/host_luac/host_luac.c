// host_luac — compile a Lua file with the badge's own Lua 5.5 parser.
// Part of the BP26 Badge Kit (MIT). Build against solana-os@64a474b
// (release 2.1.0) main/lua/vendor; see build.sh. Reports exactly what the
// App Store's compile gate reports for syntax (same sources, same "t" mode,
// same strip level 2 as tools/luac/luac.c).
//
// Usage: host_luac <file.lua>
//   prints  COMPILE OK: <src> src bytes -> <chunk> chunk bytes (strip=2)
//   or      COMPILE FAIL: <file>:<line>: <message>
// Exit code is always 0; `badge check` parses the first line.

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "lua.h"
#include "lauxlib.h"
#include "luaconf.h"

// Badge host hooks (vendor/luaconf.h): nothing to guard while compiling.
void lh_charge_steps(struct lua_State *L, unsigned int n) { (void)L; (void)n; }
void lh_thread_new(struct lua_State *L1) { (void)L1; }
int lh_cstack_check(void) { return 0; }

static unsigned char *s_out;
static size_t s_len, s_cap;

static int writer(lua_State *L, const void *p, size_t sz, void *ud) {
    (void)L;
    (void)ud;
    if (!p || !sz) return 0; // 5.5's last call: the end
    if (s_len + sz > s_cap) {
        size_t cap = (s_len + sz) * 2;
        unsigned char *n = (unsigned char *)realloc(s_out, cap);
        if (!n) return 1;
        s_out = n;
        s_cap = cap;
    }
    memcpy(s_out + s_len, p, sz);
    s_len += sz;
    return 0;
}

int main(int argc, char **argv) {
    if (argc < 2) { fprintf(stderr, "usage: host_luac <file.lua>\n"); return 2; }
    FILE *f = fopen(argv[1], "rb");
    if (!f) { printf("COMPILE FAIL: %s: cannot open file\n", argv[1]); return 0; }
    fseek(f, 0, SEEK_END);
    long n = ftell(f);
    fseek(f, 0, SEEK_SET);
    char *src = (char *)malloc((size_t)n + 1);
    if (!src || fread((void *)src, 1, (size_t)n, f) != (size_t)n) {
        printf("COMPILE FAIL: %s: cannot read file\n", argv[1]);
        return 0;
    }
    fclose(f);
    char chunk[96];
    snprintf(chunk, sizeof chunk, "=%s", argv[1]);
    lua_State *L = luaL_newstate();
    if (!L) { printf("COMPILE FAIL: %s: not enough memory\n", argv[1]); return 0; }
    int rc = luaL_loadbufferx(L, src, (size_t)n, chunk, "t");
    if (rc != LUA_OK) {
        printf("COMPILE FAIL: %s\n", lua_tostring(L, -1));
    } else if ((rc = lua_dump(L, writer, NULL, 2)) != 0) {
        printf("COMPILE FAIL: %s: not enough memory\n", argv[1]);
    } else {
        printf("COMPILE OK: %ld src bytes -> %lu chunk bytes (strip=2)\n", n, (unsigned long)s_len);
    }
    lua_close(L);
    return 0;
}
