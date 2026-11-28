-- Worktree actions. init.lua loads this file from its own folder for New and
-- Open (Cmd+Shift+N/O) and calls M.action, which asks in Rex's command palette.
-- Delete and Projects still run it locally with `rex do worktrees.lua --args
-- <json>` in a temporary menu terminal. Loading it without args.mode only
-- returns its testable module.
--
-- Rex Lua quirks, checked on 0.1.0-preview.25:
-- - Palette prompts fail under pcall, so never ask inside one.
-- - Store a yielding call's result before looping over it: an action sees nil
--   for `for x in rex.exec(...).stdout:gmatch(...)`.
-- - After a pcall inside a closure catches an error, that closure's writes to
--   outer locals are lost; write table fields instead.
local M = {}
local CANCEL = "worktree action cancelled"
local TERMINAL = "com.superlogical.terminal"
local BASE = "main"
local function checked(value, err)
  if value == nil then error(err or "Rex returned no result", 0) end
  return value
end
local function fail(message) error(message, 0) end
local function visible(value) return (tostring(value):gsub("[%z\1-\31\127]", "?")) end
local function trim(value) return (value:gsub("^%s+", ""):gsub("%s+$", "")) end
local function line(value) return (value:gsub("\n$", "")) end
local function parent(path) return path:match("^(.*)/[^/]+$") or "/" end
local function basename(path) return path:match("([^/]+)$") or "worktree" end
local function inside(path, root) return path == root or path:sub(1, #root + 1) == root .. "/" end
local function count(set)
  local n, last = 0, nil
  for key in pairs(set) do n, last = n + 1, key end
  return n, last
end
local function execute(r, argv, options)
  local result = checked(r.exec(argv, options or { timeout = 120 }))
  if not result.ok then
    fail(argv[1] .. " failed: " .. trim(result.stderr or result.stdout or ""))
  end
  return result.stdout
end
local function digest(r, value)
  local output = execute(r, { "/usr/bin/shasum", "-a", "256" }, { stdin = value, timeout = 10 })
  return checked(output:match("^(%x+)"), "Cannot hash worktree identity")
end
local function slug(r, value)
  local name = value:gsub("[^a-zA-Z0-9-]+", "-"):gsub("^-+", ""):gsub("-+$", "")
  return name ~= "" and name or "worktree-" .. digest(r, value):sub(1, 8)
end
local function readable(path)
  local file = io.open(path, "r")
  if file then file:close() end
  return file ~= nil
end
local function first_line(path)
  local file = io.open(path, "r")
  if not file then return nil end
  local text = file:read("*l")
  file:close()
  return text
end
local function plural(n, word) return n .. " " .. word .. (n == 1 and "" or "s") end

-- "2 hours ago" from Unix seconds.
function M.ago(now, t)
  if not t or t <= 0 then return "no activity" end
  local s = now - t
  if s < 60 then return "just now" end
  local function unit(value, word) return plural(math.floor(value), word) .. " ago" end
  if s < 3600 then return unit(s / 60, "minute") end
  if s < 86400 then return unit(s / 3600, "hour") end
  if s < 2 * 86400 then return "yesterday" end
  if s < 14 * 86400 then return unit(s / 86400, "day") end
  if s < 60 * 86400 then return unit(s / (7 * 86400), "week") end
  if s < 365 * 86400 then return unit(s / (30 * 86400), "month") end
  return unit(s / (365 * 86400), "year")
end
local ago = M.ago

-- Unix seconds from an RFC 3339 timestamp, such as program status updated_at.
function M.epoch(text)
  if type(text) ~= "string" then return nil end
  local y, mo, d, h, mi, s, zone =
    text:match("^(%d%d%d%d)-(%d%d)-(%d%d)[Tt ](%d%d):(%d%d):(%d%d)%.?%d*(.*)$")
  if not y then return nil end
  y, mo = tonumber(y), tonumber(mo)
  if mo <= 2 then y = y - 1 end
  local era = math.floor(y / 400)
  local yoe = y - era * 400
  local doy = math.floor((153 * ((mo + 9) % 12) + 2) / 5) + tonumber(d) - 1
  local days = era * 146097 + yoe * 365 + math.floor(yoe / 4) - math.floor(yoe / 100) + doy - 719468
  local t = days * 86400 + tonumber(h) * 3600 + tonumber(mi) * 60 + tonumber(s)
  local sign, oh, om = zone:match("^([+-])(%d%d):?(%d%d)$")
  if sign then return t - (sign == "+" and 1 or -1) * (tonumber(oh) * 3600 + tonumber(om) * 60) end
  if zone == "Z" or zone == "z" then return t end
end

-- Newest timestamp in a reflog, read from its tail without running Git.
local function reflog_time(path)
  local file = io.open(path, "r")
  if not file then return nil end
  local size = file:seek("end") or 0
  file:seek("set", math.max(0, size - 4096))
  local tail = file:read("*a") or ""
  file:close()
  local latest
  for stamp in tail:gmatch("> (%d+) [-+]%d%d%d%d\t") do latest = tonumber(stamp) end
  return latest
end

local Menu = {}
Menu.__index = Menu
function Menu.new(r) return setmetatable({ rex = r }, Menu) end
function Menu:run(title, rows, extra)
  local argv = { "fzf", "--read0", "--print0", "--no-sort", "--layout=reverse",
    "--header=" .. visible(title), "--prompt=worktree> " }
  for _, arg in ipairs(extra or {}) do table.insert(argv, arg) end
  local result = checked(self.rex.exec(argv, {
    stdin = table.concat(rows, "\0") .. "\0",
    env = { FZF_DEFAULT_OPTS = "", FZF_DEFAULT_OPTS_FILE = "/dev/null" },
    -- No timeout: fzf owns /dev/tty while the user is choosing.
  }))
  if result.code == 1 or result.code == 130 then fail(CANCEL) end
  if not result.ok then fail("fzf failed: " .. visible(result.stderr or "")) end
  return result.stdout
end
function Menu:query(title, row)
  local output = self:run(title, { row }, { "--disabled", "--print-query" })
  local query = trim(output:match("^([^%z]*)") or "")
  if query == "" then fail(CANCEL) end
  return query
end
function Menu:pick(title, choices)
  if #choices == 0 then fail("No choices available") end
  local rows = {}
  for i, item in ipairs(choices) do rows[i] = i .. "\t" .. visible(item[1]) end
  local output = self:run(title, rows, { "--delimiter=\t", "--with-nth=2.." })
  local index = tonumber(output:match("^(%d+)\t"))
  if not index or not choices[index] then fail("Invalid picker result") end
  return choices[index][2]
end
M.Menu = Menu

-- Rex's command palette (rex.ui). A cancelled or timed-out prompt returns nil,
-- so the action does nothing; any other unanswered prompt stops it with why.
local Palette = {}
Palette.__index = Palette
local UNANSWERED = {
  no_client = "No Rex app could show the prompt",
  unsupported = "This Rex app can't show prompts; update it",
  busy = "Another Rex prompt is open; answer or close it first",
  failed = "Rex couldn't show the prompt",
}
function Palette.new(r) return setmetatable({ rex = r }, Palette) end
function Palette:ask(kind, spec)
  local ui = self.rex.ui
  if type(ui) ~= "table" or not ui[kind] then
    fail("This Rex can't ask in the command palette; update Rex (control API revision 17 or newer)")
  end
  local value, why, detail = ui[kind](spec)
  if value ~= nil then return value end
  if why == "cancelled" or why == "timeout" then return nil end
  fail((UNANSWERED[why] or ("Rex prompt ended: " .. visible(why)))
    .. (detail and (": " .. visible(detail)) or ""))
end
function Palette:input(spec) return self:ask("input", spec) end
function Palette:pick(spec) return self:ask("pick", spec) end
M.Palette = Palette

local Workflow = {}
Workflow.__index = Workflow
local GIT_ENV = { GIT_DIR = false, GIT_WORK_TREE = false, GIT_COMMON_DIR = false, GIT_INDEX_FILE = false }
local function git_argv(directory, ...)
  local argv = { "git", "-C", directory }
  for _, arg in ipairs({...}) do table.insert(argv, arg) end
  return argv
end
function Workflow:git(directory, ...)
  return execute(self.rex, git_argv(directory, ...), { timeout = 120, env = GIT_ENV })
end
-- Git output, or nil and Git's reason; never raises.
function Workflow:try_git(directory, ...)
  local result, err = self.rex.exec(git_argv(directory, ...), { timeout = 120, env = GIT_ENV })
  if not result then return nil, err end
  if not result.ok then return nil, "git failed: " .. trim(result.stderr or result.stdout or "") end
  return result.stdout
end
function Workflow:physical(path)
  return line(execute(self.rex, { "/bin/pwd", "-P" }, { cwd = path, timeout = 10 }))
end
function Workflow:is_directory(path) return checked(self.rex.exec({ "/bin/test", "-d", path })).ok end
function Workflow:exists(path)
  return checked(self.rex.exec({ "/bin/test", "-e", path })).ok
    or checked(self.rex.exec({ "/bin/test", "-L", path })).ok
end
-- Starting a program is slow on macOS, so Open batches and overlaps them.
local function git_command(directory, ...)
  return { git_argv(directory, ...), { timeout = 120, env = GIT_ENV } }
end
local function stdout(result) return result and result.ok and result.stdout or nil end
-- Runs { argv, options } commands a dozen at a time; results keep their order.
function Workflow:exec_all(commands)
  local ok, start = pcall(function() return self.rex.exec.start end)
  if not ok then start = nil end
  local results = {}
  for first = 1, #commands, 12 do
    local last, handles = math.min(first + 11, #commands), {}
    for i = first, last do
      if start then handles[i] = start(commands[i][1], commands[i][2]) end
    end
    for i = first, last do
      local handle = handles[i]
      if handle then results[i] = handle:wait()
      else results[i] = self.rex.exec(commands[i][1], commands[i][2]) end
    end
  end
  return results
end
-- One shell for many directories, using only builtins; prints each answer
-- followed by NUL. CDPATH is cleared so `cd` prints nothing itself.
function Workflow:shell_all(script, paths)
  local found = {}
  if #paths == 0 then return found end
  local argv = { "/bin/sh", "-c", script, "sh" }
  for _, path in ipairs(paths) do table.insert(argv, path) end
  local output = execute(self.rex, argv, { timeout = 20, env = { CDPATH = false } })
  local i = 0
  for value in output:gmatch("([^%z]*)%z") do i = i + 1; found[i] = value ~= "" and value or false end
  return found
end
-- Physical paths, or false for a missing or unreadable directory.
local PHYSICAL = [[for d do
if cd -P -- "$d" 2>/dev/null; then printf '%s\0' "$PWD"; else printf '\0'; fi
done]]
function Workflow:physical_all(paths) return self:shell_all(PHYSICAL, paths) end
-- Checkout roots: the nearest physical ancestor holding .git, as Git finds it
-- (so a nested repository is its own root), or false.
local ROOTS = [[for d do r=
if cd -P -- "$d" 2>/dev/null; then p=$PWD
while :; do
if [ -e "$p/.git" ]; then r=$p; break; fi
[ "$p" = / ] && break
p=${p%/*}; [ -n "$p" ] || p=/
done
fi
printf '%s\0' "$r"
done]]
function Workflow:roots_all(paths) return self:shell_all(ROOTS, paths) end
local function parse_worktrees(raw)
  local records, record = {}, {}
  for token in (raw .. "\0"):gmatch("([^%z]*)%z") do
    if token == "" then
      if record.worktree then
        record.branch = (record.branch or ""):gsub("^refs/heads/", "")
        table.insert(records, record)
        record = {}
      end
    else
      local key, value = token:match("^(%S+) ?(.*)$")
      record[key] = value
    end
  end
  return records
end
-- Fills in each record's physical path and whether its directory exists.
function Workflow:locate(records)
  local paths = {}
  for i, record in ipairs(records) do paths[i] = record.worktree end
  local physical = self:physical_all(paths)
  for i, record in ipairs(records) do
    record.present = physical[i] and true or false
    record.path = physical[i] or record.worktree
  end
  return records
end
function Workflow:worktrees()
  -- Separate Rex's yielding subprocess call from the iterator expression.
  local raw = self:git(self.checkout, "worktree", "list", "--porcelain", "-z")
  return self:locate(parse_worktrees(raw))
end
-- Returns nil when the user cancels the project prompt.
function Workflow.new(args, r, menu, ui)
  local self = setmetatable({ args = args, rex = r, menu = menu or Menu.new(r),
    ui = ui or Palette.new(r), attached = {} }, Workflow)
  self.host = checked(r.call("server.status")).host_id
  self.helper = r.session_id
  -- The project menu chooses its checkouts after the user picks an action.
  if args.mode == "project" then return self end
  local top, err = self:try_git(args.directory, "rev-parse", "--show-toplevel")
  if not top then
    -- Deletion only ever targets the source terminal's own checkout.
    if not args.projects or args.mode == "delete" then fail(err) end
    local project = self:pick_project()
    if not project then return nil end
    if not project.present then fail("Project directory is missing: " .. visible(project.path)) end
    top = self:git(project.path, "rev-parse", "--show-toplevel")
  end
  return self:load(top)
end
function Workflow:load(top)
  self.checkout = self:physical(line(top))
  self.trees = self:worktrees()
  if not self.trees[1] or self.trees[1].bare then fail("A non-bare primary checkout is required") end
  self.primary = self.trees[1].path
  local registered = false
  for _, tree in ipairs(self.trees) do if tree.path == self.checkout then registered = true end end
  if not registered then fail("Current directory is not a registered worktree") end
  return self
end
function Workflow:attach(session)
  if self.attached_all or self.attached[session] then return end
  if self.rex.session.attach then
    -- Scripts: API revision 7 rejects view/block/destroy requests on an
    -- unattached RPC stream with 409 "stream is not attached to session"
    -- (verified live). Attach scopes this connection; it does not select or
    -- restore the UI session.
    checked(self.rex.session.attach{ session_id = session })
    self.attached[session] = true
  else
    -- Palette actions have no rex.session.attach. attach_all reaches every
    -- session without joining one, and lasts only for this action (verified on
    -- preview.25).
    checked(self.rex.call("session.attach_all", { event_scope = "session" }))
    self.attached_all = true
  end
end
function Workflow:sessions()
  local live = {}
  local list = checked(self.rex.call("session.list")).sessions or {}
  for _, session in ipairs(list) do
    live[session.session_id] = session.label or session.session_id
  end
  return live
end
function Workflow:process(session, block)
  self:attach(session)
  return checked(self.rex.block.call(TERMINAL, "process", { session_id = session, block_id = block }))
end
function Workflow:windows(session)
  self:attach(session)
  local view = checked(self.rex.session.view{ session_id = session })
  local windows = {}
  for _, window in ipairs(view.windows or {}) do
    local item = { id = window.window_id, blocks = {}, terminals = {} }
    for _, layer in ipairs(window.layers or {}) do
      for _, block in ipairs(layer.blocks or {}) do
        item.blocks[block.block_id] = true
        local directory = false
        if block.host_id == self.host and block.creator_name == TERMINAL then
          local ok, process = pcall(self.process, self, session, block.block_id)
          directory = ok and ((process.foreground or {}).cwd or (process.child or {}).cwd) or false
        end
        table.insert(item.terminals, { block = block.block_id, directory = directory })
      end
    end
    table.insert(windows, item)
  end
  return windows
end
-- Every local terminal whose directory is in a checkout, with that checkout's
-- root. A listing reuses one scan (self.scan); everything else rescans.
function Workflow:terminals()
  if self.scan then return self.scan end
  local found, directories, seen = {}, {}, {}
  local live = self:sessions()
  for session in pairs(live) do
    if session ~= self.helper then
      -- Discovery is best-effort; deletion rechecks the source tab strictly.
      local ok, windows = pcall(self.windows, self, session)
      for _, window in ipairs(ok and windows or {}) do
        for _, terminal in ipairs(window.terminals) do
          local directory = terminal.directory
          if directory then
            table.insert(found, { session = session, window = window.id, block = terminal.block, directory = directory })
            if not seen[directory] then seen[directory] = true; table.insert(directories, directory) end
          end
        end
      end
    end
  end
  local roots, root_of, scan = self:roots_all(directories), {}, {}
  for i, directory in ipairs(directories) do root_of[directory] = roots[i] end
  for _, terminal in ipairs(found) do
    terminal.root = root_of[terminal.directory]
    if terminal.root then table.insert(scan, terminal) end
  end
  return scan
end
function Workflow:associate(paths, tabs)
  local matches = {}
  for _, path in ipairs(paths) do matches[path] = {} end
  local terminals = self:terminals()
  for _, terminal in ipairs(terminals) do
    local found = matches[terminal.root]
    if found then found[tabs and terminal.window or terminal.session] = terminal.session end
  end
  return matches
end
function Workflow:associations(tabs)
  local paths = {}
  for _, tree in ipairs(self.trees) do table.insert(paths, tree.path) end
  return self:associate(paths, tabs)
end
function Workflow:projects()
  -- The configured list, in its own order; nothing is scanned or remembered.
  local configured, found, seen = {}, {}, {}
  for _, path in ipairs(self.args.projects or {}) do
    if type(path) ~= "string" or path:sub(1, 1) ~= "/" then fail("Project paths must be absolute: " .. visible(path)) end
    table.insert(configured, path)
  end
  if #configured == 0 then fail("No projects configured; list them in the projects table in init.lua") end
  local physical = self:physical_all(configured)
  for i, path in ipairs(configured) do
    local resolved = physical[i] or path
    if not seen[resolved] then
      seen[resolved] = true
      table.insert(found, { path = resolved, name = basename(path), configured = path,
        present = physical[i] and true or false })
    end
  end
  return found
end
-- Palette list of configured projects: open first, the current one last.
-- Returns nil when cancelled.
function Workflow:pick_project()
  local projects, present, commands, matches = self:projects(), {}, {}, {}
  for _, project in ipairs(projects) do
    matches[project.path] = {}
    if project.present then
      table.insert(present, project)
      table.insert(commands, git_command(project.path, "worktree", "list", "--porcelain", "-z"))
    end
  end
  local lists, trees, owners = self:exec_all(commands), {}, {}
  for i, project in ipairs(present) do
    local raw = stdout(lists[i])
    for _, record in ipairs(raw and parse_worktrees(raw) or {}) do
      table.insert(trees, record); owners[#trees] = project.path
    end
  end
  self:locate(trees)
  local project_of = {}
  for i, record in ipairs(trees) do project_of[record.path] = owners[i] end
  local terminals = self:terminals()
  for _, terminal in ipairs(terminals) do
    local project = project_of[terminal.root]
    if project then matches[project][terminal.session] = true end
  end
  -- Include worktree-only sessions; labels are never project identity.
  local groups, by_id = { {}, {}, {} }, {}
  for _, project in ipairs(projects) do
    local sessions, group, status = matches[project.path], 2, "session closed"
    if not project.present then status = "missing"
    elseif sessions[self.args.source_session] then group, status = 3, "current session"
    elseif count(sessions) > 0 then group, status = 1, "session open" end
    by_id[project.path] = project
    table.insert(groups[group], { id = project.path, title = visible(project.name),
      subtitle = visible(project.configured), detail = status, icon = "folder" })
  end
  local items = {}
  for _, group in ipairs(groups) do
    for _, item in ipairs(group) do table.insert(items, item) end
  end
  local id = self.ui:pick{
    title = (self.args.mode == "new" and "New worktree" or "Open worktree")
      .. ": this terminal isn't in a Git checkout; choose a project",
    placeholder = "Filter projects", items = items, confirm = "Choose project",
  }
  return id ~= nil and checked(by_id[id], "Unknown project choice") or nil
end
function Workflow:focus(session, window)
  self.destination = { session_id = session, window_id = window }
  self.rex.client.queue("session.select", self.destination)
end
function Workflow:available(tree) return not tree.prunable and tree.present == true end
function Workflow:project_session()
  local sessions = {}
  for _, matches in pairs(self:associations()) do
    for session in pairs(matches) do sessions[session] = true end
  end
  local n, session = count(sessions)
  if n > 1 then
    fail("Several Rex sessions use this project; consolidate its worktree tabs into one session before opening more")
  end
  return session
end
function Workflow:create(tree)
  local session = self:project_session()
  local name = tree.branch ~= "" and tree.branch or "detached-" .. (tree.HEAD or ""):sub(1, 8)
  local window = { window_label = name:sub(1, 128),
    layout = self.rex.layout.block{ flavor = TERMINAL .. ".shell", options = { cwd = tree.path } } }
  if session then
    self:attach(session)
    local created = checked(self.rex.call("session.new_window", {
      session_id = session, window_label = window.window_label, layout = window.layout, focus = false,
    }))
    return session, checked(created.window_id, "Rex did not return the new tab")
  end
  local label = slug(self.rex, basename(self.primary))
  for _, existing in pairs(self:sessions()) do
    if existing == label then label = label:sub(1, 119) .. "-" .. digest(self.rex, self.primary):sub(1, 8); break end
  end
  local created = checked(self.rex.call("session.create", {
    label = label:sub(1, 128), initial_windows = { window },
  }))
  return created.session_id, checked((created.initial_windows or {})[1], "Rex did not return the initial tab").window_id
end
function Workflow:open_path(path)
  self.trees = self:worktrees()
  local tree
  for _, item in ipairs(self.trees) do if item.path == path then tree = item end end
  if not tree or not self:available(tree) then fail("Worktree unavailable; repair it with Git before reopening") end
  local matches = self:associations(true)[path]
  local n, window = count(matches)
  if n > 1 then fail("Several Rex tabs use this checkout; close duplicates before proceeding") end
  local session = window and matches[window]
  if not session then session, window = self:create(tree) end
  self:focus(session, window)
  return session
end
function Workflow:project()
  local choice = self.menu:pick("Projects: open every listed project, or type a path", {
    { "[all projects] open a session for each listed project without one", "all" },
    { "[path] type a Git checkout path to open; it is not added to the list", "path" },
  })
  if choice == "all" then return self:open_projects() end
  return self:open_typed()
end
function Workflow:open_projects()
  -- A project with any open worktree tab is left alone, including legacy sessions.
  local seen, failures = {}, {}
  for _, project in ipairs(self:projects()) do
    local ok, err = pcall(function()
      if not project.present then fail("directory is missing") end
      self:load(self:git(project.path, "rev-parse", "--show-toplevel"))
      if seen[self.primary] then return end
      seen[self.primary] = true
      local open = false
      for _, matches in pairs(self:associations()) do if count(matches) > 0 then open = true end end
      if not open then self:create(self.trees[1]) end
    end)
    if not ok then table.insert(failures, project.path .. ": " .. tostring(err)) end
  end
  if #failures > 0 then fail("Could not open every project session:\n" .. table.concat(failures, "\n")) end
  return self.args.source_session
end
function Workflow:open_typed()
  -- A one-off project: the path is used once and never saved.
  local typed = self.menu:query("Git checkout path, absolute or ~/; not saved; blank cancels", "Open path")
  local path = typed
  if typed == "~" or typed:sub(1, 2) == "~/" then
    path = checked(os.getenv("HOME"), "HOME is not set") .. typed:sub(2)
  end
  if path:sub(1, 1) ~= "/" then fail("Type an absolute or ~/ path: " .. visible(typed)) end
  if not self:is_directory(path) then fail("Directory not found: " .. visible(path)) end
  local ok, top = pcall(self.git, self, path, "rev-parse", "--show-toplevel")
  if not ok then fail("Not a Git checkout: " .. visible(path)) end
  self:load(top)
  return self:open_path(self.checkout)
end
function Workflow:remote_branch(branch)
  -- Only already-fetched, non-symbolic refs count. Match the whole branch name,
  -- not a suffix, and never guess between remotes (including origin).
  local refs = {}
  local raw = self:git(self.primary, "for-each-ref", "--format=%(refname)%09%(symref)", "refs/remotes")
  for row in raw:gmatch("[^\n]+") do
    local ref = row:match("^([^\t]+)\t$")
    if ref then refs[ref] = true end
  end
  local matches = {}
  local remotes = self:git(self.primary, "remote")
  for remote in remotes:gmatch("[^\n]+") do
    local ref = "refs/remotes/" .. remote .. "/" .. branch
    if refs[ref] then table.insert(matches, ref) end
  end
  if #matches > 1 then
    fail("Branch matches several remotes: " .. table.concat(matches, ", ")
      .. ". Create its tracking branch with Git, then use Open (Cmd+Shift+O)")
  end
  return matches[1]
end
function Workflow:worktree_path(branch)
  return parent(self.primary) .. "/" .. slug(self.rex, basename(self.primary)) .. "-" .. slug(self.rex, branch)
end
function Workflow:add_branch(branch, new)
  self:git(self.primary, "check-ref-format", "--branch", branch)
  self:git(self.primary, "check-ref-format", "refs/heads/" .. branch) -- no @{-1} expansion
  self.trees = self:worktrees()
  for _, tree in ipairs(self.trees) do
    if tree.branch == branch then
      if new then fail("Branch already exists; use Open (Cmd+Shift+O)") end
      return self:open_path(tree.path)
    end
  end
  local path = self:worktree_path(branch)
  if self:exists(path) then fail("Directory already exists; will not overwrite it: " .. visible(path)) end
  if new then
    local remote = self:remote_branch(branch)
    if remote then
      self:git(self.primary, "worktree", "add", "--track", "-b", branch, path, remote)
    else
      self:git(self.primary, "show-ref", "--verify", "refs/heads/" .. BASE)
      self:git(self.primary, "worktree", "add", "-b", branch, path, BASE)
    end
  else
    self:git(self.primary, "worktree", "add", path, branch)
  end
  return self:open_path(path) -- failure leaves the branch/checkout for recovery with Open
end
function Workflow:valid_branch(branch)
  return self:try_git(self.primary, "check-ref-format", "--branch", branch) ~= nil
    and self:try_git(self.primary, "check-ref-format", "refs/heads/" .. branch) ~= nil
end
function Workflow:local_branch(branch)
  return self:try_git(self.primary, "show-ref", "--verify", "--quiet", "refs/heads/" .. branch) ~= nil
end
-- New asks for a branch name until it can create one. An invalid name or an
-- occupied directory asks again with the text kept and the reason in the
-- title; an existing branch offers Open. Blank or cancelled does nothing.
function Workflow:new_branch()
  local project = visible(basename(self.primary))
  local question = "New worktree in " .. project
  local typed
  while true do
    local answer = self.ui:input{ title = question, value = typed,
      placeholder = "type/scope/short-description", confirm = "Create worktree" }
    if answer == nil or trim(answer) == "" then return nil end
    typed = answer
    local branch = trim(answer)
    if not self:valid_branch(branch) then
      question = "'" .. visible(branch) .. "' isn't a valid branch name. New worktree in " .. project
    elseif self:local_branch(branch) then
      self.trees = self:worktrees()
      local subtitle = "Create its worktree from the branch as it is"
      for _, tree in ipairs(self.trees) do
        if tree.branch == branch then subtitle = "Focus its worktree tab, or reopen it" end
      end
      local choice = self.ui:pick{ title = "Branch " .. visible(branch) .. " already exists in " .. project,
        items = {
          { id = "open", title = "Open " .. visible(branch), subtitle = subtitle, icon = "branch" },
          { id = "rename", title = "Choose another name", subtitle = "Edit the branch name" },
        }, confirm = "Choose" }
      if choice == nil then return nil end
      if choice == "open" then return self:add_branch(branch) end
      question = "New worktree in " .. project
    elseif self:exists(self:worktree_path(branch)) then
      question = visible(self:worktree_path(branch)) .. " already exists. New worktree in " .. project
    else
      return self:add_branch(branch, true)
    end
  end
end

-- Open's status list -------------------------------------------------------
local OPERATIONS = {
  { "rebase-merge/head-name", "rebase" }, { "rebase-apply/rebasing", "rebase" },
  { "rebase-apply/applying", "am" }, { "MERGE_HEAD", "merge" },
  { "CHERRY_PICK_HEAD", "cherry-pick" }, { "REVERT_HEAD", "revert" }, { "BISECT_LOG", "bisect" },
}
local URGENCY = { blocked = 5, error = 4, done = 3, working = 2, idle = 1 }
local function agent_name(app)
  if type(app) ~= "string" or app == "" then return "Agent" end
  local lower = app:lower()
  if lower:match("^claude") then return "Claude" end
  if lower == "pi" then return "Pi" end
  if lower == "codex" then return "Codex" end
  return visible(app)
end
function Workflow:branches()
  local raw = self:git(self.primary, "for-each-ref",
    "--format=%(refname:strip=2)%00%(committerdate:unix)%00%(upstream)%00%(upstream:track)%00%(subject)",
    "refs/heads")
  local list, by_name = {}, {}
  for row in raw:gmatch("[^\n]+") do
    local name, date, upstream, track, subject = row:match("^([^%z]*)%z([^%z]*)%z([^%z]*)%z([^%z]*)%z(.*)$")
    if name then
      local ref = { name = name, date = tonumber(date), upstream = upstream, gone = track == "[gone]", subject = subject }
      table.insert(list, ref)
      by_name[name] = ref
    end
  end
  return list, by_name
end
-- The ref to compare against: main's upstream, else local main, else nil.
local function base_ref(refs)
  local main = refs[BASE]
  if not main then return nil end
  if main.upstream ~= "" and not main.gone then return main.upstream end
  return "refs/heads/" .. BASE
end
-- The worst program status in the worktree's terminals, and its newest report.
function Workflow:agent(terminals)
  local best, newest
  for _, terminal in ipairs(terminals) do
    self:attach(terminal.session)
    local status = self.rex.block.call(TERMINAL, "program_status",
      { session_id = terminal.session, block_id = terminal.block })
    local records = status and status.records or {}
    for _, record in ipairs(records) do
      local urgency = URGENCY[record.state] or 1
      local stamp = M.epoch(record.updated_at)
      if stamp and stamp > (newest or 0) then newest = stamp end
      if not best or urgency > best.urgency then
        best = { urgency = urgency, state = record.state, name = agent_name(record.effective_app or record.app) }
      end
    end
  end
  return best, newest
end
local function required(result, what)
  if not (result and result.ok) then
    fail(what .. " failed: " .. trim(result and (result.stderr or result.stdout) or "could not run"))
  end
  return result.stdout
end
-- `git status --porcelain=v2 --branch -z` into branch and change facts.
local function read_status(s, raw)
  local renamed, tracked = false, false
  for token in (raw .. "\0"):gmatch("([^%z]*)%z") do
    if renamed then renamed = false -- a rename's original path
    elseif token:sub(1, 2) == "# " then
      local key, value = token:match("^# (%S+) ?(.*)$")
      if key == "branch.upstream" then s.upstream = value
      elseif key == "branch.ab" then
        local ahead, behind = value:match("^%+(%d+) %-(%d+)$")
        s.ahead, s.behind, tracked = tonumber(ahead), tonumber(behind), true
      end
    elseif token ~= "" then
      local kind, xy, path = token:sub(1, 1), nil, nil
      if kind == "1" then xy, path = token:match("^1 (%S%S) %S+ %S+ %S+ %S+ %S+ %S+ (.+)$")
      elseif kind == "2" then xy, path = token:match("^2 (%S%S) %S+ %S+ %S+ %S+ %S+ %S+ %S+ (.+)$"); renamed = true
      elseif kind == "u" then xy, path = token:match("^u (%S%S) %S+ %S+ %S+ %S+ %S+ %S+ %S+ %S+ (.+)$")
        s.unmerged = s.unmerged + 1
      elseif kind == "?" then xy, path = "??", token:sub(3) end
      if path then
        s.changed = s.changed + 1
        if not xy:find("D", 1, true) and #s.paths < 200 then table.insert(s.paths, path) end
      end
    end
  end
  s.gone = s.upstream ~= nil and not tracked -- its upstream branch was deleted
end
-- Newest time printed by stat, or nil when its output isn't all numbers.
local STAT = { { "-f", "%m" }, { "-c", "%Y" } } -- macOS, then GNU
local function newest_time(result)
  local output, latest, numeric = result and result.stdout or "", nil, true
  for value in output:gmatch("[^\n]+") do
    if value:match("^%d+$") then latest = math.max(latest or 0, tonumber(value)) else numeric = false end
  end
  return numeric and latest or nil
end
local function stat_command(set, flavor)
  local argv = { "/usr/bin/stat", flavor[1], flavor[2], "--" }
  for _, path in ipairs(set.paths) do table.insert(argv, path) end
  return { argv, { cwd = set.cwd, timeout = 10 } }
end
-- Local Git and agent facts for every worktree. Reads only: status runs
-- without optional locks, so not even the index is refreshed. Git runs in
-- two parallel rounds rather than once per question.
function Workflow:inspect_all(trees, base, refs, terminals)
  local statuses, commands, slots = {}, {}, {}
  local function queue(owner, key, command)
    table.insert(commands, command); table.insert(slots, { owner = owner, key = key })
  end
  for _, tree in ipairs(trees) do
    local s = { tree = tree, activity = 0, changed = 0, unmerged = 0, paths = {}, out = {},
      label = tree.branch ~= "" and tree.branch or "detached-" .. (tree.HEAD or ""):sub(1, 8) }
    table.insert(statuses, s)
    if self:available(tree) then
      s.present = true
      queue(s, "status", git_command(tree.path, "--no-optional-locks", "status", "--porcelain=v2", "--branch", "-z"))
      queue(s, "gitdir", git_command(tree.path, "rev-parse", "--absolute-git-dir"))
      if base and tree.branch ~= BASE and tree.branch ~= "" then
        queue(s, "counts", git_command(tree.path, "rev-list", "--left-right", "--count", base .. "...HEAD"))
      end
      if not refs[tree.branch] then queue(s, "log", git_command(tree.path, "log", "-1", "--format=%ct%x09%s", "HEAD")) end
    end
  end
  local shared = { out = {} }
  queue(shared, "remotes", git_command(self.primary, "remote"))
  local results = self:exec_all(commands)
  for i, slot in ipairs(slots) do slot.owner.out[slot.key] = results[i] end

  local sets, cherries, fetches = {}, {}, {}
  for _, s in ipairs(statuses) do
    if s.present then
      local tree = s.tree
      read_status(s, required(s.out.status, "git status in " .. visible(tree.path)))
      s.gitdir = line(required(s.out.gitdir, "git rev-parse in " .. visible(tree.path)))
      for _, operation in ipairs(OPERATIONS) do
        if not s.operation and readable(s.gitdir .. "/" .. operation[1]) then s.operation = operation[2] end
      end
      if tree.branch == "" and s.operation then
        -- A rebase or bisect detaches HEAD; name the branch it returns to.
        local head = first_line(s.gitdir .. "/rebase-merge/head-name")
          or first_line(s.gitdir .. "/rebase-apply/head-name") or first_line(s.gitdir .. "/BISECT_START")
        local branch = head and (head:gsub("^refs/heads/", ""))
        if branch and refs[branch] then s.label, s.branch = branch, branch end
      end
      local ref = refs[s.branch or tree.branch]
      if ref then
        s.committed, s.subject = ref.date, ref.subject
      else
        local date, subject = (stdout(s.out.log) or ""):match("^(%d+)\t([^\n]*)")
        s.committed, s.subject = tonumber(date), subject
      end
      local behind, ahead = (stdout(s.out.counts) or ""):match("^(%d+)%s+(%d+)")
      s.base_behind, s.base_ahead = tonumber(behind), tonumber(ahead)
      s.agent, s.reported = self:agent(terminals[tree.path] or {})
      s.moved = reflog_time(s.gitdir .. "/logs/HEAD")
      -- PR merges here rewrite commits: landed means a deleted upstream, or
      -- every commit already in the base by patch (git cherry), not ancestry.
      local mainline = tree.branch == BASE or tree.path == self.primary
      local busy = s.agent and (s.agent.state == "working" or s.agent.state == "blocked")
      if not mainline and base and s.changed == 0 and not s.operation and not busy and s.base_ahead then
        if s.gone then s.landed = true
        elseif s.base_ahead > 0 then table.insert(cherries, s)
        else s.landed = s.upstream ~= nil and (s.ahead or 0) == 0 end
      end
      if #s.paths > 0 then table.insert(sets, { paths = s.paths, cwd = tree.path, owner = s }) end
      if readable(s.gitdir .. "/FETCH_HEAD") then table.insert(fetches, s.gitdir .. "/FETCH_HEAD") end
    end
  end
  local fetch = #fetches > 0 and { paths = fetches } or nil
  if fetch then table.insert(sets, fetch) end

  commands = {}
  local flavor = self.stat_flavor or STAT[1]
  for _, set in ipairs(sets) do table.insert(commands, stat_command(set, flavor)) end
  for _, s in ipairs(cherries) do table.insert(commands, git_command(s.tree.path, "cherry", base, "HEAD")) end
  results = self:exec_all(commands)
  local retry = {}
  for i, set in ipairs(sets) do
    set.newest = newest_time(results[i])
    if set.newest then self.stat_flavor = flavor elseif not self.stat_flavor then table.insert(retry, set) end
  end
  if #retry > 0 then
    commands = {}
    for _, set in ipairs(retry) do table.insert(commands, stat_command(set, STAT[2])) end
    local again = self:exec_all(commands)
    for i, set in ipairs(retry) do
      set.newest = newest_time(again[i])
      if set.newest then self.stat_flavor = STAT[2] end
    end
  end
  for i, s in ipairs(cherries) do
    s.landed = not (stdout(results[#sets + i]) or "+"):find("+", 1, true)
  end
  for _, set in ipairs(sets) do if set.owner then set.owner.edited = set.newest end end
  for _, s in ipairs(statuses) do
    s.activity = math.max(s.moved or 0, s.committed or 0, s.reported or 0, s.edited or 0)
  end
  return statuses, stdout(shared.out.remotes) or "", fetch and fetch.newest
end
-- Facts for one row, most urgent first; the first is the next step.
function M.signals(s)
  if not s.present then return { s.tree.prunable and "missing directory" or "unavailable" } end
  local out, agent = {}, s.agent
  local function add(text) table.insert(out, text) end
  if s.operation then add("finish " .. s.operation) end
  if agent and agent.state == "blocked" then add(agent.name .. " waiting") end
  if agent and agent.state == "error" then add(agent.name .. " failed") end
  if s.upstream and not s.gone and (s.ahead or 0) > 0 then add("push " .. s.ahead)
  elseif s.tree.branch ~= BASE and not s.upstream and not s.landed and (s.base_ahead or 0) > 0 then
    add("push " .. s.base_ahead) -- never published
  end
  if s.changed > 0 then add(s.changed .. " changed") end
  if agent and agent.state == "done" then add(agent.name .. " done") end
  if s.landed then add("ready to close")
  elseif (s.base_behind or 0) > 0 then add("rebase " .. s.base_behind) end
  if agent and agent.state == "working" then add(agent.name .. " working") end
  if s.tree.locked then add("locked") end
  return out
end
-- "origin fetched 3 hours ago", from the newest FETCH_HEAD of any worktree.
local function fetched(remotes, newest, now)
  local names = {}
  for name in remotes:gmatch("[^\n]+") do table.insert(names, name) end
  if #names == 0 then return nil end
  if #names == 1 then
    local who = visible(names[1])
    return newest and (who .. " fetched " .. ago(now, newest)) or ("no " .. who .. " fetch recorded")
  end
  return newest and ("last fetched " .. ago(now, newest)) or "no fetch recorded"
end
-- Rows for Open: worktrees by newest activity, then local branches without one.
-- self.trees was just loaded by Workflow.new.
function Workflow:status_rows(now)
  local paths = {}
  for _, tree in ipairs(self.trees) do table.insert(paths, tree.path) end
  self.scan = self:terminals()
  local tabs = self:associate(paths, true)
  local terminals = {}
  for _, terminal in ipairs(self.scan) do
    terminals[terminal.root] = terminals[terminal.root] or {}
    table.insert(terminals[terminal.root], terminal)
  end
  self.scan = nil
  local list, refs = self:branches()
  local statuses, remotes, fetch_time = self:inspect_all(self.trees, base_ref(refs), refs, terminals)
  local checked_out = {}
  for _, s in ipairs(statuses) do
    checked_out[s.tree.branch] = true
    if s.branch then checked_out[s.branch] = true end
    s.open = count(tabs[s.tree.path]) > 0
  end
  table.sort(statuses, function(a, b)
    if a.activity ~= b.activity then return a.activity > b.activity end
    return a.label < b.label
  end)
  local items, targets = {}, {}
  for _, s in ipairs(statuses) do
    local id = "worktree:" .. s.tree.path
    local signals = M.signals(s)
    targets[id] = { path = s.tree.path }
    table.insert(items, {
      id = id, title = visible(s.label), icon = s.open and "terminal" or "folder",
      subtitle = s.present and (ago(now, s.activity) .. (s.subject and (" · " .. visible(s.subject)) or ""))
        or visible(s.tree.path),
      detail = signals[1] and table.concat(signals, " · ", 1, math.min(2, #signals)) or nil,
    })
  end
  local branches = {}
  for _, ref in ipairs(list) do if not checked_out[ref.name] then table.insert(branches, ref) end end
  table.sort(branches, function(a, b)
    if (a.date or 0) ~= (b.date or 0) then return (a.date or 0) > (b.date or 0) end
    return a.name < b.name
  end)
  for _, ref in ipairs(branches) do
    if #items >= 2000 then break end
    local id = "branch:" .. ref.name
    targets[id] = { branch = ref.name }
    table.insert(items, { id = id, title = visible(ref.name), icon = "branch",
      subtitle = ago(now, ref.date) .. (ref.subject ~= "" and (" · " .. visible(ref.subject)) or ""),
      detail = ref.gone and "no worktree · upstream gone" or "no worktree" })
  end
  local title = visible(basename(self.primary)) .. " worktrees"
  local fetch = fetched(remotes, fetch_time, now)
  if fetch then title = title .. " · " .. fetch end
  return items, targets, title
end
-- Enter focuses the worktree's tab, reopens a closed worktree with one shell,
-- or creates the worktree for a branch. Cancel does nothing.
function Workflow:open()
  local items, targets, title = self:status_rows(os.time())
  local choice = self.ui:pick{ title = title, items = items,
    placeholder = "Filter worktrees and branches", confirm = "Open" }
  if choice == nil then return nil end
  local target = checked(targets[choice], "Unknown worktree choice")
  if target.path then return self:open_path(target.path) end
  return self:add_branch(target.branch)
end
function Workflow:clean_target()
  self.trees = self:worktrees()
  local target
  for _, tree in ipairs(self.trees) do if tree.path == self.checkout then target = tree end end
  if not target or self.checkout == self.primary then fail("Never delete the primary checkout or an unregistered directory") end
  if target.locked or target.prunable then fail("Worktree is locked or unavailable; no tabs were closed") end
  if self:git(self.checkout, "status", "--porcelain=v1", "--untracked-files=all", "--ignore-submodules=none") ~= "" then
    fail("Worktree has modified, staged, or untracked files; nothing will be force-removed")
  end
  local index = self:git(self.checkout, "ls-files", "--stage")
  for entry in index:gmatch("[^\n]+") do
    if entry:match("^160000 ") then fail("Worktrees with submodules must be removed manually") end
  end
  return target
end
function Workflow:validate_source()
  local session = self.args.source_session
  if self.helper == session then fail("Deletion requires a separate menu session") end
  local windows = self:windows(session)
  local source
  for _, window in ipairs(windows) do
    if window.blocks[self.args.source_block] then source = window end
  end
  if not source then fail("Source tab missing") end
  local matches = self:associations(true)[self.checkout]
  local n, id = count(matches)
  if n ~= 1 or id ~= source.id or matches[id] ~= session then
    fail("Source tab missing or checkout has multiple tabs")
  end
  -- Re-read only the source tab strictly; unrelated tabs cannot block deletion.
  local directories = {}
  self:attach(session)
  local view = checked(self.rex.session.view{ session_id = session })
  for _, window in ipairs(view.windows or {}) do
    if window.window_id == source.id then
      for _, layer in ipairs(window.layers or {}) do
        for _, block in ipairs(layer.blocks or {}) do
          if block.host_id ~= self.host or block.creator_name ~= TERMINAL then
            fail("Source tab has unknown, remote, or unrelated blocks")
          end
          local process = self:process(session, block.block_id)
          table.insert(directories, (process.foreground or {}).cwd or (process.child or {}).cwd or false)
        end
      end
    end
  end
  if #directories == 0 then fail("Source tab has unknown terminal directories") end
  for _, directory in ipairs(directories) do
    if not directory or not inside(self:physical(directory), self.checkout) then
      fail("Source tab has unknown, remote, or unrelated terminal directories")
    end
    if self:physical(line(self:git(directory, "rev-parse", "--show-toplevel"))) ~= self.checkout then
      fail("Source tab has a terminal in another nested repository")
    end
  end
  return source.id, #windows
end
function Workflow:delete()
  local target = self:clean_target()
  local window = self:validate_source()
  local yes = self.menu:pick("DELETE " .. visible(target.branch ~= "" and target.branch or "detached") .. " at " .. visible(self.checkout) .. "? Branch is kept.", {
    { "Cancel", false }, { "Remove worktree and STOP ALL programs in its Rex tab only", true },
  })
  if not yes then fail(CANCEL) end
  self:clean_target()
  local process = self:process(self.args.source_session, self.args.source_block)
  local directory = (process.foreground or {}).cwd or (process.child or {}).cwd
  if not directory or not inside(self:physical(directory), self.checkout) then fail("Source terminal changed directory; deletion cancelled") end
  local current, total = self:validate_source()
  if current ~= window then fail("Source tab changed; deletion cancelled") end
  -- Preserve a discoverable project session when removing its last worktree tab.
  if total == 1 then
    local primary = self.trees[1]
    if not self:available(primary) then fail("Primary checkout unavailable; no tabs were closed") end
    self:create(primary)
  end
  checked(self.rex.call("session.close_window", { session_id = self.args.source_session, window_id = window }))
  for _, remaining in ipairs(self:windows(self.args.source_session)) do
    if remaining.id == window then fail("Rex tab is still running; checkout was not removed") end
  end
  -- Git rechecks cleanliness and locks after the tab's programs stop.
  self:git(self.primary, "worktree", "remove", self.checkout)
  return self.args.source_session
end
M.Workflow = Workflow
M.cancelled = CANCEL

-- New and Open, run inside init.lua's own actions. Nothing here may wrap a
-- prompt in pcall, so cancelling returns instead of raising.
function M.action(mode, args, r)
  if mode ~= "new" and mode ~= "open" then fail("Invalid worktree action") end
  for _, name in ipairs({ "source_session", "source_block", "directory" }) do
    if type(args[name]) ~= "string" or args[name] == "" then
      fail("Run this action from a terminal in the local Rex app")
    end
  end
  local request = { mode = mode }
  for key, value in pairs(args) do request[key] = value end
  local workflow = Workflow.new(request, r, nil, Palette.new(r))
  if not workflow then return nil end
  if mode == "new" then workflow:new_branch() else workflow:open() end
  return nil
end

-- Delete and Projects, run by `rex do` in their temporary menu session.
function M.main(args, r, terminal)
  terminal = terminal or io
  -- The project picker needs no terminal directory; deletion acts on one.
  local required = args.mode == "project" and { "source_session" } or { "source_session", "source_block", "directory" }
  for _, name in ipairs(required) do
    if type(args[name]) ~= "string" or args[name] == "" then fail("Launch using the Rex worktree keybindings") end
  end
  if not r.session_id or r.session_id == args.source_session then fail("Launch using the Rex worktree keybindings") end
  local modes = { delete = true, project = true }
  if not modes[args.mode] then fail("Invalid worktree action") end
  if args.mode == "project" and type(args.projects) ~= "table" then fail("Launch using the Rex worktree keybindings") end
  local is_menu = false
  for _, session in ipairs(checked(r.call("session.list")).sessions or {}) do
    if session.session_id == r.session_id and session.label == "rex-worktrees-" .. args.mode then is_menu = true end
  end
  if not is_menu then fail("Only invoke this helper in its temporary menu session") end
  local menu, destination, workflow = Menu.new(r), args.source_session, nil
  local ok, err = pcall(function()
    workflow = Workflow.new(args, r, menu)
    destination = workflow[args.mode](workflow)
  end)
  if not ok and tostring(err) ~= CANCEL then
    -- Do not depend on fzf to display its own launch/render errors. Preserve
    -- newlines, remove terminal controls, and keep this terminal until Enter.
    local message = tostring(err):gsub("[%z\1-\8\11-\31\127]", "?")
    terminal.write("\nWorktree action stopped:\n" .. message .. "\n\n")
    terminal.write("If Git refused removal after closing the source tab, its checkout remains; use Open to reopen it.\n")
    terminal.write("Press Enter to close this menu.")
    terminal.flush()
    terminal.read("*l")
  end
  local function destroy_helper()
    -- As above, even destruction needs this RPC stream attached to its target.
    checked(r.session.attach{ session_id = r.session_id })
    checked(r.call("session.destroy", { session_id = r.session_id }))
  end
  -- Do not let a selection failure strand the menu; closing our own session is last.
  pcall(function()
    local live = checked(r.call("session.list")).sessions or {}
    for _, session in ipairs(live) do
      if session.session_id == destination then
        local target = ok and workflow and workflow.destination or nil
        r.client.queue("session.select", target or { session_id = destination })
        break
      end
    end
  end)
  destroy_helper()
end

if rex.args and rex.args.mode then M.main(rex.args, rex) end
return M
