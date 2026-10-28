-- Run locally with `rex do worktrees.lua --args <json>` in the menu terminal.
-- Loading this file without args.mode only returns its testable module.
local M = {}
local CANCEL = "worktree action cancelled"
local TERMINAL = "com.superlogical.terminal"
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
function Menu:branch() return self:query("Track matching remote branch, otherwise local main; no fetch; blank cancels", "Create branch") end
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

local Workflow = {}
Workflow.__index = Workflow
function Workflow:git(directory, ...)
  local argv = { "git", "-C", directory }
  for _, arg in ipairs({...}) do table.insert(argv, arg) end
  return execute(self.rex, argv, { timeout = 120, env = {
    GIT_DIR = false, GIT_WORK_TREE = false, GIT_COMMON_DIR = false, GIT_INDEX_FILE = false,
  } })
end
function Workflow:physical(path)
  return line(execute(self.rex, { "/bin/pwd", "-P" }, { cwd = path, timeout = 10 }))
end
function Workflow:is_directory(path) return checked(self.rex.exec({ "/bin/test", "-d", path })).ok end
function Workflow:exists(path)
  return checked(self.rex.exec({ "/bin/test", "-e", path })).ok
    or checked(self.rex.exec({ "/bin/test", "-L", path })).ok
end
function Workflow:worktrees()
  local records, record = {}, {}
  -- Separate Rex's yielding subprocess call from the iterator expression.
  local raw = self:git(self.checkout, "worktree", "list", "--porcelain", "-z")
  for token in (raw .. "\0"):gmatch("([^%z]*)%z") do
    if token == "" then
      if record.worktree then
        record.path = self:is_directory(record.worktree) and self:physical(record.worktree) or record.worktree
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
function Workflow.new(args, r, menu)
  local self = setmetatable({ args = args, rex = r, menu = menu or Menu.new(r), attached = {} }, Workflow)
  self.host = checked(r.call("server.status")).host_id
  self.helper = r.session_id
  -- The project menu chooses its checkouts after the user picks an action.
  if args.mode == "project" then return self end
  local ok, top = pcall(self.git, self, args.directory, "rev-parse", "--show-toplevel")
  if not ok then
    -- Deletion only ever targets the source terminal's own checkout.
    if not args.projects or args.mode == "delete" then error(top, 0) end
    local project = self:pick_project("Projects: this terminal is not in a Git checkout")
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
  -- API revision 7 rejects view/block/destroy requests on an unattached RPC
  -- stream with 409 "stream is not attached to session" (verified live).
  -- Attach scopes this connection; it does not select or restore the UI session.
  if not self.attached[session] then
    checked(self.rex.session.attach{ session_id = session })
    self.attached[session] = true
  end
end
function Workflow:sessions()
  local live = {}
  for _, session in ipairs(checked(self.rex.call("session.list")).sessions or {}) do
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
    local item = { id = window.window_id, directories = {}, blocks = {} }
    for _, layer in ipairs(window.layers or {}) do
      for _, block in ipairs(layer.blocks or {}) do
        item.blocks[block.block_id] = true
        if block.host_id ~= self.host or block.creator_name ~= TERMINAL then
          table.insert(item.directories, false)
        else
          local ok, process = pcall(self.process, self, session, block.block_id)
          table.insert(item.directories, ok and ((process.foreground or {}).cwd or (process.child or {}).cwd) or false)
        end
      end
    end
    table.insert(windows, item)
  end
  return windows
end
function Workflow:associate(paths, tabs)
  local live, matches, roots = self:sessions(), {}, {}
  for _, path in ipairs(paths) do matches[path] = {}; table.insert(roots, path) end
  table.sort(roots, function(a, b) return #a > #b end)
  for session in pairs(live) do
    if session ~= self.helper then
      -- Discovery is best-effort; deletion rechecks the source tab strictly.
      local readable, windows = pcall(self.windows, self, session)
      for _, window in ipairs(readable and windows or {}) do
        for _, directory in ipairs(window.directories) do
          if directory then
            local ok, root = pcall(function()
              local physical = self:physical(directory)
              for _, candidate in ipairs(roots) do
                if inside(physical, candidate) then
                  local actual = self:physical(line(self:git(physical, "rev-parse", "--show-toplevel")))
                  return actual == candidate and candidate or nil
                end
              end
            end)
            if ok and root then matches[root][tabs and window.id or session] = session end
          end
        end
      end
    end
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
  local found, seen = {}, {}
  for _, path in ipairs(self.args.projects or {}) do
    if type(path) ~= "string" or path:sub(1, 1) ~= "/" then fail("Project paths must be absolute: " .. visible(path)) end
    local present = self:is_directory(path)
    local resolved = present and self:physical(path) or path
    if not seen[resolved] then
      seen[resolved] = true
      table.insert(found, { path = resolved, name = basename(path) .. "  " .. path, present = present })
    end
  end
  if #found == 0 then fail("No projects configured; list them in the projects table in init.lua") end
  return found
end
function Workflow:pick_project(title)
  local projects, matches = self:projects(), {}
  for _, project in ipairs(projects) do
    matches[project.path] = {}
    if project.present then
      pcall(function()
        self:load(self:git(project.path, "rev-parse", "--show-toplevel"))
        for _, sessions in pairs(self:associations()) do
          for session in pairs(sessions) do matches[project.path][session] = true end
        end
      end)
    end
  end
  -- Include worktree-only sessions; labels are never project identity.
  local groups = { {}, {}, {} }
  for _, project in ipairs(projects) do
    local sessions, group, status = matches[project.path], 2, "session closed"
    if not project.present then status = "missing"
    elseif sessions[self.args.source_session] then group, status = 3, "current session"
    elseif count(sessions) > 0 then group, status = 1, "session open" end
    table.insert(groups[group], { "[" .. status .. "] " .. project.name, project })
  end
  local choices = {}
  for _, group in ipairs(groups) do
    for _, choice in ipairs(group) do table.insert(choices, choice) end
  end
  return self.menu:pick(title, choices)
end
function Workflow:focus(session, window)
  self.destination = { session_id = session, window_id = window }
  self.rex.client.queue("session.select", self.destination)
end
function Workflow:available(tree) return not tree.prunable and self:is_directory(tree.path) end
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
function Workflow:open_all()
  -- Git remembers the worktrees; Rex holds their tabs. Never restore programs.
  self.trees = self:worktrees()
  local failures, destination, target = {}
  for _, tree in ipairs(self.trees) do
    if self:available(tree) then
      local matches = self:associations(true)[tree.path]
      local n, window = count(matches)
      local session = window and matches[window]
      if n == 0 then
        local ok, result, created = pcall(self.create, self, tree)
        if ok then session, window = result, created
        else table.insert(failures, tree.path .. ": " .. tostring(result)) end
      elseif n > 1 then
        table.insert(failures, tree.path .. ": several Rex tabs use this checkout")
      end
      -- Primary comes first and remains the destination even as tabs are added.
      if n <= 1 and session and not destination then destination, target = session, window end
    end
  end
  if #failures > 0 then fail("Could not open every worktree tab:\n" .. table.concat(failures, "\n")) end
  if destination then self:focus(destination, target) end
  return destination
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
  local path = parent(self.primary) .. "/" .. slug(self.rex, basename(self.primary)) .. "-" .. slug(self.rex, branch)
  if self:exists(path) then fail("Directory already exists; will not overwrite it: " .. visible(path)) end
  if new then
    local remote = self:remote_branch(branch)
    if remote then
      self:git(self.primary, "worktree", "add", "--track", "-b", branch, path, remote)
    else
      self:git(self.primary, "show-ref", "--verify", "refs/heads/main")
      self:git(self.primary, "worktree", "add", "-b", branch, path, "main")
    end
  else
    self:git(self.primary, "worktree", "add", path, branch)
  end
  return self:open_path(path) -- failure leaves the branch/checkout for recovery with Open
end
function Workflow:new_branch() return self:add_branch(self.menu:branch(), true) end
function Workflow:open()
  local matches, choices, checked_out, closed = self:associations(true), {}, {}, 0
  for _, tree in ipairs(self.trees) do
    local branch = tree.branch ~= "" and tree.branch or "detached-" .. (tree.HEAD or ""):sub(1, 8)
    checked_out[tree.branch] = true
    local status = count(matches[tree.path]) > 0 and "tab open" or "tab closed"
    if status == "tab closed" and self:available(tree) then closed = closed + 1 end
    if tree.locked or tree.prunable then status = status .. "; locked/unavailable" end
    table.insert(choices, { "[worktree; " .. status .. "] " .. branch .. "  " .. tree.path, { path = tree.path } })
  end
  if closed > 1 then
    table.insert(choices, { "[all worktrees] open " .. closed .. " closed tabs", { all = true } })
  end
  local branches = self:git(self.primary, "for-each-ref", "--format=%(refname:strip=2)", "refs/heads")
  for branch in branches:gmatch("[^\n]+") do
    if not checked_out[branch] then table.insert(choices, { "[branch only; create worktree] " .. branch, { branch = branch } }) end
  end
  local choice = self.menu:pick(basename(self.primary) .. ": worktrees and local branches", choices)
  if choice.all then return self:open_all() end
  if choice.path then return self:open_path(choice.path) end
  return self:add_branch(choice.branch)
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

function M.main(args, r, terminal)
  terminal = terminal or io
  -- The project picker needs no terminal directory; the others act on one.
  local required = args.mode == "project" and { "source_session" } or { "source_session", "source_block", "directory" }
  for _, name in ipairs(required) do
    if type(args[name]) ~= "string" or args[name] == "" then fail("Launch using the Rex worktree keybindings") end
  end
  if not r.session_id or r.session_id == args.source_session then fail("Launch using the Rex worktree keybindings") end
  local modes = { new = true, open = true, delete = true, project = true }
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
    if args.mode == "new" then destination = workflow:new_branch()
    else destination = workflow[args.mode](workflow) end
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
