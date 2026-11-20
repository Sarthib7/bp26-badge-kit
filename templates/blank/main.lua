-- My App: blank starter. Runs on any badge with Solana OS 0.5.0+.
-- Keys: up/down/left/right move the dot (sys.keys needs 0.5.11, guarded),
-- SELECT toasts, CANCEL exits.

local x, y = 160, 100
local dot = ui.rect(x, y, 8, 8, { color = "green" })
local label = ui.label(8, 8, "Hello, badge!", { size = 20 })
ui.hint("SELECT hi   CANCEL exit")

function on_tick(ms)
  local k = sys.keys and sys.keys() or {}
  local d = ms // 10 -- 100 px a second (integer math: 32-bit)
  if k.left then x = x - d elseif k.right then x = x + d end
  if k.up then y = y - d elseif k.down then y = y + d end
  dot:pos(x, y)
end

function on_key(key)
  if key == "select" then
    ui.toast("Hi from " .. (badge.id() or "unclaimed badge"))
    return true
  end
  return false
end
