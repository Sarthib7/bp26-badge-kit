-- Mesh Demo: host or join a room, share one counter over ESP-NOW.
-- Same app on both badges, same radio channel (the event channel by default).
-- Messages are lossy and tiny (<= 200 B, 4/s): we send state, repeat until
-- acked. Out of radio range? RIGHT opens mesh.bridge() instead.
-- Needs the "mesh" permission. Badge or emulator-two-tabs; no Wi-Fi needed.

local lobby = require("lib.lobby")
local sync = require("lib.sync")

local room = lobby.new({ room = "demo" })

-- Shared counter, last-writer-wins per key. Feeds the mesh via lobby.
local shared = sync.new(
  function(msg, to) room:broadcast(msg, to) end,
  { resendMs = 800, maxBytes = 180 }
)

local title = ui.label(8, 8, "Mesh Demo", { size = 20 })
local peersL = ui.label(8, 36, "peers: ...", { size = 14 })
local countL = ui.label(8, 60, "count: 0", { size = 32 })
local logL = ui.label(8, 110, "", { size = 12 })
ui.hint("SELECT +1   RIGHT bridge   CANCEL exit")

local function refresh()
  local names = {}
  for _, p in ipairs(room:peers()) do
    names[#names + 1] = (p.name ~= "" and p.name or p.id) .. (p.bridged and " (bridged)" or "")
  end
  peersL:text("peers: " .. (#names > 0 and table.concat(names, ", ") or "none — open on both badges"))
  countL:text("count: " .. tostring(shared:get("count") or 0))
end

function on_tick(ms)
  room:tick(ms)
  shared:tick(ms)
  refresh()
end

function on_mesh(from, msg)
  room:onMesh(from, msg)
  shared:onMessage(from, msg)
  refresh()
end

function on_key(key)
  if key == "select" then
    shared:set("count", (shared:get("count") or 0) + 1)
    refresh()
    return true
  end
  if key == "right" then
    if mesh.bridge then mesh.bridge() end
    return true
  end
  return false
end

function on_exit()
  room:leave()
end

if badge.id() then
  title:text("Mesh Demo (" .. badge.id() .. ")")
end
logL:text("host: " .. room:hostId())
