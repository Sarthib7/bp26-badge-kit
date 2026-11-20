// run.c — minimal host runner for the badge's own Lua 5.5 sources.
// Part of the BP26 Badge Kit (MIT). Opens the standard libraries and runs
// the file named on the command line. Used to run the kit's Lua test suite
// on a genuine 5.5 interpreter (solana-os@64a474b main/lua/vendor).
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "lua.h"
#include "lualib.h"
#include "lauxlib.h"
#include "luaconf.h"

/* Badge host hooks (vendor/luaconf.h): no task stack or instruction budget
   to guard on the host. */
void lh_charge_steps(struct lua_State *L, unsigned int n) { (void)L; (void)n; }
void lh_thread_new(struct lua_State *L1) { (void)L1; }
int lh_cstack_check(void) { return 0; }

static int l_kit_require(lua_State *L) {
    /* Minimal require for the test harness (the badge has none): dotted
       name -> path via the package.path global, cached in the registry. */
    const char *name = luaL_checkstring(L, 1);
    lua_getfield(L, LUA_REGISTRYINDEX, "KIT_LOADED");
    lua_getfield(L, -1, name);
    if (!lua_isnil(L, -1)) return 1;
    lua_pop(L, 1);
    char modpath[256];
    size_t i, j = 0;
    for (i = 0; name[i] && j + 1 < sizeof modpath; i++)
        modpath[j++] = name[i] == '.' ? '/' : name[i];
    modpath[j] = 0;
    lua_getglobal(L, "package");
    lua_getfield(L, -1, "path");
    const char *path = lua_tostring(L, -1);
    if (!path) return luaL_error(L, "require: package.path is not a string");
    char filename[512];
    const char *p = path;
    int found = 0;
    while (*p) {
        const char *sep = strchr(p, ';');
        size_t len = sep ? (size_t)(sep - p) : strlen(p);
        if (len > 0 && len < sizeof filename - strlen(modpath) - 5) {
            memcpy(filename, p, len);
            filename[len] = 0;
            char *q = strstr(filename, "?");
            if (q) {
                memmove(q + strlen(modpath), q + 1, strlen(q + 1) + 1);
                memcpy(q, modpath, strlen(modpath));
                if (luaL_loadfile(L, filename) == LUA_OK) { found = 1; break; }
                lua_pop(L, 1);
            }
        }
        if (!sep) break;
        p = sep + 1;
    }
    if (!found) return luaL_error(L, "require: module '%s' not found", name);
    if (lua_pcall(L, 0, 1, 0) != LUA_OK)
        return lua_error(L);
    if (lua_isnil(L, -1)) { lua_pop(L, 1); lua_pushboolean(L, 1); }
    lua_getfield(L, LUA_REGISTRYINDEX, "KIT_LOADED");
    lua_pushvalue(L, -2);
    lua_setfield(L, -2, name);
    lua_pop(L, 1);
    return 1;
}

static int l_os_exit(lua_State *L) {
    int code = (int)luaL_optinteger(L, 1, 0);
    exit(code);
    return 0;
}

static void open_harness_shims(lua_State *L) {
    /* package global with a path (require implemented above; the badge
       itself has no require searchers beyond its own bundle) */
    lua_newtable(L);
    lua_pushstring(L, "./?.lua");
    lua_setfield(L, -2, "path");
    lua_setglobal(L, "package");
    lua_newtable(L);
    lua_setfield(L, LUA_REGISTRYINDEX, "KIT_LOADED");
    lua_pushcfunction(L, l_kit_require);
    lua_setglobal(L, "require");
    /* os global with exit only (the badge has no os library) */
    lua_newtable(L);
    lua_pushcfunction(L, l_os_exit);
    lua_setfield(L, -2, "exit");
    lua_setglobal(L, "os");
}

static void open_sandbox_libs(lua_State *L) {
    /* the badge sandbox's own set: base, coroutine, string, table, math, utf8 */
    luaL_requiref(L, "_G", luaopen_base, 1);
    lua_pop(L, 1);
    luaL_requiref(L, LUA_COLIBNAME, luaopen_coroutine, 1);
    lua_pop(L, 1);
    luaL_requiref(L, LUA_TABLIBNAME, luaopen_table, 1);
    lua_pop(L, 1);
    luaL_requiref(L, LUA_STRLIBNAME, luaopen_string, 1);
    lua_pop(L, 1);
    luaL_requiref(L, LUA_MATHLIBNAME, luaopen_math, 1);
    lua_pop(L, 1);
    luaL_requiref(L, LUA_UTF8LIBNAME, luaopen_utf8, 1);
    lua_pop(L, 1);
    /* Harness-only shims (NOT on the badge): package.path + require and
       os.exit so the test runner works. Tested modules must stay within the
       six libs above — `badge check` lints for that. */
    open_harness_shims(L);
}

int main(int argc, char **argv) {
    if (argc < 2) { fprintf(stderr, "usage: host_lua55 <file.lua> [args...]\n"); return 2; }
    lua_State *L = luaL_newstate();
    if (!L) { fprintf(stderr, "host_lua55: no state\n"); return 1; }
    open_sandbox_libs(L);
    /* forward extra args as global `arg` table, like standalone lua */
    lua_createtable(L, argc - 2, 2);
    for (int i = 2; i < argc; i++) {
        lua_pushstring(L, argv[i]);
        lua_rawseti(L, -2, i - 1);
    }
    lua_pushstring(L, argv[1]);
    lua_rawseti(L, -2, 0);
    lua_setglobal(L, "arg");
    if (luaL_loadfile(L, argv[1]) != LUA_OK) {
        fprintf(stderr, "%s\n", lua_tostring(L, -1));
        return 1;
    }
    if (lua_pcall(L, 0, LUA_MULTRET, 0) != LUA_OK) {
        fprintf(stderr, "%s\n", lua_tostring(L, -1));
        return 1;
    }
    return 0;
}
