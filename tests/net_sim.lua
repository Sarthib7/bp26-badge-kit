-- net_sim.lua — deterministic lossy mesh simulator for kit library tests.
-- Part of the BP26 Badge Kit (MIT). Host Lua only (tests); mirrors the
-- documented platform rules: <= 200 B JSON, <= 4 sends/s per badge, lossy and
-- unordered delivery, per-node clock skew. Seed it for repeatable numbers.

local sim = {}

local function estLen(v)
  local t = type(v)
  if t == "number" then return #tostring(v) end
  if t == "string" then return #v + 2 end
  if t == "boolean" then return v and 4 or 5 end
  if t ~= "table" then return 4 end
  local n = 2
  for k, val in pairs(v) do n = n + estLen(k) + estLen(val) + 2 end
  return n
end

function sim.new(opts)
  opts = opts or {}
  if opts.seed then math.randomseed(opts.seed) end
  return setmetatable({
    loss = opts.loss or 0,
    dupe = opts.dupe or 0,
    delayMin = opts.delayMin or 0,
    delayMax = opts.delayMax or 0,
    skew = opts.skew or {},
    sizeCap = opts.sizeCap or 200,
    ratePerSec = opts.ratePerSec or 4,
    nodes = {},   -- id -> {id=, inbox={}, tokens=4, last=0}
    queue = {},   -- {to=, from=, msg=, at=}
    stats = { sent = 0, delivered = 0, droppedLoss = 0, droppedRate = 0, droppedSize = 0, dupes = 0 },
  }, { __index = sim })
end

function sim:addNode(id)
  self.nodes[id] = { id = id, inbox = {}, tokens = self.ratePerSec, last = 0 }
end

function sim:roster(except)
  local out = {}
  for id in pairs(self.nodes) do
    if id ~= except then
      out[#out + 1] = { id = id, name = id, kind = "badge", bridged = false }
    end
  end
  return out
end

-- nowMs: sender's local clock. Returns true if accepted for delivery.
function sim:send(from, to, msg, nowMs)
  local n = self.nodes[from]
  if not n then return false end
  nowMs = nowMs or 0
  -- token bucket refill
  local dt = math.max(0, nowMs - (n.last or 0))
  n.tokens = math.min(self.ratePerSec, (n.tokens or 0) + dt * self.ratePerSec / 1000)
  n.last = nowMs
  if estLen(msg) > self.sizeCap then
    self.stats.droppedSize = self.stats.droppedSize + 1
    return false
  end
  if n.tokens < 1 then
    self.stats.droppedRate = self.stats.droppedRate + 1
    return false
  end
  n.tokens = n.tokens - 1
  self.stats.sent = self.stats.sent + 1
  local targets = {}
  if to == "*" then
    for id in pairs(self.nodes) do
      if id ~= from then targets[#targets + 1] = id end
    end
  elseif self.nodes[to] then
    targets[1] = to
  end
  for _, id in ipairs(targets) do
    if math.random() < self.loss then
      self.stats.droppedLoss = self.stats.droppedLoss + 1
    else
      local delay = self.delayMin + math.random() * (self.delayMax - self.delayMin)
      local copies = 1
      if math.random() < self.dupe then
        copies = 2
        self.stats.dupes = self.stats.dupes + 1
      end
      for _ = 1, copies do
        self.queue[#self.queue + 1] = { to = id, from = from, msg = msg, at = nowMs + delay }
      end
    end
  end
  return true
end

-- Deliver everything due at nowMs (receiver clocks may skew).
function sim:step(nowMs)
  local keep = {}
  for _, q in ipairs(self.queue) do
    if q.at <= nowMs then
      local skew = self.skew[q.to] or 0
      if q.at + skew <= nowMs then
        local n = self.nodes[q.to]
        n.inbox[#n.inbox + 1] = { from = q.from, msg = q.msg }
        self.stats.delivered = self.stats.delivered + 1
      else
        keep[#keep + 1] = q
      end
    else
      keep[#keep + 1] = q
    end
  end
  self.queue = keep
end

function sim:collect(id)
  local n = self.nodes[id]
  local out = n.inbox
  n.inbox = {}
  return out
end

sim._estLen = estLen

return sim
