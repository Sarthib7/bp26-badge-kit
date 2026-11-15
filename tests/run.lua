-- run.lua — kit Lua unit tests (lobby + sync + net_sim).
-- Runs on host Lua 5.1+ (badge code stays in a 5.1-compatible subset) and on
-- the badge's Lua 5.5. Deterministic: fixed seed 81.
-- Usage: lua tests/run.lua   (exit 0 = all pass)

package.path = package.path .. ";./libs/?.lua;./tests/?.lua"

print("host lua " .. _VERSION)

local lobby = require("lobby")
local sync = require("sync")
local net_sim = require("net_sim")

local passed, failed = 0, 0
local function check(name, cond, extra)
  if cond then
    passed = passed + 1
    print("ok   " .. name .. (extra and ("  [" .. extra .. "]") or ""))
  else
    failed = failed + 1
    print("FAIL " .. name .. (extra and ("  [" .. extra .. "]") or ""))
  end
end

-- Wire one lib instance to the sim through a fake badge mesh.
local function wire(s, id, clock)
  local mesh = {}
  mesh.send = function(to, msg) s:send(id, to, msg, clock.t) end
  mesh.nearby = function() return s:roster(id) end
  local badge = { id = function() return id end, owner = function() return "@" .. id end }
  return { mesh = mesh, badge = badge, time = function() return clock.t end }
end

-- 1. lobby discovery + deterministic host -------------------------------------
do
  local s = net_sim.new({ seed = 81 })
  s:addNode("AA1111"); s:addNode("BB2222")
  local c1, c2 = { t = 0 }, { t = 0 }
  local r1 = lobby.new({ room = "demo" }, wire(s, "AA1111", c1))
  local r2 = lobby.new({ room = "demo" }, wire(s, "BB2222", c2))
  for t = 0, 5000, 100 do
    c1.t, c2.t = t, t
    r1:tick(100); r2:tick(100)
    s:step(t)
    for _, m in ipairs(s:collect("AA1111")) do r1:onMesh(m.from, m.msg) end
    for _, m in ipairs(s:collect("BB2222")) do r2:onMesh(m.from, m.msg) end
  end
  check("lobby/discover", #r1:peers() == 1 and r1:peers()[1].id == "BB2222", "peers=" .. #r1:peers())
  check("lobby/host-deterministic", r1:hostId() == "AA1111" and r2:hostId() == "AA1111", "host=" .. r1:hostId())
  r1:leave()
  local sentBefore = s.stats.sent
  for t = 5100, 8000, 100 do
    c1.t = t
    r1:tick(100)
    s:step(t)
  end
  check("lobby/leave-stops-heartbeats", s.stats.sent == sentBefore, "sent_delta=0")
end

-- 2. sync converges with no loss ------------------------------------------------
do
  local s = net_sim.new({ seed = 81 })
  s:addNode("AA1111"); s:addNode("BB2222")
  local c = { t = 0 }
  local function mk(id)
    local st
    st = sync.new(function(msg, to) s:send(id, to or "*", msg, c.t) end)
    return st
  end
  local a, b = mk("AA1111"), mk("BB2222")
  local convergedAt = nil
  for t = 0, 10000, 50 do
    c.t = t
    if t == 500 then a:set("count", 5) end
    a:tick(50); b:tick(50)
    s:step(t)
    for _, m in ipairs(s:collect("AA1111")) do a:onMessage(m.from, m.msg) end
    for _, m in ipairs(s:collect("BB2222")) do b:onMessage(m.from, m.msg) end
    if not convergedAt and b:get("count") == 5 and a:pending() == 0 then convergedAt = t end
  end
  check("sync/no-loss-converges", b:get("count") == 5, "converged_at=" .. tostring(convergedAt) .. "ms")
end

-- 3. sync converges under 20% loss ----------------------------------------------
do
  local s = net_sim.new({ seed = 81, loss = 0.2 })
  s:addNode("AA1111"); s:addNode("BB2222")
  local c = { t = 0 }
  local a = sync.new(function(msg, to) s:send("AA1111", to or "*", msg, c.t) end)
  local b = sync.new(function(msg, to) s:send("BB2222", to or "*", msg, c.t) end)
  local convergedAt = nil
  for t = 0, 30000, 50 do
    c.t = t
    if t == 500 then a:set("score", 42) end
    a:tick(50); b:tick(50)
    s:step(t)
    for _, m in ipairs(s:collect("AA1111")) do a:onMessage(m.from, m.msg) end
    for _, m in ipairs(s:collect("BB2222")) do b:onMessage(m.from, m.msg) end
    if not convergedAt and b:get("score") == 42 and a:pending() == 0 then convergedAt = t end
  end
  check("sync/20pct-loss-converges", b:get("score") == 42,
    string.format("sent=%d delivered=%d lost=%d dupes=%d converged_at=%sms",
      s.stats.sent, s.stats.delivered, s.stats.droppedLoss, s.stats.dupes, tostring(convergedAt)))
end

-- 4. resend: a dropped first state is retransmitted and then acked ----------------
do
  local out = {}
  local dropFirst = true
  local st = sync.new(function(msg, to)
    if dropFirst and msg.t == "st" then dropFirst = false return end
    out[#out + 1] = { msg = msg, to = to }
  end, { resendMs = 800 })
  st:set("k", 1)
  check("sync/resend-pending-before-ack", st:pending() == 1, "")
  st:tick(800) -- resend fires
  check("sync/resend-retransmits", #out == 1 and out[1].msg.seq == 1, "retransmits=" .. #out)
  st:onMessage("peer", { t = "ack", k = "k", seq = 1 })
  check("sync/resend-acked", st:pending() == 0 and st.stats.acked == 1, "")
end

-- 5. dedupe: duplicate delivery applies once ------------------------------------
do
  local acked = 0
  local st = sync.new(function() acked = acked + 1 end)
  st:onMessage("BB2222", { t = "st", k = "x", v = 1, seq = 1 })
  st:onMessage("BB2222", { t = "st", k = "x", v = 1, seq = 1 })
  check("sync/dedupe-once", st:get("x") == 1 and st.stats.applied == 1 and st.stats.dupes == 1,
    "applied=" .. st.stats.applied .. " dupes=" .. st.stats.dupes)
  check("sync/ack-sent", acked == 2, "acks=" .. acked)
end

-- 6. size guard ------------------------------------------------------------------
do
  local st = sync.new(function() end, { maxBytes = 180 })
  local ok, err = st:set("big", string.rep("z", 400))
  check("sync/size-guard-refuses", ok == nil and err ~= nil, err or "")
  local ok2 = st:set("small", 1)
  check("sync/small-passes", ok2 == true, "")
end

-- 7. rate cap enforced by the sim -------------------------------------------------
do
  local s = net_sim.new({ seed = 81 })
  s:addNode("AA1111"); s:addNode("BB2222")
  local accepted = 0
  for i = 1, 6 do
    if s:send("AA1111", "*", { t = "ping", i = i }, 0) then accepted = accepted + 1 end
  end
  check("sim/rate-cap-4-per-s", accepted == 4 and s.stats.droppedRate == 2,
    "accepted=" .. accepted .. " droppedRate=" .. s.stats.droppedRate)
  local okSize = s:send("AA1111", "*", { t = "big", v = string.rep("z", 400) }, 2000)
  check("sim/size-cap-200B", okSize == false and s.stats.droppedSize == 1, "")
end

-- 8. clock skew tolerated ----------------------------------------------------------
do
  local s = net_sim.new({ seed = 81, loss = 0.1, skew = { BB2222 = 5000 } })
  s:addNode("AA1111"); s:addNode("BB2222")
  local c = { t = 0 }
  local a = sync.new(function(msg, to) s:send("AA1111", to or "*", msg, c.t) end)
  local b = sync.new(function(msg, to) s:send("BB2222", to or "*", msg, c.t) end)
  for t = 0, 30000, 50 do
    c.t = t
    if t == 500 then a:set("move", "e2e4") end
    a:tick(50); b:tick(50)
    s:step(t)
    for _, m in ipairs(s:collect("AA1111")) do a:onMessage(m.from, m.msg) end
    for _, m in ipairs(s:collect("BB2222")) do b:onMessage(m.from, m.msg) end
  end
  check("sync/5s-skew-tolerated", b:get("move") == "e2e4", "delivered=" .. s.stats.delivered)
end

-- 9. hostile peer input never crashes or wedges -----------------------------------
do
  local st = sync.new(function() end)
  -- Explicit count: a literal nil would end ipairs() and make this vacuous.
  local bad = {
    n = 17,
    [1] = nil, [2] = 42, [3] = "str", [4] = true,
    [5] = {}, [6] = { t = 1 }, [7] = { t = "st" }, [8] = { t = "st", k = 1, seq = 1 },
    [9] = { t = "st", k = "k", seq = "1" }, [10] = { t = "st", k = "k", seq = 0 },
    [11] = { t = "ack" }, [12] = { t = "ack", k = {}, seq = {} },
    [13] = { t = "st", k = "k", seq = 2 ^ 40, v = { a = { b = { c = 1 } } } },
    [14] = { t = "st", k = string.rep("k", 5000), seq = -1, v = string.rep("v", 5000) },
    [15] = { t = "st", k = "k", seq = 1.5, v = 1 },
    [16] = { t = "st", k = "k", seq = 0 / 0, v = 1 },
    [17] = { t = "st", k = "k", seq = 1, ep = 2 ^ 40, v = 1 },
  }
  local seen = 0
  for i = 1, bad.n do
    seen = seen + 1
    local ok = pcall(st.onMessage, st, "EVIL", bad[i])
    if not ok then seen = -1000 end
  end
  st:onMessage(42, { t = "st", k = "k", seq = 1, v = 1 }) -- non-string sender
  st:tick(10 ^ 9)
  check("sync/hostile-input-safe", seen == bad.n and st:get("k") == nil and st:pending() == 0
    and st.stats.applied == 0, "cases=" .. seen .. " applied=" .. st.stats.applied)
end

-- 9b. a hostile max-seq cannot freeze a key for honest senders -------------------
do
  local st = sync.new(function() end)
  st:onMessage("EVIL", { t = "st", k = "k", v = "evil", seq = 2147483647 - 1048576, ep = 1048575 })
  st:onMessage("FRIEND", { t = "st", k = "k", v = "legit1", seq = 1 })
  local a = st:get("k")
  st:onMessage("FRIEND", { t = "st", k = "k", v = "legit2", seq = 2 })
  st:onMessage("FRIEND", { t = "st", k = "k", v = "replayed", seq = 1 })
  check("sync/no-wedge-by-high-seq", a == "legit1" and st:get("k") == "legit2", tostring(st:get("k")))
end

-- 9c. key/sender floods stay bounded --------------------------------------------------
do
  local st = sync.new(function() end)
  for i = 1, 500 do st:onMessage("S" .. i, { t = "st", k = "k" .. i, v = i, seq = 1 }) end
  local senders, keys = 0, 0
  for _ in pairs(st._rx) do senders = senders + 1 end
  for _ in pairs(st._state) do keys = keys + 1 end
  check("sync/flood-bounded", senders <= 64 and keys <= 128, "senders=" .. senders .. " keys=" .. keys)
end

-- 10. epoch rollover keeps working --------------------------------------------------
do
  local top = 2147483647 - 1048576
  local sent
  local st = sync.new(function(m) sent = m end)
  st._seq["w"], st._ep["w"] = top, 0 -- white-boxed near the reset edge
  local ok = st:set("w", "rolled")
  check("sync/epoch-rolls-before-int32max", ok == true and sent.ep == 1 and sent.seq == 1, "")
  -- receiver on the old epoch accepts the new-epoch state ...
  local rx = sync.new(function() end)
  rx:onMessage("peer", { t = "st", k = "w", v = "old", seq = top, ep = 0 })
  rx:onMessage("peer", { t = "st", k = "w", v = "rolled", seq = 1, ep = 1 })
  check("sync/epoch-accepted", rx:get("w") == "rolled", "")
  -- ... and still rejects the stale old-epoch replay
  rx:onMessage("peer", { t = "st", k = "w", v = "stale", seq = top, ep = 0 })
  check("sync/epoch-replay-rejected", rx:get("w") == "rolled", "")
end

-- 11. sender filter ----------------------------------------------------------------
do
  local st = sync.new(function() end, { acceptFrom = function(id) return id == "FRIEND" end })
  st:onMessage("EVIL", { t = "st", k = "k", v = 1, seq = 1 })
  st:onMessage("FRIEND", { t = "st", k = "k", v = 2, seq = 1 })
  check("sync/acceptFrom-filters", st:get("k") == 2, "")
end

-- 12. heartbeat flood is bounded ----------------------------------------------------
do
  local c = { t = 0 }
  local deps = { mesh = { send = function() end, nearby = function() return {} end }, time = function() return c.t end }
  local r = lobby.new({ room = "x" }, deps)
  for i = 1, 200 do
    c.t = i
    r:onMesh("peer" .. i, { t = "hb", room = "x", name = "p" })
  end
  local n = 0
  for _ in pairs(r._seen) do n = n + 1 end
  check("lobby/flood-bounded", n <= 64, "tracked=" .. n)
end

-- 13. host cannot be claimed through message content ----------------------------------
do
  local deps = { mesh = { send = function() end, nearby = function()
      return { { id = 7, kind = "badge" }, { id = "CC3333", kind = "badge", name = {} } } end },
    badge = { id = function() return "MM5555" end }, time = function() return 0 end }
  local r = lobby.new({ room = "x" }, deps)
  r:onMesh("ZZ9999", { t = "hb", room = "x", host = "000000", name = "fake" })
  r:onMesh(nil, { t = "hb", room = "x" })
  local ok, peers = pcall(r.peers, r)
  check("lobby/host-spoof-ignored", r:hostId() == "MM5555" and ok and #peers == 2, "host=" .. r:hostId())
end

print(string.format("--- lua: %d passed, %d failed", passed, failed))
os.exit(failed == 0 and 0 or 1)
