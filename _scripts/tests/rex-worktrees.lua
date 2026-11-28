-- Rex's own Lua runtime; all session/client/palette operations are mocked.
-- root=<repo> runs binding checks only. fixture=<private scratch> adds real Git tests.
local real, real_open, real_dofile = rex, io.open, dofile
local root = assert(real.args.root, "pass root=the-repository-path")
local fixture_root = real.args.fixture
local wiring = { actions = {}, bindings = {}, created = {}, queued = {}, native = {}, deployed = true,
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
-- New and Open load worktrees.lua from init.lua's own folder and call it in
-- their action; capture that instead of running Git.
dofile = function(path)
  if path:match("/worktrees%.lua$") then
    wiring.loaded = path
    return { action = function(mode, args, r) table.insert(wiring.native, { mode = mode, args = args, r = r }) end }
  end
  return real_dofile(path)
end
real_dofile(root .. "/rex/.config/rex/init.lua")
assert(#wiring.created == 0 and #wiring.queued == 0 and #wiring.native == 0, "config load must have no side effects")
local context = { session_id = "source", block_id = "block", client_id = "client" }
local home = assert(os.getenv("HOME"))
local function projects_expanded(list)
  assert(list[1] == home .. "/code/github.com/hrmnjt/dev")
  for _, path in ipairs(list) do assert(path:sub(1, 1) == "/", "~/ must be expanded: " .. path) end
end
for _, pair in ipairs({ {"new", "cmd+shift+n", "worktree_new"}, {"open", "cmd+shift+o", "worktree_open"} }) do
  assert(wiring.bindings[pair[2]].action == pair[3])
  wiring.actions[pair[3]].run(context)
  -- Palette actions: no menu session, fzf, `rex -C`, or Remote Control.
  assert(#wiring.created == 0 and #wiring.queued == 0)
  assert(wiring.loaded == root .. "/rex/.config/rex/worktrees.lua", "load the module beside init.lua: " .. tostring(wiring.loaded))
  local call = wiring.native[#wiring.native]
  assert(call.mode == pair[1] and call.r == rex)
  assert(call.args.directory == wiring.directory and call.args.source_session == "source" and call.args.source_block == "block")
  projects_expanded(call.args.projects)
end
for _, pair in ipairs({ {"delete", "cmd+shift+backspace", "worktree_delete"}, {"project", "cmd+shift+k", "project_switch"} }) do
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
  else projects_expanded(args.projects) end
  assert(options.cwd ~= wiring.directory, "menu cannot occupy the deleted checkout")
  assert(options.exit.on_completion == false)
end
assert(#wiring.queued == 2 and #wiring.native == 2)
local bound = 0
for key in pairs(wiring.bindings) do
  bound = bound + 1
  assert(not key:find("ctrl", 1, true), "leave Ctrl keys to terminal programs: " .. key)
end
assert(bound == 4)
-- A table, not a local: Rex drops a closure's writes to outer locals after a
-- pcall in it catches an error.
local rejected = { n = 0 }
local function refused(ctx, action)
  local created, native = #wiring.created, #wiring.native
  assert(not pcall(wiring.actions[action or "worktree_delete"].run, ctx))
  assert(#wiring.created == created and #wiring.native == native)
  rejected.n = rejected.n + 1
end
refused({})
refused({}, "worktree_new")
refused({ session_id = "source" }, "worktree_open") -- no terminal block
refused({ session_id = "source", block_id = "block" }, "project_switch")
wiring.host = "remote"; refused(context); refused(context, "worktree_new"); refused(context, "worktree_open")
wiring.host, wiring.directory = "local", nil; refused(context); refused(context, "worktree_open")
-- The project picker never reads the focused terminal's location.
wiring.host = "remote"; wiring.actions.project_switch.run({ session_id = "source", client_id = "client" })
assert(#wiring.created == 3)
wiring.host = "local"
wiring.directory, wiring.deployed = "/repo with spaces", false
refused(context); refused(context, "worktree_new"); refused(context, "worktree_open")
rex, io.open, dofile = real, real_open, real_dofile
local core = dofile(root .. "/rex/.config/rex/worktrees.lua")
if not fixture_root then return { ok = true, actions = 4, rejected_contexts = rejected.n, bindings = 4 } end

local function execute(argv, options)
  local result = assert(real.exec(argv, options))
  assert(result.ok, (result.stderr or "") .. " [" .. table.concat(argv, " ") .. "]")
  return result.stdout
end
local function git(directory, ...) return core.Workflow.git({ rex = real }, directory, ...) end
-- Git with fixed author, committer and reflog times (Unix seconds).
local function git_at(t, directory, ...)
  local argv = { "git", "-C", directory }
  for _, arg in ipairs({...}) do table.insert(argv, arg) end
  local stamp = "@" .. t .. " +0000"
  return execute(argv, { env = { GIT_AUTHOR_DATE = stamp, GIT_COMMITTER_DATE = stamp,
    GIT_DIR = false, GIT_WORK_TREE = false, GIT_INDEX_FILE = false } })
end
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
-- fzf stand-in for Delete and Projects.
local function menu(selection, confirm, hook)
  local ui = { selection = selection or 1, confirm = confirm ~= false, hook = hook }
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
    attached = {}, process_failures = {}, view_failures = {}, status = {} }
  local r = { exec = real.exec, json = real.json, layout = real.layout, session_id = "helper", session = {}, block = {}, client = {} }
  f.rex = r
  local function attached(session) return f.attached_all or f.attached[session] end
  function r.session.attach(args) assert(f.live[args.session_id]); f.attached[args.session_id] = true; return {} end
  function r.session.view(args)
    assert(attached(args.session_id), "missing native session attachment")
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
    assert(creator == "com.superlogical.terminal" and attached(args.session_id))
    if method == "program_status" then
      return { records = f.status[args.session_id .. ":" .. args.block_id] or {} }
    end
    assert(method == "process")
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
      tab_label = window.window_label, path = block.options.cwd, block = tab.block_id })
    return { window_id = id, block_ids = {tab.block_id} }
  end
  function r.call(method, args)
    if method == "server.status" then return { host_id = "local" } end
    if method == "session.list" then
      local sessions = {}
      for id, label in pairs(f.live) do table.insert(sessions, { session_id = id, label = label }) end
      return { sessions = sessions }
    end
    if method == "session.attach_all" then
      assert(args.event_scope == "session"); f.attached_all = true; return { sessions = {} }
    end
    if method == "session.create" then
      if f.create_failure then return nil, "creation failed" end
      assert(#args.initial_windows == 1)
      local id = "created-session-" .. (#f.sessions_created + 1)
      f.live[id] = args.label; table.insert(f.sessions_created, id)
      return { session_id = id, initial_windows = { assert(new_tab(id, args.initial_windows[1])) } }
    end
    if method == "session.new_window" then
      assert(attached(args.session_id) and args.focus == false)
      return new_tab(args.session_id, args)
    end
    if method == "session.close_window" then
      assert(attached(args.session_id))
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
    assert(attached(args.session_id))
    table.insert(f.killed, args.session_id); f.live[args.session_id] = nil
    f.paths[args.session_id], f.tabs[args.session_id] = nil, nil
    return {}
  end
  return f
end
-- Scripted rex.ui. An answer is the typed text or a pick (exact title, id, or
-- part of a title); false means cancelled; {nil, reason, detail} is any other
-- no-answer; a function receives the prompt. Every prompt is recorded.
local function palette(f, answers)
  local ui = { asked = {} }
  local function respond(kind, spec)
    assert(type(spec.title) == "string" and spec.title ~= "", "prompts need a title")
    -- Rex shows the title inside the text field, where a long one hides what you type.
    assert(#spec.title <= 13, "prompt title too long for the field: " .. spec.title)
    table.insert(ui.asked, { kind = kind, spec = spec })
    assert(#answers > 0, "unexpected " .. kind .. " prompt: " .. spec.title)
    local answer = table.remove(answers, 1)
    if type(answer) == "function" then return answer(spec) end
    if answer == false then return nil, "cancelled" end
    if type(answer) == "table" then return answer[1], answer[2], answer[3] end
    if kind == "pick" then
      local seen = {}
      for _, item in ipairs(spec.items) do
        assert(not seen[item.id], "duplicate item id " .. item.id); seen[item.id] = true
      end
      for _, item in ipairs(spec.items) do if item.title == answer then return item.id end end
      for _, item in ipairs(spec.items) do if item.id == answer then return item.id end end
      for _, item in ipairs(spec.items) do if (item.title or ""):find(answer, 1, true) then return item.id end end
      error("no palette item matches " .. answer)
    end
    return answer
  end
  f.server.rex.ui = {
    input = function(spec) return respond("input", spec) end,
    pick = function(spec) return respond("pick", spec) end,
  }
  function ui:last(kind)
    for i = #self.asked, 1, -1 do if not kind or self.asked[i].kind == kind then return self.asked[i].spec end end
  end
  function ui:item(title, kind)
    for _, item in ipairs(self:last(kind or "pick").items) do if item.title == title then return item end end
  end
  function ui:titles(kind)
    local list = {}
    for _, item in ipairs(self:last(kind or "pick").items) do table.insert(list, item.title) end
    return table.concat(list, "\n")
  end
  return ui
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
  function f:action(mode, directory, extra)
    local args = { directory = directory or self.primary, source_session = "source", source_block = "1" }
    for key, value in pairs(extra or {}) do args[key] = value end
    return core.action(mode, args, self.server.rex)
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
  function f:origin()
    local path = self.root .. "/origin.git"
    git(self.root, "init", "--bare", "-b", "main", path)
    git(self.primary, "remote", "add", "origin", path)
    git(self.primary, "push", "-u", "origin", "main")
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
  palette(f, { "feature-a" })
  run(f:flow(), function(flow) flow:new_branch() end)
  local created = f.server.created[1]
  assert(#f.server.created == 1 and created.id == "source" and created.tab_label == "feature-a" and #f.server.sessions_created == 0)
  assert(git(created.path, "rev-parse", "HEAD"):gsub("\n$", "") == f.base)
end)
test("new tracks matching fetched remote tip, even with automatic tracking disabled", function(f)
  f:remote("origin", "feat/rex/example")
  git(f.primary, "config", "branch.autoSetupMerge", "false")
  palette(f, { "feat/rex/example" })
  run(f:flow(), function(flow) flow:new_branch() end)
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
  palette(f, { "feature-a" })
  run(f:flow(), function(flow) flow:new_branch() end)
  assert(git(f.server.created[1].path, "rev-parse", "--symbolic-full-name", "@{upstream}")
    == "refs/remotes/upstream/feature-a\n")
end)
test("multiple remote matches refuse without creating a branch or checkout", function(f)
  f:remote("origin", "feature-a"); f:remote("upstream", "feature-a")
  palette(f, { "feature-a" })
  fails(function() run(f:flow(), function(flow) flow:new_branch() end) end, "Branch matches several remotes")
  assert(f:trees() == 1 and #f.server.created == 0)
  assert(git(f.primary, "for-each-ref", "refs/heads/feature-a") == "")
end)
test("remote matching is exact and ignores symbolic refs", function(f)
  f:remote("origin", "other/feature-a")
  git(f.primary, "symbolic-ref", "refs/remotes/origin/feature-a", "refs/remotes/origin/other/feature-a")
  palette(f, { "feature-a" })
  run(f:flow(), function(flow) flow:new_branch() end)
  assert(git(f.server.created[1].path, "rev-parse", "HEAD"):gsub("\n$", "") == f.base)
end)
test("New does not fetch branches that exist only on the server", function(f)
  local remote = f:remote("origin", "other")
  git(remote, "branch", "feature-a")
  palette(f, { "feature-a" })
  run(f:flow(), function(flow) flow:new_branch() end)
  assert(git(f.server.created[1].path, "rev-parse", "HEAD"):gsub("\n$", "") == f.base)
  assert(git(f.primary, "for-each-ref", "refs/remotes/origin/feature-a") == "")
end)
test("an existing branch offers Open and is never reset", function(f)
  f:remote("origin", "feature-a")
  git(f.primary, "branch", "feature-a", "main")
  local ui = palette(f, { "feature-a", false })
  assert(f:action("new") == nil)
  local offer = ui:last("pick")
  assert(offer.title == "Branch exists", offer.title)
  assert(ui:item("Open feature-a") and ui:item("Choose another name"))
  assert(f:trees() == 1 and #f.server.created == 0)
  palette(f, { "feature-a", "Open feature-a" })
  f:action("new")
  local created = f.server.created[1]
  assert(#f.server.created == 1 and created.tab_label == "feature-a" and f:trees() == 2)
  assert(git(f.primary, "rev-parse", "feature-a"):gsub("\n$", "") == f.base, "never reset to the remote tip")
  assert(f.server.targets[1].window_id == created.window)
end)
test("New offers to open a branch that already has a worktree, without a duplicate tab", function(f)
  local path = f:linked()
  f.server.live.manual, f.server.paths.manual = "manual", {path}
  local ui = palette(f, { "feature-a", "Open feature-a" })
  f:action("new")
  contains(ui:item("Open feature-a").subtitle, "Focus its worktree tab")
  assert(#f.server.created == 0 and f:trees() == 2)
  assert(f.server.targets[1].session_id == "manual" and f.server.targets[1].window_id == "manual-tab")
end)
test("choosing another name asks again with the text kept", function(f)
  git(f.primary, "branch", "taken")
  local ui = palette(f, { "taken", "Choose another name", function(spec)
    assert(spec.value == "taken" and spec.title == "New worktree")
    return "feature-b"
  end })
  f:action("new")
  assert(#ui.asked == 3 and f.server.created[1].tab_label == "feature-b")
end)
test("branch slashes preserved; generated names use hyphens; spaces trimmed", function(f)
  palette(f, { "  feat/rex/example  " })
  run(f:flow(), function(flow) flow:new_branch() end)
  local created = f.server.created[1]
  assert(created.tab_label == "feat/rex/example" and created.path:match("repo%-with%-spaces%-feat%-rex%-example$"))
  assert(git(created.path, "symbolic-ref", "--short", "HEAD") == "feat/rex/example\n")
end)
test("invalid names ask again with the text kept and the reason shown", function(f)
  for _, branch in ipairs({"--force", "a..b", "trailing/", "a;touch bad", "@{-1}", "HEAD"}) do
    local ui = palette(f, { branch, function(spec)
      assert(spec.value == branch, "keep the typed text")
      assert(spec.title == "Invalid name", spec.title)
      return nil, "cancelled"
    end })
    assert(f:action("new") == nil and #ui.asked == 2)
  end
  local ui = palette(f, { "a..b", function(spec) assert(spec.value == "a..b"); return "feature-a" end })
  f:action("new")
  assert(#ui.asked == 2 and f.server.created[1].tab_label == "feature-a")
  assert(f:trees() == 2 and git(f.primary, "for-each-ref", "refs/heads/a..b") == "")
end)
test("an occupied directory asks again without overwriting it", function(f)
  local occupied = f.root .. "/repo-with-spaces-feature-a"
  execute({ "/bin/mkdir", occupied }); write(occupied .. "/keep", "keep")
  local ui = palette(f, { "feature/a", function(spec)
    assert(spec.value == "feature/a" and spec.title == "Folder exists", spec.title)
    return nil, "cancelled"
  end })
  assert(f:action("new") == nil and #ui.asked == 2)
  assert(read(occupied .. "/keep") == "keep" and f:trees() == 1)
  assert(git(f.primary, "for-each-ref", "refs/heads/feature/a") == "")
end)
test("blank, cancelled and timed-out prompts do nothing", function(f)
  for _, answer in ipairs({ "", "   ", false, { nil, "timeout" } }) do
    palette(f, { answer }); assert(f:action("new") == nil)
  end
  for _, answer in ipairs({ false, { nil, "timeout" } }) do
    palette(f, { answer }); assert(f:action("open") == nil)
  end
  assert(f:trees() == 1 and #f.server.created == 0 and #f.server.focused == 0)
end)
test("other unanswered prompts stop New and Open with the reason", function(f)
  f:linked()
  for _, case in ipairs({ {"no_client", "No Rex app could show the prompt"},
    {"unsupported", "can't show prompts"}, {"busy", "Another Rex prompt is open"},
    {"failed", "Rex couldn't show the prompt: palette broke"}, {"mystery", "Rex prompt ended: mystery"} }) do
    for _, mode in ipairs({ "new", "open" }) do
      palette(f, { { nil, case[1], case[1] == "failed" and "palette broke" or nil } })
      fails(function() f:action(mode) end, case[2])
    end
  end
  f.server.rex.ui = nil
  fails(function() f:action("new") end, "update Rex")
  assert(f:trees() == 2 and #f.server.created == 0 and #f.server.focused == 0)
end)
test("missing main never creates a checkout", function(f)
  git(f.primary, "branch", "-m", "main", "other")
  palette(f, { "feature-a" })
  fails(function() f:action("new") end, "refs/heads/main")
  assert(f:trees() == 1 and #f.server.created == 0)
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
test("Open rows: open and closed worktrees, then branches without one", function(f)
  f:linked(); git(f.primary, "branch", "local-only")
  local ui = palette(f, { false })
  f:action("open")
  local spec = ui:last("pick")
  assert(spec.title == "Worktrees" and spec.confirm == "Open", spec.title)
  assert(ui:item("main").icon == "terminal" and ui:item("feature-a").icon == "folder")
  local branch = ui:item("local-only")
  assert(branch.icon == "branch" and branch.detail == "create worktree")
  assert(branch.subtitle:match("^branch only · ") and ui:item("feature-a").subtitle:match("^no tab · "))
  assert(ui:item("main").subtitle:match("^tab open · "), ui:item("main").subtitle)
  assert(ui:item("main").detail == nil, "no remotes: no fetch time")
  assert(spec.items[#spec.items].title == "local-only", "branch rows come after worktrees")
  assert(not ui:titles():find("[all worktrees]", 1, true), "the old open-all row is gone")
  for _, item in ipairs(spec.items) do assert(not item.title:find("[", 1, true)) end
end)
test("Enter focuses an open tab, reopens a closed one, or creates a branch's worktree", function(f)
  local path = f:linked(); git(f.primary, "branch", "local-only")
  palette(f, { "main" }); f:action("open")
  assert(#f.server.created == 0 and f.server.targets[1].window_id == "source-tab")
  palette(f, { "feature-a" }); f:action("open")
  assert(#f.server.created == 1 and f.server.created[1].path == path)
  assert(f.server.targets[2].window_id == f.server.created[1].window)
  palette(f, { "local-only" }); f:action("open")
  assert(#f.server.created == 2 and f.server.created[2].tab_label == "local-only" and f:trees() == 3)
  palette(f, { "feature-a" }); f:action("open")
  assert(#f.server.created == 2 and f.server.targets[4].window_id == f.server.created[1].window)
end)
test("a tab opened while Open is asking is focused, not duplicated", function(f)
  local path = f:linked()
  palette(f, { function(spec)
    f.server.live.manual, f.server.paths.manual = "manual", {path}
    for _, item in ipairs(spec.items) do if item.title == "feature-a" then return item.id end end
  end })
  f:action("open")
  assert(#f.server.created == 0 and f.server.targets[1].session_id == "manual")
end)
test("Open status rows show activity, commit and one next step, newest first", function(f)
  local now = os.time()
  local hours = function(n) return now - n * 3600 end
  local origin = f:origin()
  -- Unpushed commits and uncommitted changes, edited now.
  local app = f.root .. "/app"
  git_at(hours(3), f.primary, "worktree", "add", "-b", "feat/app/example", app, "main")
  git(app, "push", "-u", "origin", "feat/app/example")
  for i = 1, 2 do
    write(app .. "/c" .. i, tostring(i)); git(app, "add", "c" .. i)
    git_at(hours(2), app, "commit", "-m", "add cost tiles")
  end
  write(app .. "/tracked", "edited\n"); write(app .. "/u1", "x"); write(app .. "/u2", "y")
  -- An agent waiting for an answer in the worktree's tab.
  local docs = f.root .. "/docs"
  git_at(hours(31), f.primary, "worktree", "add", "-b", "docs/model/example", docs, "main")
  write(docs .. "/joins", "keys"); git(docs, "add", "joins")
  git_at(hours(30), docs, "commit", "-m", "fix join keys")
  git(docs, "push", "-u", "origin", "docs/model/example")
  run(f:flow(), function(flow) flow:open_path(docs) end)
  f.server.status["source:" .. f.server.created[1].block] = {
    { state = "idle", app = "pi", updated_at = os.date("!%Y-%m-%dT%H:%M:%SZ", hours(40)) },
    { id = "task", state = "blocked", kind = "permission", effective_app = "claude-code",
      updated_at = os.date("!%Y-%m-%dT%H:%M:%S.123456789Z", hours(29)) },
  }
  -- Landed: its pull request was merged and its branch deleted.
  local old = f.root .. "/old"
  git_at(hours(100), f.primary, "worktree", "add", "-b", "chore/ingestion/example", old, "main")
  write(old .. "/job", "old"); git(old, "add", "job")
  git_at(hours(100), old, "commit", "-m", "drop old job")
  git(old, "push", "-u", "origin", "chore/ingestion/example")
  git(origin, "branch", "-D", "chore/ingestion/example")
  -- Never published.
  local local_only = f.root .. "/unpublished"
  git_at(hours(80), f.primary, "worktree", "add", "-b", "feat/new/unpublished", local_only, "main")
  write(local_only .. "/n", "n"); git(local_only, "add", "n")
  git_at(hours(80), local_only, "commit", "-m", "start idea")
  -- A deleted upstream on a branch with no worktree.
  git(f.primary, "branch", "gone-branch", "main"); git(f.primary, "push", "-u", "origin", "gone-branch")
  git(origin, "branch", "-D", "gone-branch")
  git(f.primary, "fetch", "--prune", "origin")
  local ui = palette(f, { false })
  f:action("open")
  local spec = ui:last("pick")
  assert(spec.title == "Worktrees", spec.title)
  local function row(title) return assert(ui:item(title), "missing row " .. title) end
  -- One fact per row, the most urgent: pushing comes before the 3 changed files.
  assert(row("feat/app/example").detail == "push 2", row("feat/app/example").detail)
  assert(row("feat/app/example").subtitle == "no tab · just now", row("feat/app/example").subtitle)
  assert(row("docs/model/example").detail == "Claude waiting", row("docs/model/example").detail)
  assert(row("docs/model/example").subtitle == "tab open · yesterday", row("docs/model/example").subtitle)
  assert(row("docs/model/example").icon == "terminal")
  assert(row("feat/new/unpublished").detail == "push 1" and row("feat/new/unpublished").subtitle == "no tab · 3 days ago")
  assert(row("chore/ingestion/example").detail == "ready to close", row("chore/ingestion/example").detail)
  assert(row("chore/ingestion/example").subtitle == "no tab · 4 days ago")
  -- The primary checkout shows the newest fetch when nothing is more urgent.
  assert(row("main").detail == "fetched just now", tostring(row("main").detail))
  assert(row("gone-branch").detail == "create worktree" and row("gone-branch").subtitle:match("^branch only · "))
  local order = {}
  for i, item in ipairs(spec.items) do order[item.title] = i end
  assert(order["feat/app/example"] < order["docs/model/example"] and order["docs/model/example"] < order["feat/new/unpublished"]
    and order["feat/new/unpublished"] < order["chore/ingestion/example"] and order["chore/ingestion/example"] < order["gone-branch"],
    ui:titles())
end)
test("Open shows operations in progress, needed rebases and patch-landed work", function(f)
  f:origin()
  local busy, behind, landed = f:linked("busy"), f:linked("behind"), f:linked("landed")
  write(busy .. "/tracked", "busy\n"); git(busy, "commit", "-am", "busy change")
  write(landed .. "/fix", "fix"); git(landed, "add", "fix"); git(landed, "commit", "-m", "small fix")
  -- main gains the same patch under a new commit, as a squash merge would.
  write(f.primary .. "/tracked", "main moved\n"); git(f.primary, "commit", "-am", "main moved")
  git(f.primary, "cherry-pick", (git(landed, "rev-parse", "HEAD"):gsub("\n$", "")))
  git(f.primary, "push", "origin", "main")
  local conflict = real.exec({ "git", "-C", busy, "rebase", "main" }, {})
  assert(conflict and not conflict.ok, "fixture rebase should stop on a conflict")
  local ui = palette(f, { false })
  f:action("open")
  assert(ui:item("busy").detail == "finish rebase", ui:item("busy").detail)
  local _, rows = ui:titles():gsub("busy", "")
  assert(rows == 1 and ui:item("busy").icon ~= "branch", "a rebasing worktree keeps its branch row")
  assert(ui:item("behind").detail == "rebase 2", ui:item("behind").detail)
  assert(ui:item("landed").detail == "ready to close", ui:item("landed").detail)
  execute({ "/bin/rm", "-rf", behind })
  ui = palette(f, { false })
  f:action("open")
  assert(ui:item("behind").detail == "missing directory" and ui:item("behind").subtitle == behind)
  palette(f, { "behind" })
  fails(function() f:action("open") end, "Worktree unavailable")
end)
test("about 15 worktrees list quickly without fetching or changing Git state", function(f)
  f:origin()
  for i = 1, 14 do
    local path = f:linked("feat/load/w" .. i)
    if i % 2 == 0 then write(path .. "/new-" .. i, "x") end
    if i % 3 == 0 then write(path .. "/c", "c"); git(path, "add", "c"); git(path, "commit", "-m", "work " .. i) end
    if i % 4 == 0 then f.server.paths["tab" .. i], f.server.live["tab" .. i] = {path}, "tab " .. i end
  end
  local marker = f.root .. "/marker"
  write(marker, "")
  -- Program starts are slow on macOS: per-worktree Git must run in parallel,
  -- so commands that run one after another stay few however many worktrees.
  local runs = { waited = 0, started = 0 }
  f.server.rex.exec = setmetatable({ start = function(argv, options)
    runs.started = runs.started + 1; return real.exec.start(argv, options)
  end }, { __call = function(_, argv, options)
    runs.waited = runs.waited + 1; return real.exec(argv, options)
  end })
  local started = os.time()
  local ui = palette(f, { false })
  assert(f:action("open") == nil)
  local elapsed = os.time() - started
  assert(elapsed < 30, "listing took " .. elapsed .. "s")
  assert(#ui:last("pick").items == 15)
  assert(runs.waited <= 2, runs.waited .. " commands ran one after another")
  assert(runs.started >= 45, runs.started .. " commands ran in parallel")
  local changed = execute({ "/usr/bin/find", f.primary .. "/.git", "-newer", marker })
  assert(changed == "", "Open changed Git state:\n" .. changed)
end)
test("palette actions reach other sessions with attach_all when rex.session.attach is absent", function(f)
  local path = f:linked(); f:source_at(f.root)
  f.server.live.manual, f.server.paths.manual = "manual", {path}
  f.server.rex.session.attach = nil
  palette(f, { "feature-a" })
  f:action("open")
  assert(f.server.attached_all and f.server.targets[1].session_id == "manual")
  palette(f, { "feature-b" })
  f:action("new")
  assert(f.server.created[1].tab_label == "feature-b" and f.server.created[1].id == "manual")
end)
test("palette action arguments are required", function(f)
  for _, name in ipairs({ "source_session", "source_block", "directory" }) do
    local args = { directory = f.primary, source_session = "source", source_block = "1" }
    args[name] = nil
    fails(function() core.action("open", args, f.server.rex) end, "terminal in the local Rex app")
  end
  fails(function() f:action("delete") end, "Invalid worktree action")
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
  palette(f, { "feature-a", "feature-b" })
  f:action("open")
  assert(f.server.created[1].path == path)
  f:action("new")
  assert(#f.server.created == 2 and f:trees() == 3)
end)
test("failed unrelated session view cannot block Open", function(f)
  f:linked()
  f.server.live.stray, f.server.paths.stray = "stray", {f.root}
  f.server.view_failures.stray = true
  palette(f, { "feature-a" })
  f:action("open")
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
  fails(function() run(f:flow(path, menu(nil, false)), function(flow) flow:delete() end) end, core.cancelled)
  assert(#f.server.killed == 0 and #f.server.closed == 0 and f:trees() == 2)
end)
test("files written during confirmation block tab teardown", function(f)
  local path = f:linked(); f:source_at(path)
  local ui = menu(nil, nil, function() write(path .. "/new-file", "keep") end)
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
  local ui = menu(nil, nil, function() f.server.block_override = f.primary end)
  fails(function() run(f:flow(path, ui), function(flow) flow:delete() end) end, "changed directory")
  assert(#f.server.killed == 0 and #f.server.closed == 0)
end)
test("creation/focus failures leave recoverable worktree without duplicate session", function(f)
  f.server.create_failure = true
  palette(f, { "feature-a" })
  fails(function() f:action("new") end, "creation failed")
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
  local ui = menu(nil, nil, function() table.insert(f.server.paths.source, f.primary) end)
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
  local responses = { {ok = true, code = 0, stdout = "/some/path\0Open path\0"},
    {ok = true, code = 0, stdout = "2\tsecond\0"}, {ok = false, code = 130, stdout = ""} }
  local calls = {}
  local ui = core.Menu.new({ exec = function(argv, options)
    table.insert(calls, {argv, options}); return table.remove(responses, 1)
  end })
  assert(ui:query("path", "Open path") == "/some/path")
  assert(ui:pick("picker", {{"first", false}, {"second", true}}))
  fails(function() ui:query("path", "Open path") end, core.cancelled)
  assert(calls[1][2].env.FZF_DEFAULT_OPTS == "" and calls[1][2].stdin == "Open path\0")
  assert(calls[2][2].stdin == "1\tfirst\0" .. "2\tsecond\0")
end)
test("native fzf emits the expected query and row delimiters", function(f)
  local filter = "Open"
  local ui = core.Menu.new({ exec = function(argv, options)
    table.insert(argv, "--filter=" .. filter) -- exercise real fzf without opening a TTY
    return real.exec(argv, options)
  end })
  assert(ui:query("native query", "Open path") == "Open")
  filter = "second"
  assert(ui:pick("native picker", {{"first", false}, {"second", true}}))
end)
test("relative times and program status timestamps", function(f)
  local now = 1795806167
  for seconds, text in pairs({ [0] = "just now", [59] = "just now", [60] = "1 minute ago", [7200] = "2 hours ago",
    [86400] = "yesterday", [4 * 86400] = "4 days ago", [20 * 86400] = "2 weeks ago",
    [90 * 86400] = "3 months ago", [800 * 86400] = "2 years ago" }) do
    assert(core.ago(now, now - seconds) == text, seconds .. " -> " .. core.ago(now, now - seconds))
  end
  assert(core.ago(now, nil) == "no activity")
  assert(core.epoch("2026-11-27T19:02:47Z") == 1795806167)
  assert(core.epoch("2026-11-27T19:02:47.593091335Z") == 1795806167)
  assert(core.epoch("2026-11-28T00:32:47+05:30") == 1795806167)
  assert(core.epoch("2000-02-29T00:00:00Z") == 951782400 and core.epoch("1970-01-01T00:00:00Z") == 0)
  assert(core.epoch("yesterday") == nil and core.epoch("2026-11-27T19:02:47") == nil)
end)
test("manual invocation cannot close a working session", function(f)
  fails(function() core.main({mode = "delete"}, f.server.rex) end, "keybindings")
  fails(function()
    core.main({mode = "delete", source_session = "source", source_block = "focused", directory = f.primary}, f.server.rex)
  end, "temporary menu session")
  -- New and Open run in the palette, never in a menu session.
  fails(function()
    core.main({mode = "open", source_session = "source", source_block = "focused", directory = f.primary}, f.server.rex)
  end, "Invalid worktree action")
  assert(#f.server.killed == 0)
end)
test("cancelled main action returns to source and closes only its menu", function(f)
  f.server.live.helper = "rex-worktrees-project"
  f.server.rex.exec = setmetatable({}, { __call = function(_, argv, options)
    if argv[1] == "fzf" then return {ok = false, code = 130, stdout = "", stderr = ""} end
    return real.exec(argv, options)
  end })
  core.main({mode = "project", source_session = "source", projects = { f.primary }}, f.server.rex)
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
  f.server.live.helper = "rex-worktrees-project"
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
  core.main({mode = "project", source_session = "source", projects = { f.primary }}, f.server.rex, terminal)
  assert(console.calls == 1 and console.waited)
  contains(console.output, message)
  contains(console.output, "Press Enter to close this menu.")
  assert(#f.server.killed == 1 and f.server.killed[1] == "helper" and f.server.live.source)
end)
test("outside Git, Open picks a listed project, then its worktrees", function(f)
  local other = f:repo("host/owner/other"); f:repo("unlisted"); f:linked(); f:source_at(f.root)
  local ui = palette(f, { "repo with spaces", "feature-a" })
  f:action("open", f.root, { projects = { other, f.primary, f.root .. "/missing" } })
  local projects = ui.asked[1].spec
  assert(projects.title == "Project", projects.title)
  local rows = {}
  for _, item in ipairs(projects.items) do
    table.insert(rows, item.title .. "|" .. item.subtitle .. "|" .. item.detail .. "|" .. item.icon)
  end
  assert(table.concat(rows, "\n") == "other|" .. other .. "|session closed|folder\nrepo with spaces|"
    .. f.primary .. "|session closed|folder\nmissing|" .. f.root .. "/missing|missing|folder", table.concat(rows, "\n"))
  assert(ui.asked[2].spec.title == "Worktrees")
  local created = f.server.created[1]
  assert(#f.server.created == 1 and created.path:match("feature%-a$") and created.label == "repo-with-spaces")
end)
test("outside Git, New branches from the chosen project's local main", function(f)
  local other = f:repo("host/owner/other"); f:source_at(f.root)
  local ui = palette(f, { "other", "feature-b" })
  f:action("new", f.root, { projects = { f.primary, other } })
  assert(ui.asked[1].spec.title == "Project")
  assert(ui.asked[2].spec.title == "New worktree" and ui.asked[2].spec.confirm == "Create in other")
  contains(ui.asked[2].spec.placeholder, "other")
  local created = f.server.created[1]
  assert(created.label == "other" and created.tab_label == "feature-b" and created.path == f.root .. "/host/owner/other-feature-b")
  assert(git(created.path, "rev-parse", "HEAD") == git(other, "rev-parse", "main"))
end)
test("cancelling the project prompt does nothing", function(f)
  f:source_at(f.root)
  for _, mode in ipairs({ "new", "open" }) do
    local ui = palette(f, { false })
    assert(f:action(mode, f.root, { projects = { f.primary } }) == nil and #ui.asked == 1)
  end
  assert(#f.server.created == 0 and f:trees() == 1 and #f.server.focused == 0)
end)
test("missing projects and empty lists are refused without creating sessions", function(f)
  f:source_at(f.root)
  palette(f, { "missing" })
  fails(function() f:action("open", f.root, { projects = { f.root .. "/missing" } }) end, "Project directory is missing")
  fails(function() f:action("open", f.root, { projects = {} }) end, "No projects configured")
  fails(function() f:action("open", f.root, { projects = { "relative/path" } }) end, "must be absolute")
  assert(#f.server.created == 0)
end)
test("delete outside Git fails without offering projects", function(f)
  local ui = palette(f, {})
  fails(function() f:flow(f.root, menu(), { mode = "delete", projects = { f.primary } }) end, "not a git repository")
  assert(#ui.asked == 0 and #f.server.killed == 0)
end)
test("outside Git, the project list shows open first and the current session last", function(f)
  local other, zeta = f:repo("host/owner/other"), f:repo("host/owner/zeta")
  f.server.live.other, f.server.paths.other = "renamed", {other}
  f.server.paths.source = {f.root, f.primary}
  local ui = palette(f, { "other", "main" })
  f:action("open", f.root, { projects = { f.primary, zeta, other } })
  local details = {}
  for _, item in ipairs(ui.asked[1].spec.items) do table.insert(details, item.title .. "|" .. item.detail) end
  assert(table.concat(details, "\n") == "other|session open\nzeta|session closed\nrepo with spaces|current session",
    table.concat(details, "\n"))
  assert(#f.server.created == 0 and f.server.targets[1].session_id == "other")
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
  local ui = palette(f, { "repo with spaces" })
  local flow = f:flow(f.root, menu(), { mode = "open", projects = { f.primary } })
  assert(ui:item("repo with spaces").detail == "current session")
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
  local ui = menu(nil, nil, function()
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
local passed = 0
for _, item in ipairs(tests) do
  local f = fixture()
  local ok, err = xpcall(function() item[2](f) end, debug.traceback)
  if not ok then error("FAIL " .. item[1] .. ": " .. tostring(err), 0) end
  passed = passed + 1
  print("PASS " .. item[1])
end
return { ok = true, lifecycle_tests = passed, actions = 4, bindings = 4, rejected_contexts = rejected.n }
