-- lobby.lua — host/join rooms over the badge mesh.
-- Part of the BP26 Badge Kit (MIT). Runs on the badge (Lua 5.5 sandbox,
-- "mesh" permission) and under plain host Lua for tests (no badge globals
-- required: pass deps).
--
-- Model (verified platform rules, docs/NETWORKING.md):
--   mesh.send("*", table) broadcasts <= 200 B JSON at <= 4/s, lossy, in order
--   per peer over a bridge (~1-3 s) and unordered over radio. So: send state,
--   repeat until acked; heartbeats carry the room so scanners can find games.
--
-- Usage:
--   local room = lobby.new({ room = "demo" })          -- uses globals mesh/badge
--   local room = lobby.new({ room = "demo" }, deps)    -- tests: deps={mesh=..., badge=...}
--   room:tick(ms)            -- call from on_tick
--   room:onMesh(from, msg)   -- call from on_mesh
--   room:peers()             -- badge peers seen in this room (+ unfiltered nearby)
--   room:broadcast(msg, to) -- mesh.send wrapper ("*" default)
--   room:hostId()            -- deterministic host: lowest id of self + room peers
--   room:leave()

local lobby = {}

local HB_MS = 1500        -- heartbeat period (HELLOs go every ~1.5 s; match that)
local PEER_TTL_MS = 35000 -- a little past the 30 s mesh peer TTL
-- Max room peers tracked (heartbeat flood bound): oldest expires first.
local SEEN_MAX = 64

local function nowMs(deps)
  if deps.time then return deps.time() end
  if sys and sys.millis then return sys.millis() end
  return 0
end

local function selfId(deps)
  if deps.badge and deps.badge.id then
    local id = deps.badge.id()
    if id then return id end
  end
  if badge and badge.id then
    local ok, id = pcall(badge.id)
    if ok and id then return id end
  end
  return "?"
end

local function selfName(deps, id)
  if deps.badge and deps.badge.owner then
    local ok, o = pcall(deps.badge.owner)
    if ok and o then return o end
  end
  if badge and badge.owner then
    local ok, o = pcall(badge.owner)
    if ok and o then return o end
  end
  return id
end

function lobby.new(opts, deps)
  opts = opts or {}
  deps = deps or {}
  local meshApi = deps.mesh or (mesh and mesh)
  if not meshApi then error("lobby: no mesh API (needs the 'mesh' permission)") end
  local self = {
    _room = opts.room or "lobby",
    _mesh = meshApi,
    _deps = deps,
    _acc = HB_MS, -- send a heartbeat on the first tick
    _seen = {},   -- id -> {name=, room=, bridged=, last=}
    _left = false,
  }
  return setmetatable(self, { __index = lobby })
end

function lobby:id()
  return selfId(self._deps)
end

function lobby:setRoom(name)
  self._room = name
  self._seen = {}
  self._left = false
end

-- Stop participating: clears room state and stops heartbeats until setRoom.
function lobby:leave()
  self._seen = {}
  self._left = true
end

function lobby:_heartbeat(t)
  local msg = { t = "hb", room = self._room, host = self:id(), name = selfName(self._deps, self:id()) }
  self._mesh.send("*", msg)
  self._acc = 0
end

function lobby:tick(ms)
  local t = nowMs(self._deps) + (ms or 0)
  -- expire peers past TTL
  for id, p in pairs(self._seen) do
    if t - p.last > PEER_TTL_MS then self._seen[id] = nil end
  end
  self._acc = (self._acc or HB_MS) + (ms or 0)
  if not self._left and self._acc >= HB_MS then
    local ok = pcall(function() self:_heartbeat(t) end)
    if ok then self._acc = 0 end
  end
end

function lobby:onMesh(from, msg)
  -- `from` is the firmware-reported sender id; msg.host/msg.name are claims
  -- and never decide who hosts (see hostId).
  if type(from) ~= "string" or type(msg) ~= "table" then return end
  if msg.t == "hb" and type(msg.room) == "string" then
    if type(msg.name) ~= "string" and msg.name ~= nil then return end
    if not self._seen[from] then
      -- flood bound: evict the stalest entry before growing past SEEN_MAX
      local n = 0
      local oldest, oldestLast = nil, nil
      for id, p in pairs(self._seen) do
        n = n + 1
        if oldestLast == nil or p.last < oldestLast then oldest, oldestLast = id, p.last end
      end
      if n >= SEEN_MAX and oldest ~= nil then self._seen[oldest] = nil end
    end
    self._seen[from] = {
      name = type(msg.name) == "string" and msg.name or from,
      room = msg.room,
      bridged = msg.bridged == true,
      last = nowMs(self._deps),
    }
  end
end

-- Badge peers in this room (from heartbeats), plus any nearby badge we have
-- not heard a heartbeat from yet (so a fresh join still lists someone).
function lobby:peers()
  local out, known = {}, {}
  for id, p in pairs(self._seen) do
    if p.room == self._room then
      out[#out + 1] = { id = id, name = p.name, bridged = p.bridged, kind = "badge" }
      known[id] = true
    end
  end
  local ok, nearby = pcall(function() return self._mesh.nearby() end)
  if ok and type(nearby) == "table" then
    for _, p in ipairs(nearby) do
      if type(p) == "table" and type(p.id) == "string" and p.kind == "badge" and not known[p.id] then
        out[#out + 1] = { id = p.id, name = type(p.name) == "string" and p.name or p.id, bridged = p.bridged == true, kind = "badge" }
      end
    end
  end
  table.sort(out, function(a, b) return a.id < b.id end)
  return out
end

-- Deterministic host: lowest id among self + room peers. No election traffic.
function lobby:hostId()
  local best = self:id()
  for id, p in pairs(self._seen) do
    if p.room == self._room and id < best then best = id end
  end
  return best
end

function lobby:isHost()
  return self:hostId() == self:id()
end

function lobby:broadcast(msg, to)
  self._mesh.send(to or "*", msg)
end

return lobby
