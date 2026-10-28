-- Rex's own Lua runtime; all session/client operations are mocked.
-- root=<repo> runs binding checks only. fixture=<private scratch> adds real Git tests.
local real, real_open = rex, io.open
local root = assert(real.args.root, "pass root=the-repository-path")
local fixture_root = real.args.fixture
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
local home = assert(os.getenv("HOME"))
for _, pair in ipairs({ {"new", "cmd+shift+n", "worktree_new"}, {"open", "cmd+shift+o", "worktree_open"},
  {"delete", "cmd+shift+backspace", "worktree_delete"}, {"project", "cmd+shift+k", "project_switch"} }) do
  local action = pair[3]
  assert(wiring.bindings[pair[2]].action == action)
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
  assert(args.directory == (pair[1] ~= "project" and wiring.directory or nil))
  if pair[1] == "delete" then assert(args.projects == nil, "delete never offers projects")
  else
    assert(args.projects[1] == home .. "/code/github.com/hrmnjt/dev")
    for _, path in ipairs(args.projects) do assert(path:sub(1, 1) == "/", "~/ must be expanded: " .. path) end
  end
  assert(options.cwd ~= wiring.directory, "menu cannot occupy the deleted checkout")
  assert(options.exit.on_completion == false)
end
assert(#wiring.queued == 4)
local bound = 0
for key in pairs(wiring.bindings) do
  bound = bound + 1
  assert(not key:find("ctrl", 1, true), "leave Ctrl keys to terminal programs: " .. key)
end
assert(bound == 4)
local function refused(ctx, action)
  local before = #wiring.created
  assert(not pcall(wiring.actions[action or "worktree_delete"].run, ctx))
  assert(#wiring.created == before)
end
refused({})
refused({ session_id = "source", block_id = "block" }, "project_switch")
wiring.host = "remote"; refused(context)
wiring.host, wiring.directory = "local", nil; refused(context)
-- The project picker never reads the focused terminal's location.
wiring.host = "remote"; wiring.actions.project_switch.run({ session_id = "source", client_id = "client" })
assert(#wiring.created == 5)
wiring.host = "local"
wiring.directory, wiring.deployed = "/repo with spaces", false; refused(context)
rex, io.open = real, real_open
local core = dofile(root .. "/rex/.config/rex/worktrees.lua")
if not fixture_root then return { ok = true, actions = 4, rejected_contexts = 5, bindings = 4 } end

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
local function run(flow, fn) return fn(flow) end
local function choose(choices, wanted)
  if type(wanted) == "number" then return choices[wanted][2] end
  for _, choice in ipairs(choices) do if choice[1]:find(wanted, 1, true) then return choice[2] end end
  error("no row contains " .. wanted)
end
local function menu(branch, selection, confirm, hook)
  local ui = { name = branch or "feature-a", selection = selection or 1, confirm = confirm ~= false, hook = hook }
  function ui:branch() return self.name end
  function ui:query() return assert(self.path, "unexpected path prompt") end
  function ui:pick(title, choices)
    if title:match("^Projects") then self.project_rows = choices; return choose(choices, self.project or 1) end
    self.rows = choices
    if self.hook then self.hook() end
    if title:match("^DELETE") then return self.confirm end
    return choose(choices, self.selection)
  end
  return ui
end
local function labels(rows)
  local text = {}
  for _, row in ipairs(rows) do table.insert(text, row[1]) end
  return table.concat(text, "\n")
end
local function fake(primary)
  local f = { live = { source = "main", helper = "menu" }, paths = { source = {primary}, helper = {} },
    tabs = {}, created = {}, sessions_created = {}, closed = {}, killed = {}, focused = {}, targets = {},
    attached = {}, process_failures = {}, view_failures = {} }
  local r = { exec = real.exec, json = real.json, layout = real.layout, session_id = "helper", session = {}, block = {}, client = {} }
  f.rex = r
  function r.session.attach(args) assert(f.live[args.session_id]); f.attached[args.session_id] = true; return {} end
  function r.session.view(args)
    assert(f.attached[args.session_id], "missing native session attachment")
    if f.view_failures[args.session_id] then return nil, "session view failed" end
    local windows = {}
    if f.paths[args.session_id] then
      local blocks = {}
      for i in ipairs(f.paths[args.session_id]) do
        table.insert(blocks, { block_id = tostring(i), host_id = "local", creator_name = "com.superlogical.terminal" })
      end
      table.insert(windows, { window_id = args.session_id .. "-tab", layers = {{ blocks = blocks }} })
    end
    for _, tab in ipairs(f.tabs[args.session_id] or {}) do table.insert(windows, tab) end
    return { windows = windows }
  end
  function r.block.call(creator, method, args)
    assert(creator == "com.superlogical.terminal" and method == "process" and f.attached[args.session_id])
    if f.process_failures[args.session_id] or f.process_failures[args.session_id .. ":" .. args.block_id] then
      return nil, "terminal process failed"
    end
    for _, tab in ipairs(f.tabs[args.session_id] or {}) do
      if tab.block_id == args.block_id then return { foreground = { cwd = tab.path } } end
    end
    local directory = (args.block_id == "focused" or args.block_id == "1") and f.block_override or nil
    directory = directory or (f.paths[args.session_id] or {})[tonumber(args.block_id) or 1]
    return { foreground = { cwd = directory or nil } }
  end
  function r.client.queue(action, args)
    assert(action == "session.select")
    if f.focus_failure then error("focus failed", 0) end
    table.insert(f.focused, args.session_id); table.insert(f.targets, args)
  end
  local function new_tab(session, window)
    if f.create_failure then return nil, "creation failed" end
    local block = window.layout.block
    assert(block.flavor == "com.superlogical.terminal.shell" and not block.options.command)
    assert(window.window_label and #window.window_label <= 128)
    local id = "window-" .. (#f.created + 1)
    local tab = { window_id = id, block_id = id .. "-block", path = block.options.cwd,
      label = window.window_label, layers = {{ blocks = {{
        block_id = id .. "-block", host_id = "local", creator_name = "com.superlogical.terminal",
      }} }} }
    f.tabs[session] = f.tabs[session] or {}; table.insert(f.tabs[session], tab)
    table.insert(f.created, { id = session, window = id, label = f.live[session],
      tab_label = window.window_label, path = block.options.cwd })
    return { window_id = id, block_ids = {tab.block_id} }
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
      local id = "created-session-" .. (#f.sessions_created + 1)
      f.live[id] = args.label; table.insert(f.sessions_created, id)
      return { session_id = id, initial_windows = { assert(new_tab(id, args.initial_windows[1])) } }
    end
    if method == "session.new_window" then
      assert(f.attached[args.session_id] and args.focus == false)
      return new_tab(args.session_id, args)
    end
    if method == "session.close_window" then
      assert(f.attached[args.session_id])
      if args.window_id == args.session_id .. "-tab" then f.paths[args.session_id] = nil
      else
        local found = false
        for i, tab in ipairs(f.tabs[args.session_id] or {}) do
          if tab.window_id == args.window_id then table.remove(f.tabs[args.session_id], i); found = true; break end
        end
        assert(found, "tab not found")
      end
      table.insert(f.closed, args)
      if f.after_kill then f.after_kill() end
      return {}
    end
    assert(method == "session.destroy", "unexpected operation: " .. method)
    assert(f.attached[args.session_id])
    table.insert(f.killed, args.session_id); f.live[args.session_id] = nil
    f.paths[args.session_id], f.tabs[args.session_id] = nil, nil
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
  function f:flow(directory, ui, extra)
    local args = { directory = directory or self.primary, source_session = "source", source_block = "1" }
    for key, value in pairs(extra or {}) do args[key] = value end
    return core.Workflow.new(args, self.server.rex, ui or menu())
  end
  function f:repo(name)
    local path = self.root .. "/" .. name
    execute({ "/bin/mkdir", "-p", path }); git(path, "init", "-b", "main")
    git(path, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--allow-empty", "-m", "fixture")
    return path
  end
  function f:remote(name, branch)
    local path = self:repo("remote-" .. name)
    git(path, "branch", branch)
    git(self.primary, "remote", "add", name, path)
    git(self.primary, "fetch", name)
    return path
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

test("new uses local main, not primary HEAD; one named worktree tab", function(f)
  git(f.primary, "checkout", "-b", "other")
  write(f.primary .. "/tracked", "other\n"); git(f.primary, "commit", "-am", "other")
  run(f:flow(), function(flow) flow:new_branch() end)
  local created = f.server.created[1]
  assert(#f.server.created == 1 and created.id == "source" and created.tab_label == "feature-a" and #f.server.sessions_created == 0)
  assert(git(created.path, "rev-parse", "HEAD"):gsub("\n$", "") == f.base)
end)
test("new tracks matching fetched remote tip, even with automatic tracking disabled", function(f)
  f:remote("origin", "feat/rex/example")
  git(f.primary, "config", "branch.autoSetupMerge", "false")
  run(f:flow(nil, menu("feat/rex/example")), function(flow) flow:new_branch() end)
  local path = f.server.created[1].path
  assert(git(path, "rev-parse", "HEAD") == git(f.primary, "rev-parse", "refs/remotes/origin/feat/rex/example"))
  assert(git(path, "rev-parse", "HEAD"):gsub("\n$", "") ~= f.base)
  assert(git(path, "rev-parse", "--symbolic-full-name", "@{upstream}") == "refs/remotes/origin/feat/rex/example\n")
  assert(git(path, "config", "branch.feat/rex/example.remote") == "origin\n")
  assert(git(path, "config", "branch.feat/rex/example.merge") == "refs/heads/feat/rex/example\n")
end)
test("remote match works without local main and with a non-origin remote", function(f)
  f:remote("upstream", "feature-a")
  git(f.primary, "branch", "-m", "main", "other")
  run(f:flow(), function(flow) flow:new_branch() end)
  assert(git(f.server.created[1].path, "rev-parse", "--symbolic-full-name", "@{upstream}")
    == "refs/remotes/upstream/feature-a\n")
end)
test("multiple remote matches refuse without creating a branch or checkout", function(f)
  f:remote("origin", "feature-a"); f:remote("upstream", "feature-a")
  fails(function() run(f:flow(), function(flow) flow:new_branch() end) end, "Branch matches several remotes")
  assert(f:trees() == 1 and #f.server.created == 0)
  assert(git(f.primary, "for-each-ref", "refs/heads/feature-a") == "")
end)
test("remote matching is exact and ignores symbolic refs", function(f)
  f:remote("origin", "other/feature-a")
  git(f.primary, "symbolic-ref", "refs/remotes/origin/feature-a", "refs/remotes/origin/other/feature-a")
  run(f:flow(), function(flow) flow:new_branch() end)
  assert(git(f.server.created[1].path, "rev-parse", "HEAD"):gsub("\n$", "") == f.base)
end)
test("New does not fetch branches that exist only on the server", function(f)
  local remote = f:remote("origin", "other")
  git(remote, "branch", "feature-a")
  run(f:flow(), function(flow) flow:new_branch() end)
  assert(git(f.server.created[1].path, "rev-parse", "HEAD"):gsub("\n$", "") == f.base)
  assert(git(f.primary, "for-each-ref", "refs/remotes/origin/feature-a") == "")
end)
test("remote match never resets an existing local branch", function(f)
  f:remote("origin", "feature-a")
  git(f.primary, "branch", "feature-a", "main")
  fails(function() run(f:flow(), function(flow) flow:new_branch() end) end, "already exists")
  assert(git(f.primary, "rev-parse", "feature-a"):gsub("\n$", "") == f.base)
  assert(f:trees() == 1 and #f.server.created == 0)
end)
test("branch slashes preserved; generated names use hyphens", function(f)
  run(f:flow(nil, menu("feat/rex/example")), function(flow) flow:new_branch() end)
  local created = f.server.created[1]
  assert(created.tab_label == "feat/rex/example" and created.path:match("repo%-with%-spaces%-feat%-rex%-example$"))
  assert(git(created.path, "symbolic-ref", "--short", "HEAD") == "feat/rex/example\n")
end)
test("adopt existing tab; repeated open never duplicates", function(f)
  local path = f:linked()
  f.server.live.manual, f.server.paths.manual = "manually named", {path}
  run(f:flow(), function(flow) assert(flow:open_path(path) == "manual"); assert(flow:open_path(path) == "manual") end)
  assert(#f.server.created == 0 and f:trees() == 2)
end)
test("reopen closed tab without duplicating worktree", function(f)
  local path, first = f:linked()
  run(f:flow(), function(flow)
    first = flow:open_path(path)
    flow.rex.call("session.close_window", {session_id = first, window_id = f.server.created[1].window})
    assert(flow:open_path(path) == first)
    assert(f.server.created[1].window ~= f.server.created[2].window)
  end)
  assert(f:trees() == 2)
end)
test("existing local branch creates checkout once without reset", function(f)
  git(f.primary, "branch", "local-only")
  run(f:flow(), function(flow) flow:add_branch("local-only"); flow:add_branch("local-only") end)
  assert(#f.server.created == 1 and f:trees() == 2)
end)
test("picker distinguishes open, closed and branch-only", function(f)
  f:linked(); git(f.primary, "branch", "local-only")
  local ui = menu(nil, 2)
  run(f:flow(nil, ui), function(flow) flow:open() end)
  local rows = {}; for _, row in ipairs(ui.rows) do table.insert(rows, row[1]) end
  local text = table.concat(rows, "\n")
  contains(text, "[worktree; tab open] main")
  contains(text, "[worktree; tab closed] feature-a")
  contains(text, "[branch only; create worktree] local-only")
end)
test("renamed session is still found by its terminal directory", function(f)
  local path, id = f:linked()
  run(f:flow(), function(flow) id = flow:open_path(path) end)
  f.server.live[id] = "renamed"
  run(f:flow(), function(flow) assert(flow:open_path(path) == id) end)
  assert(#f.server.created == 1)
end)
test("unrelated missing directory cannot block New or Open", function(f)
  local path = f:linked()
  f.server.live.stray, f.server.paths.stray = "stray", {f.root .. "/missing-directory"}
  local ui = menu("feature-b", 2)
  run(f:flow(nil, ui), function(flow)
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
  run(f:flow(nil, menu(nil, 2)), function(flow) flow:open() end)
  assert(#f.server.created == 1)
end)
test("failed process lookup cannot hide healthy blocks or block another project", function(f)
  local path = f:linked()
  f.server.live.manual, f.server.paths.manual = "manual", {path, f.root}
  f.server.process_failures["manual:2"] = true
  f.server.live.stray, f.server.paths.stray = "stray", {f.root}
  f.server.process_failures.stray = true
  run(f:flow(), function(flow) assert(flow:open_path(path) == "manual") end)
  assert(#f.server.created == 0)
end)
test("unreadable Git context in an unrelated terminal is skipped", function(f)
  local path = f:linked()
  local corrupt = f.primary .. "/corrupt-nested-repository"
  execute({"/bin/mkdir", corrupt}); write(corrupt .. "/.git", "gitdir: /nonexistent/repository\n")
  f.server.live.stray, f.server.paths.stray = "stray", {corrupt}
  run(f:flow(), function(flow) flow:open_path(path) end)
  assert(#f.server.created == 1)
end)
test("source process failures still block deletion", function(f)
  local path = f:linked(); f:source_at(path)
  table.insert(f.server.paths.source, f.root)
  f.server.process_failures["source:2"] = true
  fails(function() run(f:flow(path), function(flow) flow:delete() end) end, "terminal process failed")
  assert(#f.server.killed == 0 and #f.server.closed == 0 and f:trees() == 2)
end)
test("ambiguous worktree tabs fail closed", function(f)
  local path = f:linked()
  f.server.live.a, f.server.paths.a = "a", {path}; f.server.live.b, f.server.paths.b = "b", {path}
  fails(function() run(f:flow(), function(flow) flow:open_path(path) end) end, "Several Rex tabs")
  assert(#f.server.created == 0)
end)
test("directory collisions never overwrite", function(f)
  git(f.primary, "branch", "feature/a")
  local occupied = f.root .. "/repo-with-spaces-feature-a"
  execute({ "/bin/mkdir", occupied }); write(occupied .. "/keep", "keep")
  fails(function() run(f:flow(), function(flow) flow:add_branch("feature/a") end) end, "Directory already exists")
  assert(read(occupied .. "/keep") == "keep")
end)
test("invalid names and missing main never create a checkout", function(f)
  for _, branch in ipairs({"--force", "a..b", "trailing/", "a;touch bad", "", "@{-1}"}) do
    fails(function() run(f:flow(nil, menu(branch)), function(flow) flow:new_branch() end) end)
  end
  git(f.primary, "branch", "-m", "main", "other")
  fails(function() run(f:flow(), function(flow) flow:new_branch() end) end)
  assert(f:trees() == 1)
end)
test("primary protected even when not on main", function(f)
  git(f.primary, "checkout", "-b", "other")
  fails(function() run(f:flow(), function(flow) flow:delete() end) end, "primary checkout")
  assert(#f.server.killed == 0 and #f.server.closed == 0)
end)
test("modified, staged, and untracked files block teardown", function(f)
  local path = f:linked(); f:source_at(path)
  for _, kind in ipairs({"modified", "staged", "untracked"}) do
    write(path .. (kind == "untracked" and "/untracked" or "/tracked"), "keep")
    if kind == "staged" then git(path, "add", "tracked") end
    fails(function() run(f:flow(path), function(flow) flow:delete() end) end, "modified, staged, or untracked")
    assert(#f.server.killed == 0 and #f.server.closed == 0)
    git(path, "reset", "--hard", "HEAD") -- fixture only
  end
  assert(read(path .. "/untracked") == "keep")
end)
test("delete stops only its tab first and keeps branch", function(f)
  local path = f:linked(); f:source_at(path)
  f.server.after_kill = function() assert(read(path .. "/tracked") == "base\n") end
  run(f:flow(path), function(flow) flow:delete() end)
  assert(#f.server.killed == 0 and #f.server.closed == 1 and f.server.closed[1].window_id == "source-tab")
  assert(f.server.live.source and f.server.created[1].path == f.primary)
  assert(f:trees() == 1 and git(f.primary, "rev-parse", "feature-a"):gsub("\n$", "") == f.base)
end)
test("delete cancellation leaves session and checkout intact", function(f)
  local path = f:linked(); f:source_at(path)
  fails(function() run(f:flow(path, menu(nil, nil, false)), function(flow) flow:delete() end) end, core.cancelled)
  assert(#f.server.killed == 0 and #f.server.closed == 0 and f:trees() == 2)
end)
test("files written during confirmation block tab teardown", function(f)
  local path = f:linked(); f:source_at(path)
  local ui = menu(nil, nil, nil, function() write(path .. "/new-file", "keep") end)
  fails(function() run(f:flow(path, ui), function(flow) flow:delete() end) end, "modified, staged, or untracked")
  assert(#f.server.killed == 0 and #f.server.closed == 0)
end)
test("files written during shutdown preserve checkout", function(f)
  local path = f:linked(); f:source_at(path)
  f.server.after_kill = function() write(path .. "/new-file", "keep") end
  fails(function() run(f:flow(path), function(flow) flow:delete() end) end, "modified or untracked")
  assert(#f.server.closed == 1 and read(path .. "/new-file") == "keep")
end)
test("locked worktree and mixed terminal tab refused", function(f)
  local path = f:linked(); f:source_at(path)
  git(f.primary, "worktree", "lock", path)
  fails(function() run(f:flow(path), function(flow) flow:delete() end) end, "locked")
  git(f.primary, "worktree", "unlock", path)
  table.insert(f.server.paths.source, f.primary)
  fails(function() run(f:flow(path), function(flow) flow:delete() end) end, "unrelated")
  assert(#f.server.killed == 0 and #f.server.closed == 0)
end)
test("changed source block directory cancels deletion", function(f)
  local path = f:linked(); f:source_at(path)
  local ui = menu(nil, nil, nil, function() f.server.block_override = f.primary end)
  fails(function() run(f:flow(path, ui), function(flow) flow:delete() end) end, "changed directory")
  assert(#f.server.killed == 0 and #f.server.closed == 0)
end)
test("creation/focus failures leave recoverable worktree without duplicate session", function(f)
  f.server.create_failure = true
  fails(function() run(f:flow(), function(flow) flow:new_branch() end) end, "creation failed")
  local path = f.root .. "/repo-with-spaces-feature-a"
  assert(read(path .. "/tracked") == "base\n")
  f.server.create_failure, f.server.focus_failure = false, true
  fails(function() run(f:flow(), function(flow) flow:open_path(path) end) end, "focus failed")
  f.server.focus_failure = false
  run(f:flow(), function(flow) flow:open_path(path) end)
  assert(#f.server.created == 1)
end)
test("submodule worktree refused before teardown", function(f)
  local path = f:linked(); f:source_at(path)
  git(path, "update-index", "--add", "--cacheinfo", "160000," .. f.base .. ",submodule")
  git(path, "commit", "-m", "fixture gitlink"); execute({ "/bin/mkdir", path .. "/submodule" })
  fails(function() run(f:flow(path), function(flow) flow:delete() end) end, "submodules")
  assert(#f.server.killed == 0 and #f.server.closed == 0)
end)
test("unknown terminals and late unrelated panes block deletion", function(f)
  local path = f:linked(); f:source_at(path); table.insert(f.server.paths.source, false)
  fails(function() run(f:flow(path), function(flow) flow:delete() end) end, "unknown, remote")
  table.remove(f.server.paths.source)
  local ui = menu(nil, nil, nil, function() table.insert(f.server.paths.source, f.primary) end)
  fails(function() run(f:flow(path, ui), function(flow) flow:delete() end) end, "unrelated")
  assert(#f.server.killed == 0 and #f.server.closed == 0)
end)
test("nested repository not adopted as parent checkout", function(f)
  local path = f:linked(); local nested = path .. "/nested"
  execute({ "/bin/mkdir", nested }); git(nested, "init", "-b", "main")
  f.server.live.nested, f.server.paths.nested = "nested", {nested}
  run(f:flow(), function(flow) assert(not flow:associations()[path].nested) end)
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
  f.server.rex.exec = setmetatable({}, { __call = function(_, argv, options)
    if argv[1] == "fzf" then return {ok = false, code = 130, stdout = "", stderr = ""} end
    return real.exec(argv, options)
  end })
  core.main({mode = "open", source_session = "source", source_block = "focused", directory = f.primary}, f.server.rex)
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
    fails(function() run(f:flow(path), function(flow) flow:delete() end) end, "modified or untracked")
    assert(read(path .. "/tracked") == "shutdown changes\n" and f:trees() == 2)
    git(path, "reset", "--hard", "HEAD") -- fixture only
  end
end)
test("native Git refuses a worktree locked during program shutdown", function(f)
  local path = f:linked(); f:source_at(path)
  f.server.after_kill = function() git(f.primary, "worktree", "lock", path) end
  fails(function() run(f:flow(path), function(flow) flow:delete() end) end, "locked")
  assert(#f.server.closed == 1 and f:trees() == 2)
end)
test("fzf launch errors are printed in full and acknowledged without invoking fzf again", function(f)
  f.server.live.helper = "rex-worktrees-open"
  local console = { calls = 0, waited = false, output = "" }
  local message = "fzf launch failed\n" .. string.rep("long error text ", 100)
  f.server.rex.exec = setmetatable({}, {__call = function(_, argv, options)
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
    directory = f.primary}, f.server.rex, terminal)
  assert(console.calls == 1 and console.waited)
  contains(console.output, message)
  contains(console.output, "Press Enter to close this menu.")
  assert(#f.server.killed == 1 and f.server.killed[1] == "helper" and f.server.live.source)
end)
test("outside Git, Open picks a listed project, then its worktrees", function(f)
  local other = f:repo("host/owner/other"); f:repo("unlisted"); f:linked(); f:source_at(f.root)
  local ui = menu(); ui.project = "repo with spaces"
  local projects = { other, f.primary, f.root .. "/missing" }
  run(f:flow(f.root, ui, { mode = "open", projects = projects }), function(flow) flow:open() end)
  assert(labels(ui.project_rows) == "[session closed] other  " .. other .. "\n[session closed] repo with spaces  "
    .. f.primary .. "\n[missing] missing  " .. f.root .. "/missing", labels(ui.project_rows))
  local created = f.server.created[1]
  assert(#f.server.created == 1 and created.path == f.primary and created.label == "repo-with-spaces")
end)
test("outside Git, New branches from the chosen project's local main", function(f)
  local other = f:repo("host/owner/other"); f:source_at(f.root)
  local ui = menu("feature-b"); ui.project = "other"
  run(f:flow(f.root, ui, { mode = "new", projects = { f.primary, other } }), function(flow) flow:new_branch() end)
  local created = f.server.created[1]
  assert(created.label == "other" and created.tab_label == "feature-b" and created.path == f.root .. "/host/owner/other-feature-b")
  assert(git(created.path, "rev-parse", "HEAD") == git(other, "rev-parse", "main"))
end)
test("missing projects and empty lists are refused without creating sessions", function(f)
  f:source_at(f.root)
  local ui = menu(); ui.project = "missing"
  fails(function() f:flow(f.root, ui, { mode = "open", projects = { f.root .. "/missing" } }) end, "Project directory is missing")
  fails(function() f:flow(f.root, menu(), { mode = "open", projects = {} }) end, "No projects configured")
  fails(function() f:flow(f.root, menu(), { mode = "open", projects = { "relative/path" } }) end, "must be absolute")
  assert(#f.server.created == 0)
end)
test("delete outside Git fails without offering projects", function(f)
  local ui = menu()
  fails(function() f:flow(f.root, ui, { mode = "delete", projects = { f.primary } }) end, "not a git repository")
  assert(not ui.project_rows and #f.server.killed == 0)
end)
test("outside Git, the project list shows open first and the current session last", function(f)
  local other, zeta = f:repo("host/owner/other"), f:repo("host/owner/zeta")
  f.server.live.other, f.server.paths.other = "renamed", {other}
  f.server.paths.source = {f.root, f.primary}
  local ui = menu(); ui.project = "other"
  run(f:flow(f.root, ui, { mode = "open", projects = { f.primary, zeta, other } }), function(flow)
    assert(flow:open() == "other")
  end)
  assert(labels(ui.project_rows) == "[session open] other  " .. other .. "\n[session closed] zeta  " .. zeta
    .. "\n[current session] repo with spaces  " .. f.primary, labels(ui.project_rows))
  assert(#f.server.created == 0)
end)
test("open all projects creates only missing sessions and leaves focus alone", function(f)
  local other, zeta = f:repo("host/owner/other"), f:repo("host/owner/zeta")
  execute({ "/bin/mkdir", other .. "/sub", zeta .. "/sub" })
  f.server.live.other, f.server.paths.other = "renamed", {other .. "/sub"}
  f:source_at(f.root)
  local args = { mode = "project", projects = { f.primary, zeta, zeta .. "/sub", other, f.root .. "/missing" } }
  local ui = menu(); ui.project = "[all projects]"
  fails(function() run(f:flow(nil, ui, args), function(flow) flow:project() end) end,
    f.root .. "/missing: directory is missing")
  contains(labels(ui.project_rows), "[path]")
  local created = {}
  for _, session in ipairs(f.server.created) do created[session.path] = session.label end
  assert(#f.server.created == 2 and created[f.primary] == "repo-with-spaces" and created[zeta] == "zeta")
  args.projects[5] = nil
  run(f:flow(nil, menu(), args), function(flow) assert(flow:project() == "source") end)
  assert(#f.server.created == 2 and #f.server.focused == 0)
end)
test("a typed path opens its checkout once and is never listed", function(f)
  local other = f:repo("host/owner/other"); execute({ "/bin/mkdir", other .. "/sub" })
  local args = { mode = "project", projects = { f.primary } }
  for _ = 1, 2 do
    local ui = menu(); ui.project, ui.path = "[path]", other .. "/sub"
    run(f:flow(nil, ui, args), function(flow) flow:project() end)
  end
  local created = f.server.created[1]
  assert(#f.server.created == 1 and created.label == "other" and created.path == other)
  assert(#f.server.focused == 2 and f.server.focused[1] == created.id and f.server.focused[2] == created.id)
  assert(#args.projects == 1)
  for typed, text in pairs({ ["relative/path"] = "absolute or ~/", [f.root .. "/missing"] = "Directory not found",
    ["~/.rex-worktrees-fixture-missing"] = home .. "/.rex-worktrees-fixture-missing", [f.root] = "Not a Git checkout" }) do
    local ui = menu(); ui.project, ui.path = "[path]", typed
    fails(function() run(f:flow(nil, ui, args), function(flow) flow:project() end) end, text)
  end
  assert(#f.server.created == 1)
end)
test("open all creates only missing worktree tabs and focuses the main checkout", function(f)
  local a, b, c = f:linked("feature-a"), f:linked("feature-b"), f:linked("feature-c")
  execute({ "/bin/rm", "-rf", c }) -- prunable worktrees are skipped
  f.server.paths.source = {b}
  local ui = menu(nil, "[all worktrees]")
  run(f:flow(nil, ui), function(flow) flow:open() end)
  contains(labels(ui.rows), "[all worktrees] open 2 closed tabs")
  local created = {}
  for _, session in ipairs(f.server.created) do created[session.path] = session.id end
  assert(#f.server.created == 2 and created[f.primary] and created[a])
  assert(f.server.focused[#f.server.focused] == created[f.primary])
  local again = menu()
  run(f:flow(nil, again), function(flow) flow:open() end)
  assert(not labels(again.rows):find("[all worktrees]", 1, true) and #f.server.created == 2)
end)
test("open all reports tabs it could not create", function(f)
  f:linked(); f:source_at(f.root); f.server.create_failure = true
  fails(function() run(f:flow(nil, menu(nil, "[all worktrees]")), function(flow) flow:open() end) end,
    "Could not open every worktree tab")
end)
test("project main action needs no terminal directory and closes only its menu", function(f)
  f.server.live.helper = "rex-worktrees-project"; f:source_at(f.root)
  -- Open all projects, then type the same checkout's path.
  local responses = { "1\t\0", "2\t\0", f.primary .. "\0Open path\0" }
  f.server.rex.exec = setmetatable({}, { __call = function(_, argv, options)
    if argv[1] == "fzf" then return { ok = true, code = 0, stdout = table.remove(responses, 1), stderr = "" } end
    return real.exec(argv, options)
  end })
  core.main({ mode = "project", source_session = "source", projects = { f.primary } }, f.server.rex)
  local created = f.server.created[1]
  assert(#f.server.created == 1 and created.path == f.primary and created.label == "repo-with-spaces")
  assert(#f.server.killed == 1 and f.server.killed[1] == "helper" and f.server.live.source)
  assert(f.server.focused[#f.server.focused] == "source")
  f.server.live.helper = "rex-worktrees-project"
  core.main({ mode = "project", source_session = "source", projects = { f.primary } }, f.server.rex)
  assert(#f.server.created == 1 and #responses == 0 and f.server.focused[#f.server.focused] == created.id)
  fails(function() core.main({ mode = "project", source_session = "source" }, f.server.rex) end, "keybindings")
end)
test("one project keeps primary and two worktrees in distinct tabs of one session", function(f)
  local a, b = f:linked("feature-a"), f:linked("feature-b")
  local flow = f:flow()
  assert(flow:open_path(a) == "source" and flow:open_path(b) == "source")
  assert(flow:open_path(a) == "source")
  assert(#f.server.created == 2 and #f.server.sessions_created == 0)
  assert(f.server.created[1].tab_label == "feature-a" and f.server.created[2].tab_label == "feature-b")
  assert(f.server.targets[3].window_id == f.server.created[1].window)
  assert(f.server.paths.source[1] == f.primary)
end)
test("duplicate tabs in the same session refuse Open and Delete", function(f)
  local path = f:linked(); f:source_at(path)
  local flow = f:flow(path)
  flow:attach("source")
  f.server.rex.call("session.new_window", {session_id = "source", window_label = "duplicate",
    layout = real.layout.block{flavor = "com.superlogical.terminal.shell", options = {cwd = path}}, focus = false})
  fails(function() flow:open_path(path) end, "Several Rex tabs")
  fails(function() flow:delete() end, "multiple tabs")
  assert(#f.server.closed == 0 and #f.server.killed == 0)
end)
test("legacy project sessions are not merged, destroyed, or added to arbitrarily", function(f)
  local a, b = f:linked("feature-a"), f:linked("feature-b")
  f.server.live.legacy, f.server.paths.legacy = "old worktree", {a}
  local flow = f:flow()
  assert(flow:open_path(a) == "legacy")
  fails(function() flow:open_path(b) end, "Several Rex sessions use this project")
  assert(#f.server.created == 0 and #f.server.killed == 0 and #f.server.closed == 0)
end)
test("project picker and all projects recognize a project with only a worktree tab", function(f)
  local path = f:linked(); f:source_at(path)
  local ui = menu(); ui.project = "repo with spaces"
  local args = {mode = "open", projects = {f.primary}}
  local flow = f:flow(f.root, ui, args)
  contains(labels(ui.project_rows), "[current session] repo with spaces")
  flow.args.mode = "project"
  assert(flow:open_projects() == "source")
  assert(#f.server.created == 0 and #f.server.sessions_created == 0)
end)
test("delete preserves sibling tabs and their programs, including unreadable ones", function(f)
  local path, sibling = f:linked(), f:linked("feature-b")
  local flow = f:flow()
  flow:open_path(sibling)
  f:source_at(path)
  local keep = f.server.created[1]
  f.server.process_failures["source:" .. keep.window .. "-block"] = true
  flow = f:flow(path)
  flow:delete()
  assert(f.server.live.source and #f.server.closed == 1 and #f.server.killed == 0)
  assert(#f.server.created == 1 and f.server.tabs.source[1].window_id == keep.window)
  assert(read(sibling .. "/tracked") == "base\n" and f:trees() == 2)
end)
test("a late sibling tab is preserved rather than blocking deletion", function(f)
  local path = f:linked(); f:source_at(path)
  local ui = menu(nil, nil, nil, function()
    local flow = f:flow()
    flow:open_path(f.primary)
  end)
  run(f:flow(path, ui), function(flow) flow:delete() end)
  assert(#f.server.closed == 1 and #f.server.created == 1 and f.server.live.source)
  assert(f.server.created[1].path == f.primary)
end)
test("failed last-tab fallback does not stop source programs", function(f)
  local path = f:linked(); f:source_at(path); f.server.create_failure = true
  fails(function() f:flow(path):delete() end, "creation failed")
  assert(#f.server.closed == 0 and f.server.live.source and f:trees() == 2)
end)
test("menu completion selects the exact worktree tab, not just its session", function(f)
  local path = f:linked()
  f.server.live.helper = "rex-worktrees-open"
  f.server.rex.exec = setmetatable({}, {__call = function(_, argv, options)
    if argv[1] == "fzf" then return {ok = true, code = 0, stdout = "2\tfeature-a\0"} end
    return real.exec(argv, options)
  end})
  core.main({mode = "open", source_session = "source", source_block = "1", directory = f.primary}, f.server.rex)
  local target = f.server.targets[#f.server.targets]
  assert(target.session_id == "source" and target.window_id == f.server.created[1].window)
  assert(f.server.created[1].path == path and #f.server.killed == 1 and f.server.killed[1] == "helper")
end)
local passed = 0
for _, item in ipairs(tests) do
  local f = fixture()
  local ok, err = xpcall(function() item[2](f) end, debug.traceback)
  if not ok then error("FAIL " .. item[1] .. ": " .. tostring(err), 0) end
  passed = passed + 1
  print("PASS " .. item[1])
end
return { ok = true, lifecycle_tests = passed, actions = 4, bindings = 4, rejected_contexts = 5 }
