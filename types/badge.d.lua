---@meta
-- Badge Kit LuaLS stubs for Solana OS 2.1.0 (solana-os@64a474b).
-- Copy `types/` next to your app and point .luarc.json `workspace.library` at
-- it for autocomplete + diagnostics. The STORE + badge are authoritative;
-- this file only describes the sandbox (main/lua/*.c, docs/LUA_API.md).
-- Min-OS notes mark APIs that are nil on older badges — guard with
-- `if mod then` (e.g. `if ble then`, `if mesh.meet then`, `if crypto then`).

---@class BadgeUiHandle
---@field text fun(self: BadgeUiHandle, s: string)
---@field color fun(self: BadgeUiHandle, c: string|integer)
---@field pos fun(self: BadgeUiHandle, x: integer, y: integer)
---@field size fun(self: BadgeUiHandle, w: integer, h: integer)
---@field set fun(self: BadgeUiHandle, v: any)
---@field scale fun(self: BadgeUiHandle, s: integer)
---@field show fun(self: BadgeUiHandle, b: boolean)
---@field remove fun(self: BadgeUiHandle)
---@field selected fun(self: BadgeUiHandle): integer
---@field select fun(self: BadgeUiHandle, i: integer)
---@field items fun(self: BadgeUiHandle, items: any)
---@field play fun(self: BadgeUiHandle)
---@field stop fun(self: BadgeUiHandle)
---@field playing fun(self: BadgeUiHandle): boolean
---@field clear fun(self: BadgeUiHandle)
---@field pixel fun(self: BadgeUiHandle, x: integer, y: integer, c: string|integer)
---@field rect fun(self: BadgeUiHandle, x: integer, y: integer, w: integer, h: integer, c: string|integer)
---@field line fun(self: BadgeUiHandle, x1: integer, y1: integer, x2: integer, y2: integer, c: string|integer)
---@field image fun(self: BadgeUiHandle, img: any, x: integer, y: integer)
---@field get fun(self: BadgeUiHandle, x: integer, y: integer): integer|nil

---@class BadgeUiImage
---@field size fun(self: BadgeUiImage): integer, integer

---@class ui
---@field W integer
---@field H integer
ui = {}
---@param color string|integer
function ui.bg(color) end
---@param x integer
---@param y integer
---@param text string
---@param opts {size: integer, color: string|integer, mono: boolean, w: integer, align: string}|nil
---@return BadgeUiHandle
function ui.label(x, y, text, opts) end
---@param x integer
---@param y integer
---@param w integer
---@param h integer
---@param opts {color: string|integer, radius: integer, border: string}|nil
---@return BadgeUiHandle
function ui.rect(x, y, w, h, opts) end
---@param x integer
---@param y integer
---@param w integer
---@param h integer
---@param value number
---@return BadgeUiHandle
function ui.bar(x, y, w, h, value) end
---@param x integer
---@param y integer
---@param w integer
---@param h integer
---@return BadgeUiHandle
function ui.gradient(x, y, w, h) end
---@param x integer
---@param y integer
---@param w integer
---@param h integer
---@param items any
---@param opts {on_select: fun(i: integer, item: any)}|nil
---@return BadgeUiHandle
function ui.list(x, y, w, h, items, opts) end
---@param x integer
---@param y integer
---@param size integer
---@param text string
---@return BadgeUiHandle
function ui.qr(x, y, size, text) end
---@param path string
---@return BadgeUiImage
function ui.load(path) end
---@param x integer
---@param y integer
---@param src string|table|BadgeUiImage
---@param opts {scale: integer, palette: table}|nil
---@return BadgeUiHandle
function ui.image(x, y, src, opts) end
---@param x integer
---@param y integer
---@param w integer
---@param h integer
---@param opts {scale: integer, color: string|integer}|nil
---@return BadgeUiHandle
function ui.canvas(x, y, w, h, opts) end
---@param x integer
---@param y integer
---@param path string
---@param opts {scale: integer, loop: boolean|integer}|nil
---@return BadgeUiHandle
function ui.anim(x, y, path, opts) end
---@param text string
function ui.hint(text) end
---@param text string
function ui.toast(text) end
---@param msg string
---@param cb fun(yes: boolean)
function ui.confirm(msg, cb) end
---@param prompt string
---@param max integer
---@param cb fun(text: string|nil)
function ui.input(prompt, max, cb) end
function ui.clear() end

---@class led
led = {}
---@type integer
led.count = 8
---@param i integer
---@param r integer
---@param g integer
---@param b integer
function led.set(i, r, g, b) end
---@param i integer
---@param hex integer
function led.hex(i, hex) end
---@param r integer
---@param g integer
---@param b integer
function led.fill(r, g, b) end
function led.off() end

---@class timer
timer = {}
---@param ms integer
---@param fn fun()
---@return integer
function timer.after(ms, fn) end
---@param ms integer
---@param fn fun()
---@return integer
function timer.every(ms, fn) end
---@param id integer
function timer.cancel(id) end

---@class sys
sys = {}
---@return integer
function sys.millis() end
---@return integer|nil
function sys.time() end
---@return integer|nil
function sys.battery() end
---@return table|nil
function sys.keys() end
---@return table|nil
function sys.memory() end
function sys.exit() end

---@class badge
badge = {}
---@return string|nil
function badge.id() end
---@return string|nil
function badge.owner() end
---@return boolean
function badge.online() end

---@class storage
storage = {}
---@param k string
---@return any
function storage.get(k) end
---@param k string
---@param v any
function storage.set(k, v) end
---@param k string
function storage.remove(k) end

---@class fs
fs = {}
---@param p string
---@return boolean
function fs.exists(p) end
---@param p string
---@return integer|nil
function fs.size(p) end
---@param p string|nil
---@return table
function fs.list(p) end
---@param p string
---@param off integer|nil
---@param len integer|nil
---@return string|nil, string|nil
function fs.read(p, off, len) end
---@param p string
---@return fun(): string|nil
function fs.lines(p) end
---@param p string
---@return any, string|nil
function fs.json(p) end
---@param p string
---@return fun(...: any): any|nil, string|nil
function fs.load(p) end

---@class json
json = {}
---@param v any
---@return string
function json.encode(v) end
---@param s string
---@return any, string|nil
function json.decode(s) end

---@class wifi
wifi = {}
---@return string
function wifi.status() end
---@return string|nil
function wifi.ssid() end
function wifi.on() end
function wifi.off() end

---@class meshPeer
---@field id string
---@field name string
---@field level integer
---@field rssi integer
---@field kind string
---@field bridged boolean

---@class mesh
mesh = {}
---@return meshPeer[]
function mesh.nearby() end
---@param to string
---@param msg table
function mesh.send(to, msg) end
function mesh.bridge() end
---@param id string
---@param data table
---@param cb fun(ok: boolean, res: any)
---@return boolean, string|nil
function mesh.meet(id, data, cb) end
---@param after any
---@param cb fun(ok: boolean, res: any)
function mesh.meets(after, cb) end
function mesh.pause() end
function mesh.resume() end
---@return {channel: integer, band: string, online: boolean, paused: boolean, event: integer, scanning: boolean}
function mesh.info() end
---@param n integer|nil
---@return boolean, string|nil
function mesh.channel(n) end
---@param opts table|nil
---@param cb fun(channels: table)
function mesh.scan(opts, cb) end

---@class bleLink
bleLink = {}
---@param service string
---@param chr string
---@param cb fun(ok: boolean, data: string|nil)
function bleLink:read(service, chr, cb) end
---@param service string
---@param chr string
---@param data string
---@param cb fun(ok: boolean, err: string|nil)|nil
function bleLink:write(service, chr, data, cb) end
---@param service string
---@param chr string
---@param on boolean|nil
function bleLink:subscribe(service, chr, on) end
function bleLink:close() end
---@return string
function bleLink:state() end

---@class ble
ble = {}
---@return boolean, string|nil
function ble.on() end
function ble.off() end
---@return string
function ble.state() end
---@return string|nil
function ble.address() end
---@param opts table|boolean
function ble.advertise(opts) end
---@param opts table|boolean
---@param cb fun(dev: table)|nil
function ble.scan(opts, cb) end
---@param dev table
---@param cb fun(what: string, a: any, b: any)
---@return bleLink
function ble.connect(dev, cb) end
---@param def table
---@param cb fun(what: string, a: any, b: any)
function ble.serve(def, cb) end
---@param chr string
---@param data string
function ble.set(chr, data) end
---@param chr string
---@param data string
---@return boolean, string|nil
function ble.notify(chr, data) end
function ble.drop() end

---@class lamps
lamps = {}
---@param cb fun(ok: boolean, res: any)
function lamps.balance(cb) end
---@param amount integer
---@param sku string
---@param cb fun(ok: boolean, res: any)
function lamps.spend(amount, sku, cb) end
---@param badgeId string
---@param amount integer
---@param memo string
---@param cb fun(ok: boolean, res: any)
function lamps.transfer(badgeId, amount, memo, cb) end
---@param address string
---@param amount integer
---@param memo string
---@param cb fun(ok: boolean, res: any)
function lamps.deposit(address, amount, memo, cb) end
---@param amount integer
---@param reason string
---@param cb fun(ok: boolean, res: any)
function lamps.award(amount, reason, cb) end

---@class items
items = {}
---@param cb fun(ok: boolean, res: any)
function items.list(cb) end
---@param cb fun(ok: boolean, res: any)
function items.all(cb) end
---@param kind string
---@param name string
---@param data table
---@param cb fun(ok: boolean, res: any)
function items.grant(kind, name, data, cb) end
---@param id any
---@param data table
---@param cb fun(ok: boolean, res: any)
function items.update(id, data, cb) end
---@param id any
---@param cb fun(ok: boolean, res: any)
function items.remove(id, cb) end

---@class profile
profile = {}
---@param cb fun(ok: boolean, res: any)
function profile.me(cb) end
---@param badgeId string
---@param cb fun(ok: boolean, res: any)
function profile.get(badgeId, cb) end

---@class quest
quest = {}
---@param event string
---@param data table|nil
---@param cb fun(ok: boolean, res: any)
function quest.report(event, data, cb) end
---@param cb fun(ok: boolean, res: any)
function quest.active(cb) end

---@class httpRes
---@field status integer
---@field body string
---@field type string
---@field truncated boolean
---@field location string|nil

---@class http
http = {}
---@param url string
---@param headers_or_cb table|fun(ok: boolean, res: any)
---@param cb fun(ok: boolean, res: any)|nil
function http.get(url, headers_or_cb, cb) end
---@param url string
---@param body string|table
---@param headers_or_cb table|fun(ok: boolean, res: any)
---@param cb fun(ok: boolean, res: any)|nil
function http.post(url, body, headers_or_cb, cb) end
---@param req {method: string, url: string, headers: table, body: string|table}
---@param cb fun(ok: boolean, res: any)
function http.request(req, cb) end

---@class wsSock
wsSock = {}
---@param data string|table
---@return boolean, string|nil
function wsSock:send(data) end
function wsSock:close() end
---@return string
function wsSock:state() end

---@class ws
ws = {}
---@param url string
---@param protocols_or_cb table|fun(event: string, data: any)
---@param cb fun(event: string, data: any)|nil
---@return wsSock
function ws.open(url, protocols_or_cb, cb) end

---@class rpc
rpc = {}
---@param method string
---@param params table|nil
---@param opts_or_cb table|fun(ok: boolean, res: any)
---@param cb fun(ok: boolean, res: any)|nil
function rpc.call(method, params, opts_or_cb, cb) end

---@class crypto
crypto = {}
---@param data string
---@return string
function crypto.sha256(data) end
---@param bytes string
---@return boolean
function crypto.on_curve(bytes) end
---@param key string
---@param message string
---@param signature string
---@return boolean
function crypto.verify(key, message, signature) end

---@class solana
solana = {}
---@param bytes string
---@return string
function solana.encode(bytes) end
---@param text string
---@return string|nil, string|nil
function solana.decode(text) end
---@param seeds table
---@param program string
---@return string|nil, integer|nil
function solana.pda(seeds, program) end

-- Lifecycle callbacks (define these globals in main.lua).
---@param key string
---@param rep boolean
---@return boolean|nil
function on_key(key, rep) end
---@param ms integer
function on_tick(ms) end
---@param from string
---@param msg table
function on_mesh(from, msg) end
---@param from string
---@param data table
---@return table|nil
function on_meet(from, data) end
function on_exit() end
