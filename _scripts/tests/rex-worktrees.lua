-- Run with: rex --autostart=false do ./_scripts/tests/rex-worktrees.lua root="$PWD"
-- All Rex calls and helper-file reads are mocked. No sessions or files change.
local real_rex, real_open = rex, io.open
local root = assert(real_rex.args.root, "pass root=the-repository-path")
local state = { actions = {}, bindings = {}, created = {}, queued = {}, deployed = true,
  host = "local", directory = "/repo with spaces" }
io.open = function()
  if state.deployed then return { close = function() end } end
  return nil
end
rex = {
  action = function(action) state.actions[action.name] = action end,
  bind = function(key, action, args)
    state.bindings[key] = { action = action, args = args }
  end,
  call = function(method, args)
    if method == "server.status" then return { host_id = "local" } end
    assert(method == "session.create", "unexpected real operation: " .. method)
    table.insert(state.created, args)
    return { session_id = "menu" }
  end,
  session = { view = function(args)
    assert(args.session_id == "source")
    return { windows = {{ layers = {{ blocks = {{ block_id = "block", host_id = state.host,
      creator_name = "com.superlogical.terminal" }} }} }} }
  end },
  block = { call = function(creator, method, args)
    assert(creator == "com.superlogical.terminal" and method == "process")
    assert(args.session_id == "source" and args.block_id == "block")
    return { foreground = { cwd = state.directory } }
  end },
  layout = { block = function(layout) return { block = layout } end },
  client = { queue = function(action, args)
    assert(action == "session.select" and args.session_id == "menu")
    table.insert(state.queued, args)
  end },
}
dofile(root .. "/rex/.config/rex/init.lua")
assert(#state.created == 0 and #state.queued == 0, "config load must have no side effects")
local context = { session_id = "source", block_id = "block", client_id = "client" }
for _, pair in ipairs({ {"new", "g"}, {"open", "o"}, {"delete", "d"} }) do
  local action = "worktree_" .. pair[1]
  assert(state.bindings["ctrl+b>shift+" .. pair[2]].action == action)
  state.actions[action].run(context)
  local menu = state.created[#state.created]
  assert(menu.label == "rex-worktrees-" .. pair[1])
  assert(#menu.initial_windows == 1)
  local options = menu.initial_windows[1].layout.block.options
  assert(options.command[1] == "python3")
  assert(options.command[2]:match("/rex/worktrees.py$"))
  assert(options.command[3] == pair[1], "loop closures must keep their own mode")
  assert(options.command[4] == "source" and options.command[5] == "block")
  assert(options.command[6] == "client" and options.command[7] == state.directory)
  assert(options.cwd ~= state.directory, "menu cannot occupy the deleted checkout")
  assert(options.exit.on_completion == false)
end
assert(#state.queued == 3)
assert(state.bindings["ctrl+b>ctrl+b"].action == "pane.send_key")
assert(state.bindings["ctrl+b>ctrl+b"].args.key == "ctrl+b")
local function refused(ctx)
  local before = #state.created
  assert(not pcall(state.actions.worktree_delete.run, ctx))
  assert(#state.created == before, "invalid contexts cannot create a menu")
end
refused({})
state.host = "remote"
refused(context)
state.host, state.directory = "local", nil
refused(context)
state.directory, state.deployed = "/repo with spaces", false
refused(context)
rex, io.open = real_rex, real_open
return { ok = true, actions = 3, rejected_contexts = 4, bindings = 4 }
