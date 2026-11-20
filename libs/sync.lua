-- sync.lua — reliable state sync over the lossy badge mesh.
-- Part of the BP26 Badge Kit (MIT). Badge Lua 5.5 sandbox + host Lua for tests.
--
-- Rules enforced (docs/NETWORKING.md): state messages <= maxBytes (default 180,
-- under the 200 B mesh JSON cap), resend unacked state every resendMs
-- (default 800), order and dedupe by (sender, key) (epoch, seq); the latest
-- newer update from any sender wins the key. Hostile input is dropped: keys
-- 1-64 B, seq a whole number in 1..2^31-2^20, epoch 0..2^20-1, at most 64
-- senders and 128 keys tracked. Sends go through the caller's send(msg, to):
-- state to "*", acks unicast back to the sender.
--
-- Usage:
--   local s = sync.new(function(msg, to) room:broadcast(msg, to) end)
--   s:set("count", 3)            -- nil,err when the message would be too big
--   s:get("count")
--   function on_mesh(from, msg) s:onMessage(from, msg) end
--   function on_tick(ms) s:tick(ms) end

local sync = {}

-- Rough JSON length estimate (badge has no stringification budget to spare).
-- Depth-capped so a cyclic or very deep local table cannot recurse forever.
local function estLen(v, depth)
  depth = depth or 0
  if depth > 8 then return math.huge end
  local t = type(v)
  if t == "number" then return #tostring(v) end
  if t == "string" then return #v + 2 end
  if t == "boolean" then return v and 4 or 5 end
  if t ~= "table" then return 4 end
  local n = 2
  for k, val in pairs(v) do
    n = n + estLen(k, depth + 1) + estLen(val, depth + 1) + 2
    if n == math.huge then return n end
  end
  return n
end

-- Epoch + seq per (sender, key). Badge integers are 32-bit and badge floats
-- are single-precision (measured: 4294967295.0 stores as 4294967296.0), so all
-- comparisons stay in small-int range: (epoch, seq) lexicographic order,
-- with the sender starting a new epoch before seq can approach INT32_MAX.
local SEQ_TOP = 2147483647 - 1048576 -- reset long before the 32-bit edge
local EP_MAX = 1048575                -- epochs past this are refused as hostile
local KEY_MAX = 64                    -- bytes per key name
local SENDERS_MAX = 64                -- senders tracked for ordering (flood bound)
local KEYS_MAX = 128                  -- distinct state keys held (flood bound)

-- Whole number in [lo, hi] (rejects NaN, inf, fractions, huge floats).
local function intIn(n, lo, hi)
  return type(n) == "number" and n == n and n >= lo and n <= hi and n == math.floor(n)
end

function sync.new(send, opts)
  if type(send) ~= "function" then error("sync: send(msg, to) function required") end
  opts = opts or {}
  -- acceptFrom(id) gates which senders' state applies. The mesh has no
  -- authentication: anyone running the app can send. Default accepts all
  -- (presence games); pass a roster check for anything that matters and
  -- re-verify on your server.
  local acceptFrom = opts.acceptFrom
  if acceptFrom ~= nil and type(acceptFrom) ~= "function" then
    error("sync: acceptFrom must be a function(id) or nil")
  end
  return setmetatable({
    _send = send,
    _resendMs = opts.resendMs or 800,
    _maxBytes = opts.maxBytes or 180,
    _state = {},
    _nkeys = 0,
    _seq = {},      -- key -> my last sent seq (within _ep[key])
    _ep = {},       -- key -> my current epoch
    _rx = {},       -- sender -> { last=, keys = { key -> {ep=, seq=} } }
    _nrx = 0,
    _pending = {},  -- key -> {seq=, ep=, msg=, last=}
    _acceptFrom = acceptFrom,
    _clock = 0,
    stats = { sent = 0, acked = 0, applied = 0, dupes = 0, refused = 0, dropped = 0 },
  }, { __index = sync })
end

function sync:get(key)
  return self._state[key]
end

-- Store a value, counting distinct keys so a flood cannot grow memory forever.
function sync:_store(key, value)
  if self._state[key] == nil then
    if value == nil then return true end
    if self._nkeys >= KEYS_MAX then return false end
    self._nkeys = self._nkeys + 1
  elseif value == nil then
    self._nkeys = self._nkeys - 1
  end
  self._state[key] = value
  return true
end

function sync:set(key, value)
  if type(key) ~= "string" or #key == 0 or #key > KEY_MAX then
    return nil, "key must be a string of 1-" .. KEY_MAX .. " bytes"
  end
  local seq = (self._seq[key] or 0) + 1
  local ep = self._ep[key] or 0
  if seq > SEQ_TOP then seq, ep = 1, ep + 1 end -- new epoch before int32 edge
  local msg = { t = "st", k = key, v = value, seq = seq, ep = ep }
  if estLen(msg) > self._maxBytes then
    self.stats.refused = self.stats.refused + 1
    return nil, "state message over " .. tostring(self._maxBytes) .. " B (keep mesh messages small)"
  end
  if not self:_store(key, value) then
    self.stats.refused = self.stats.refused + 1
    return nil, "too many state keys (max " .. KEYS_MAX .. ")"
  end
  self._seq[key], self._ep[key] = seq, ep
  self._pending[key] = { seq = seq, ep = ep, msg = msg, last = self._clock }
  self._send(msg, "*")
  self.stats.sent = self.stats.sent + 1
  return true
end

function sync:_ack(to, key, seq, ep)
  self._send({ t = "ack", k = key, seq = seq, ep = ep }, to)
  self.stats.sent = self.stats.sent + 1
end

-- Per-sender ordering record; evicts the stalest sender past SENDERS_MAX.
function sync:_sender(from)
  local r = self._rx[from]
  if not r then
    if self._nrx >= SENDERS_MAX then
      local oldest, oldestLast = nil, nil
      for id, x in pairs(self._rx) do
        if oldestLast == nil or x.last < oldestLast then oldest, oldestLast = id, x.last end
      end
      if oldest ~= nil then self._rx[oldest] = nil; self._nrx = self._nrx - 1 end
    end
    r = { last = self._clock, keys = {}, nkeys = 0 }
    self._rx[from] = r
    self._nrx = self._nrx + 1
  end
  r.last = self._clock
  return r
end

function sync:onMessage(from, msg)
  if type(from) ~= "string" or type(msg) ~= "table" or type(msg.t) ~= "string" then return end
  local k, seq = msg.k, msg.seq
  local ep = msg.ep
  if ep == nil then ep = 0 end -- pre-epoch senders: epoch 0
  if type(k) ~= "string" or #k == 0 or #k > KEY_MAX
      or not intIn(seq, 1, SEQ_TOP) or not intIn(ep, 0, EP_MAX) then
    self.stats.dropped = self.stats.dropped + 1
    return
  end
  if msg.t == "st" then
    if self._acceptFrom and not self._acceptFrom(from) then return end
    -- Ordering is per (sender, key): a hostile peer can only ever advance its
    -- own counter, never freeze a key for everyone else.
    local r = self:_sender(from)
    local last = r.keys[k]
    local newer = (last == nil) or (ep > last.ep) or (ep == last.ep and seq > last.seq)
    if newer then
      if last == nil then
        if r.nkeys >= KEYS_MAX then self.stats.dropped = self.stats.dropped + 1 return end
        r.nkeys = r.nkeys + 1
        last = {}
        r.keys[k] = last
      end
      if self:_store(k, msg.v) then
        last.ep, last.seq = ep, seq
        self.stats.applied = self.stats.applied + 1
      else
        self.stats.dropped = self.stats.dropped + 1
        return
      end
    else
      self.stats.dupes = self.stats.dupes + 1
    end
    self:_ack(from, k, seq, ep)
  elseif msg.t == "ack" then
    local p = self._pending[k]
    if p and ep == p.ep and seq >= p.seq then
      self._pending[k] = nil
      self.stats.acked = self.stats.acked + 1
    end
  end
end

function sync:tick(ms)
  self._clock = self._clock + (ms or 0)
  for key, p in pairs(self._pending) do
    if self._clock - p.last >= self._resendMs then
      p.last = self._clock
      self._send(p.msg, "*")
      self.stats.sent = self.stats.sent + 1
    end
  end
end

function sync:pending()
  local n = 0
  for _ in pairs(self._pending) do n = n + 1 end
  return n
end

-- exposed for tests
sync._estLen = estLen

return sync
