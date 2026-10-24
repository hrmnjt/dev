-- Rex's own Lua runtime; all session/client operations are mocked.
-- root=<repo> runs binding checks only. fixture=<private scratch> adds real Git tests.
local real, real_open = rex, io.open
local root = assert(real.args.root, "pass root=the-repository-path")
local fixture_root = real.args.fixture
if real.args.lock_probe then
  local module = dofile(root .. "/rex/.config/rex/worktrees.lua")
  local lock = module.acquire(real, real.args.lock_probe)
  print("LOCK_READY"); io.flush()
  real.sleep(60)
  lock.release()
  return
end
local wiring = { actions = {}, bindings = {}, created = {}, queued = {}, deployed = true,
  host = "local", directory = "/repo with spaces" }
io.open = function()
  if wiring.deployed then return { close = function() end } end
end
rex = {
  json = real.json,
  action = function(action) wiring.actions[action.name] = action end,
  bind = function(key, action, args) wiring.bindings[key] = { action = action, args = args } end,
  call = function(method, args)
    if method == "server.status" then return { host_id = "local" } end
    assert(method == "session.create", "unexpected operation: " .. method)
    table.insert(wiring.created, args)
    return { session_id = "menu" }
  end,
  session = { view = function(args)
    assert(args.session_id == "source")
    return { windows = {{ layers = {{ blocks = {{ block_id = "block", host_id = wiring.host,
      creator_name = "com.superlogical.terminal" }} }} }} }
  end },
  block = { call = function(creator, method, args)
    assert(creator == "com.superlogical.terminal" and method == "process")
    assert(args.session_id == "source" and args.block_id == "block")
    return { foreground = { cwd = wiring.directory } }
  end },
  layout = { block = function(layout) return { block = layout } end },
  client = { queue = function(action, args)
    assert(action == "session.select" and args.session_id == "menu")
    table.insert(wiring.queued, args)
  end },
}
dofile(root .. "/rex/.config/rex/init.lua")
assert(#wiring.created == 0 and #wiring.queued == 0, "config load must have no side effects")
local context = { session_id = "source", block_id = "block", client_id = "client" }
for _, pair in ipairs({ {"new", "g"}, {"open", "o"}, {"delete", "d"} }) do
  local action = "worktree_" .. pair[1]
  assert(wiring.bindings["ctrl+b>shift+" .. pair[2]].action == action)
  wiring.actions[action].run(context)
  local menu = wiring.created[#wiring.created]
  assert(menu.label == "rex-worktrees-" .. pair[1] and #menu.initial_windows == 1)
  local options = menu.initial_windows[1].layout.block.options
  local argv = options.command
  assert(argv[1]:match("rex$") and argv[2] == "--autostart=false")
  assert(argv[3] == "-C" and argv[4] == "client" and argv[5] == "do")
  assert(argv[6]:match("/rex/worktrees.lua$") and argv[7] == "--args")
  local args = assert(real.json.decode(argv[8]))
  assert(args.mode == pair[1] and args.source_session == "source" and args.source_block == "block")
  assert(args.directory == wiring.directory)
  assert(options.cwd ~= wiring.directory, "menu cannot occupy the deleted checkout")
  assert(options.exit.on_completion == false)
end
assert(#wiring.queued == 3)
assert(wiring.bindings["ctrl+b>ctrl+b"].action == "pane.send_key")
assert(wiring.bindings["ctrl+b>ctrl+b"].args.key == "ctrl+b")
local function refused(ctx)
  local before = #wiring.created
  assert(not pcall(wiring.actions.worktree_delete.run, ctx))
  assert(#wiring.created == before)
end
refused({})
wiring.host = "remote"; refused(context)
wiring.host, wiring.directory = "local", nil; refused(context)
wiring.directory, wiring.deployed = "/repo with spaces", false; refused(context)
rex, io.open = real, real_open
local core = dofile(root .. "/rex/.config/rex/worktrees.lua")
if not fixture_root then return { ok = true, actions = 3, rejected_contexts = 4, bindings = 4 } end

local function execute(argv, options)
  local result = assert(real.exec(argv, options))
  assert(result.ok, (result.stderr or "") .. " [" .. table.concat(argv, " ") .. "]")
  return result.stdout
end
local function git(directory, ...) return core.Workflow.git({ rex = real }, directory, ...) end
local function write(path, content)
  local file = assert(io.open(path, "w")); assert(file:write(content)); file:close()
end
local function read(path)
  local file = assert(io.open(path, "r")); local data = file:read("*a"); file:close(); return data
end
local function contains(value, text) assert(tostring(value):find(text, 1, true), tostring(value) .. " does not contain " .. text) end
local function fails(fn, text)
  local ok, err = pcall(fn)
  assert(not ok, "expected refusal")
  if text then contains(err, text) end
end
local function locked(flow, fn) return flow:with_lock(function() return fn(flow) end) end
local function menu(branch, selection, confirm, hook)
  local ui = { name = branch or "feature-a", selection = selection or 1, confirm = confirm ~= false, hook = hook }
  function ui:branch() return self.name end
  function ui:pick(title, choices)
    self.rows = choices
    if self.hook then self.hook() end
    if title:match("^DELETE") then return self.confirm end
    return choices[self.selection][2]
  end
  return ui
end
local function fake(primary)
  local f = { live = { source = "main", helper = "menu" }, paths = { source = {primary}, helper = {} },
    created = {}, killed = {}, focused = {}, attached = {}, process_failures = {}, view_failures = {} }
  local r = { exec = real.exec, json = real.json, layout = real.layout, session_id = "helper", session = {}, block = {}, client = {} }
  f.rex = r
  function r.session.attach(args) assert(f.live[args.session_id]); f.attached[args.session_id] = true; return {} end
  function r.session.view(args)
    assert(f.attached[args.session_id], "missing native session attachment")
    if f.view_failures[args.session_id] then return nil, "session view failed" end
    local blocks = {}
    for i in ipairs(f.paths[args.session_id]) do
      table.insert(blocks, { block_id = tostring(i), host_id = "local", creator_name = "com.superlogical.terminal" })
    end
    return { windows = {{ layers = {{ blocks = blocks }} }} }
  end
  function r.block.call(creator, method, args)
    assert(creator == "com.superlogical.terminal" and method == "process" and f.attached[args.session_id])
    if f.process_failures[args.session_id] or f.process_failures[args.session_id .. ":" .. args.block_id] then
      return nil, "terminal process failed"
    end
    local directory = args.block_id == "focused" and f.block_override or nil
    directory = directory or f.paths[args.session_id][tonumber(args.block_id) or 1]
    return { foreground = { cwd = directory or nil } }
  end
  function r.client.queue(action, args)
    assert(action == "session.select")
    if f.focus_failure then error("focus failed", 0) end
    table.insert(f.focused, args.session_id)
  end
  function r.call(method, args)
    if method == "server.status" then return { host_id = "local" } end
    if method == "session.list" then
      local sessions = {}
      for id, label in pairs(f.live) do table.insert(sessions, { session_id = id, label = label }) end
      return { sessions = sessions }
    end
    if method == "session.create" then
      if f.create_failure then return nil, "creation failed" end
      assert(#args.initial_windows == 1)
      local block = args.initial_windows[1].layout.block
      assert(block.flavor == "com.superlogical.terminal.shell" and not block.options.command)
      assert(not args.initial_windows[1].window_label, "do not name tabs")
      local id = "created-" .. (#f.created + 1)
      f.live[id], f.paths[id] = args.label, {block.options.cwd}
      table.insert(f.created, { id = id, label = args.label, path = block.options.cwd })
      return { session_id = id }
    end
    assert(method == "session.destroy", "unexpected operation: " .. method)
    assert(f.attached[args.session_id])
    table.insert(f.killed, args.session_id)
    f.live[args.session_id] = nil
    if f.after_kill then f.after_kill() end
    return {}
  end
  return f
end
local number = 0
local function fixture()
  number = number + 1
  local f = { root = fixture_root .. "/case-" .. number }
  f.primary = f.root .. "/repo with spaces"
  execute({ "/bin/mkdir", "-p", f.primary })
  f.primary = execute({ "/bin/pwd", "-P" }, { cwd = f.primary }):gsub("\n$", "")
  f.root = f.primary:match("^(.*)/[^/]+$")
  git(f.primary, "init", "-b", "main")
  git(f.primary, "config", "user.name", "Fixture")
  git(f.primary, "config", "user.email", "fixture@example.invalid")
  write(f.primary .. "/tracked", "base\n")
  git(f.primary, "add", "tracked"); git(f.primary, "commit", "-m", "fixture")
  f.base = git(f.primary, "rev-parse", "main"):gsub("\n$", "")
  f.server = fake(f.primary)
  function f:flow(directory, ui)
    return core.Workflow.new({ directory = directory or self.primary, source_session = "source", source_block = "focused",
      state_home = self.root .. "/private state" }, self.server.rex, ui or menu())
  end
  function f:linked(branch)
    branch = branch or "feature-a"
    local path = self.root .. "/repo-with-spaces-" .. branch:gsub("/", "-")
    git(self.primary, "worktree", "add", "-b", branch, path, "main")
    return path
  end
  function f:source_at(path) self.server.paths.source = {path} end
  function f:trees()
    local _, n = git(self.primary, "worktree", "list", "--porcelain", "-z"):gsub("worktree ", "")
    return n
  end
  return f
end
local tests = {}
local function test(name, fn) table.insert(tests, {name, fn}) end

test("new uses local main, not primary HEAD; one unnamed shell tab", function(f)
  git(f.primary, "checkout", "-b", "other")
  write(f.primary .. "/tracked", "other\n"); git(f.primary, "commit", "-am", "other")
  locked(f:flow(), function(flow) flow:new_branch() end)
  local created = f.server.created[1]
  assert(#f.server.created == 1 and created.label == "repo-with-spaces-feature-a")
  assert(git(created.path, "rev-parse", "HEAD"):gsub("\n$", "") == f.base)
end)
test("branch slashes preserved; generated names use hyphens", function(f)
  locked(f:flow(nil, menu("feat/rex/example")), function(flow) flow:new_branch() end)
  local created = f.server.created[1]
  assert(created.label == "repo-with-spaces-feat-rex-example")
  assert(git(created.path, "symbolic-ref", "--short", "HEAD") == "feat/rex/example\n")
end)
test("adopt existing session; repeated open never duplicates", function(f)
  local path = f:linked()
  f.server.live.manual, f.server.paths.manual = "manually named", {path}
  locked(f:flow(), function(flow) assert(flow:open_path(path) == "manual"); assert(flow:open_path(path) == "manual") end)
  assert(#f.server.created == 0 and f:trees() == 2)
end)
test("reopen closed session without duplicating worktree", function(f)
  local path, first = f:linked()
  locked(f:flow(), function(flow)
    first = flow:open_path(path); flow:destroy(first); assert(flow:open_path(path) ~= first)
  end)
  assert(f:trees() == 2)
end)
test("existing local branch creates checkout once without reset", function(f)
  git(f.primary, "branch", "local-only")
  locked(f:flow(), function(flow) flow:add_branch("local-only"); flow:add_branch("local-only") end)
  assert(#f.server.created == 1 and f:trees() == 2)
end)
test("picker distinguishes open, closed and branch-only", function(f)
  f:linked(); git(f.primary, "branch", "local-only")
  local ui = menu(nil, 2)
  locked(f:flow(nil, ui), function(flow) flow:open() end)
  local rows = {}; for _, row in ipairs(ui.rows) do table.insert(rows, row[1]) end
  local text = table.concat(rows, "\n")
  contains(text, "[worktree; session open] main")
  contains(text, "[worktree; session closed] feature-a")
  contains(text, "[branch only; create worktree] local-only")
end)
test("saved association survives rename and directory changes", function(f)
  local path, id = f:linked()
  locked(f:flow(), function(flow) id = flow:open_path(path) end)
  f.server.live[id], f.server.paths[id] = "renamed", {f.root}
  locked(f:flow(), function(flow) assert(flow:open_path(path) == id) end)
  assert(#f.server.created == 1)
end)
test("unrelated missing directory cannot block New or Open", function(f)
  local path = f:linked()
  f.server.live.stray, f.server.paths.stray = "stray", {f.root .. "/missing-directory"}
  local ui = menu("feature-b", 2)
  locked(f:flow(nil, ui), function(flow)
    flow:open()
    assert(f.server.created[1].path == path)
    flow:new_branch()
  end)
  assert(#f.server.created == 2 and f:trees() == 3)
end)
test("failed unrelated session view cannot block Open", function(f)
  f:linked()
  f.server.live.stray, f.server.paths.stray = "stray", {f.root}
  f.server.view_failures.stray = true
  locked(f:flow(nil, menu(nil, 2)), function(flow) flow:open() end)
  assert(#f.server.created == 1)
end)
test("failed process lookup cannot hide healthy blocks or block another project", function(f)
  local path = f:linked()
  f.server.live.manual, f.server.paths.manual = "manual", {path, f.root}
  f.server.process_failures["manual:2"] = true
  f.server.live.stray, f.server.paths.stray = "stray", {f.root}
  f.server.process_failures.stray = true
  locked(f:flow(), function(flow) assert(flow:open_path(path) == "manual") end)
  assert(#f.server.created == 0)
end)
test("unreadable Git context in an unrelated terminal is skipped", function(f)
  local path = f:linked()
  local corrupt = f.primary .. "/corrupt-nested-repository"
  execute({"/bin/mkdir", corrupt}); write(corrupt .. "/.git", "gitdir: /nonexistent/repository\n")
  f.server.live.stray, f.server.paths.stray = "stray", {corrupt}
  locked(f:flow(), function(flow) flow:open_path(path) end)
  assert(#f.server.created == 1)
end)
test("source process failures still block deletion", function(f)
  local path = f:linked(); f:source_at(path)
  table.insert(f.server.paths.source, f.root)
  f.server.process_failures["source:2"] = true
  fails(function() locked(f:flow(path), function(flow) flow:delete() end) end, "terminal process failed")
  assert(#f.server.killed == 0 and f:trees() == 2)
end)
test("ambiguous sessions fail closed", function(f)
  local path = f:linked()
  f.server.live.a, f.server.paths.a = "a", {path}; f.server.live.b, f.server.paths.b = "b", {path}
  fails(function() locked(f:flow(), function(flow) flow:open_path(path) end) end, "Several Rex sessions")
  assert(#f.server.created == 0)
end)
test("directory collisions never overwrite", function(f)
  git(f.primary, "branch", "feature/a")
  local occupied = f.root .. "/repo-with-spaces-feature-a"
  execute({ "/bin/mkdir", occupied }); write(occupied .. "/keep", "keep")
  fails(function() locked(f:flow(), function(flow) flow:add_branch("feature/a") end) end, "Directory already exists")
  assert(read(occupied .. "/keep") == "keep")
end)
test("invalid names and missing main never create a checkout", function(f)
  for _, branch in ipairs({"--force", "a..b", "trailing/", "a;touch bad", "", "@{-1}"}) do
    fails(function() locked(f:flow(nil, menu(branch)), function(flow) flow:new_branch() end) end)
  end
  git(f.primary, "branch", "-m", "main", "other")
  fails(function() locked(f:flow(), function(flow) flow:new_branch() end) end)
  assert(f:trees() == 1)
end)
test("primary protected even when not on main", function(f)
  git(f.primary, "checkout", "-b", "other")
  fails(function() locked(f:flow(), function(flow) flow:delete() end) end, "primary checkout")
  assert(#f.server.killed == 0)
end)
test("modified, staged, and untracked files block teardown", function(f)
  local path = f:linked(); f:source_at(path)
  for _, kind in ipairs({"modified", "staged", "untracked"}) do
    write(path .. (kind == "untracked" and "/untracked" or "/tracked"), "keep")
    if kind == "staged" then git(path, "add", "tracked") end
    fails(function() locked(f:flow(path), function(flow) flow:delete() end) end, "modified, staged, or untracked")
    assert(#f.server.killed == 0)
    git(path, "reset", "--hard", "HEAD") -- fixture only
  end
  assert(read(path .. "/untracked") == "keep")
end)
test("delete stops session first and keeps branch", function(f)
  local path = f:linked(); f:source_at(path)
  f.server.after_kill = function() assert(read(path .. "/tracked") == "base\n") end
  locked(f:flow(path), function(flow) flow:delete() end)
  assert(#f.server.killed == 1 and f.server.killed[1] == "source")
  assert(f:trees() == 1 and git(f.primary, "rev-parse", "feature-a"):gsub("\n$", "") == f.base)
end)
test("delete cancellation leaves session and checkout intact", function(f)
  local path = f:linked(); f:source_at(path)
  fails(function() locked(f:flow(path, menu(nil, nil, false)), function(flow) flow:delete() end) end, core.cancelled)
  assert(#f.server.killed == 0 and f:trees() == 2)
end)
test("files written during confirmation block session teardown", function(f)
  local path = f:linked(); f:source_at(path)
  local ui = menu(nil, nil, nil, function() write(path .. "/new-file", "keep") end)
  fails(function() locked(f:flow(path, ui), function(flow) flow:delete() end) end, "modified, staged, or untracked")
  assert(#f.server.killed == 0)
end)
test("files written during shutdown preserve checkout", function(f)
  local path = f:linked(); f:source_at(path)
  f.server.after_kill = function() write(path .. "/new-file", "keep") end
  fails(function() locked(f:flow(path), function(flow) flow:delete() end) end, "modified or untracked")
  assert(#f.server.killed == 1 and read(path .. "/new-file") == "keep")
end)
test("locked worktree and mixed terminal session refused", function(f)
  local path = f:linked(); f:source_at(path)
  git(f.primary, "worktree", "lock", path)
  fails(function() locked(f:flow(path), function(flow) flow:delete() end) end, "locked")
  git(f.primary, "worktree", "unlock", path)
  table.insert(f.server.paths.source, f.primary)
  fails(function() locked(f:flow(path), function(flow) flow:delete() end) end, "unrelated")
  assert(#f.server.killed == 0)
end)
test("changed source block directory cancels deletion", function(f)
  local path = f:linked(); f:source_at(path); f.server.block_override = f.primary
  fails(function() locked(f:flow(path), function(flow) flow:delete() end) end, "changed directory")
  assert(#f.server.killed == 0)
end)
test("creation/focus failures leave recoverable worktree without duplicate session", function(f)
  f.server.create_failure = true
  fails(function() locked(f:flow(), function(flow) flow:new_branch() end) end, "creation failed")
  local path = f.root .. "/repo-with-spaces-feature-a"
  assert(read(path .. "/tracked") == "base\n")
  f.server.create_failure, f.server.focus_failure = false, true
  fails(function() locked(f:flow(), function(flow) flow:open_path(path) end) end, "focus failed")
  f.server.focus_failure = false
  locked(f:flow(), function(flow) flow:open_path(path) end)
  assert(#f.server.created == 1)
end)
test("submodule worktree refused before teardown", function(f)
  local path = f:linked(); f:source_at(path)
  git(path, "update-index", "--add", "--cacheinfo", "160000," .. f.base .. ",submodule")
  git(path, "commit", "-m", "fixture gitlink"); execute({ "/bin/mkdir", path .. "/submodule" })
  fails(function() locked(f:flow(path), function(flow) flow:delete() end) end, "submodules")
  assert(#f.server.killed == 0)
end)
test("unknown terminals and late unrelated tabs block deletion", function(f)
  local path = f:linked(); f:source_at(path); table.insert(f.server.paths.source, false)
  fails(function() locked(f:flow(path), function(flow) flow:delete() end) end, "unknown, remote")
  table.remove(f.server.paths.source)
  local ui = menu(nil, nil, nil, function() table.insert(f.server.paths.source, f.primary) end)
  fails(function() locked(f:flow(path, ui), function(flow) flow:delete() end) end, "unrelated")
  assert(#f.server.killed == 0)
end)
test("nested repository not adopted as parent checkout", function(f)
  local path = f:linked(); local nested = path .. "/nested"
  execute({ "/bin/mkdir", nested }); git(nested, "init", "-b", "main")
  f.server.live.nested, f.server.paths.nested = "nested", {nested}
  locked(f:flow(), function(flow) assert(not flow:associations()[path].nested) end)
end)
test("project lock and malformed state fail closed", function(f)
  local first, second = f:flow(), f:flow()
  locked(first, function()
    fails(function() locked(second, function() error("must not execute") end) end, "already open")
  end)
  write(first.state_file, '["bad state"]')
  fails(function() locked(f:flow(), function() error("must not execute") end) end, "Invalid worktree session state")
end)
test("lost project lock blocks mutation", function(f)
  locked(f:flow(), function(flow)
    flow.lock.alive = function() return false end
    fails(function() flow:new_branch() end, "lock was lost")
  end)
  assert(f:trees() == 1 and #f.server.created == 0)
end)
test("fzf row/query parsing and cancellation use only argv/stdin", function(f)
  local responses = { {ok = true, code = 0, stdout = "feat/rex/example\0Create branch\0"},
    {ok = true, code = 0, stdout = "2\tsecond\0"}, {ok = false, code = 130, stdout = ""} }
  local calls = {}
  local ui = core.Menu.new({ exec = function(argv, options)
    table.insert(calls, {argv, options}); return table.remove(responses, 1)
  end })
  assert(ui:branch() == "feat/rex/example")
  assert(ui:pick("picker", {{"first", false}, {"second", true}}))
  fails(function() ui:branch() end, core.cancelled)
  assert(calls[1][2].env.FZF_DEFAULT_OPTS == "" and calls[1][2].stdin == "Create branch\0")
  assert(calls[2][2].stdin == "1\tfirst\0" .. "2\tsecond\0")
end)
test("native fzf emits the expected query and row delimiters", function(f)
  local filter = "Create"
  local ui = core.Menu.new({ exec = function(argv, options)
    table.insert(argv, "--filter=" .. filter) -- exercise real fzf without opening a TTY
    return real.exec(argv, options)
  end })
  assert(ui:branch() == "Create")
  filter = "second"
  assert(ui:pick("native picker", {{"first", false}, {"second", true}}))
end)
test("manual invocation cannot close a working session", function(f)
  fails(function() core.main({mode = "open"}, f.server.rex) end, "keybindings")
  fails(function()
    core.main({mode = "open", source_session = "source", source_block = "focused", directory = f.primary}, f.server.rex)
  end, "temporary menu session")
  assert(#f.server.killed == 0)
end)
test("cancelled main action returns to source and closes only its menu", function(f)
  f.server.live.helper = "rex-worktrees-open"
  f.server.rex.exec = setmetatable({ start = real.exec.start }, { __call = function(_, argv, options)
    if argv[1] == "fzf" then return {ok = false, code = 130, stdout = "", stderr = ""} end
    return real.exec(argv, options)
  end })
  core.main({mode = "open", source_session = "source", source_block = "focused", directory = f.primary,
    state_home = f.root .. "/state"}, f.server.rex)
  assert(#f.server.killed == 1 and f.server.killed[1] == "helper" and f.server.live.source)
  assert(f.server.focused[1] == "source")
end)
test("native Git preserves tracked changes staged or modified during shutdown", function(f)
  local path = f:linked()
  for _, kind in ipairs({"modified", "staged"}) do
    f:source_at(path); f.server.live.source = "source"
    f.server.after_kill = function()
      write(path .. "/tracked", "shutdown changes\n")
      if kind == "staged" then git(path, "add", "tracked") end
    end
    fails(function() locked(f:flow(path), function(flow) flow:delete() end) end, "modified or untracked")
    assert(read(path .. "/tracked") == "shutdown changes\n" and f:trees() == 2)
    git(path, "reset", "--hard", "HEAD") -- fixture only
  end
end)
test("native Git refuses a worktree locked during program shutdown", function(f)
  local path = f:linked(); f:source_at(path)
  f.server.after_kill = function() git(f.primary, "worktree", "lock", path) end
  fails(function() locked(f:flow(path), function(flow) flow:delete() end) end, "locked")
  assert(#f.server.killed == 1 and f:trees() == 2)
end)
test("fzf launch errors are printed in full and acknowledged without invoking fzf again", function(f)
  f.server.live.helper = "rex-worktrees-open"
  local console = { calls = 0, waited = false, output = "" }
  local message = "fzf launch failed\n" .. string.rep("long error text ", 100)
  f.server.rex.exec = setmetatable({start = real.exec.start}, {__call = function(_, argv, options)
    if argv[1] == "fzf" then console.calls = console.calls + 1; return nil, message end
    return real.exec(argv, options)
  end})
  local terminal = {
    write = function(text) console.output = console.output .. text end,
    flush = function() end,
    read = function(format)
      assert(format == "*l" and #f.server.killed == 0 and f.server.live.helper)
      console.waited = true
      return ""
    end,
  }
  core.main({mode = "open", source_session = "source", source_block = "focused",
    directory = f.primary, state_home = f.root .. "/state"}, f.server.rex, terminal)
  assert(console.calls == 1 and console.waited)
  contains(console.output, message)
  contains(console.output, "Press Enter to close this menu.")
  assert(#f.server.killed == 1 and f.server.killed[1] == "helper" and f.server.live.source)
end)
local passed = 0
for _, item in ipairs(tests) do
  local f = fixture()
  local ok, err = xpcall(function() item[2](f) end, debug.traceback)
  if not ok then error("FAIL " .. item[1] .. ": " .. tostring(err), 0) end
  passed = passed + 1
  print("PASS " .. item[1])
end
return { ok = true, lifecycle_tests = passed, actions = 3, bindings = 4, rejected_contexts = 4 }
