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
function Menu:branch() return self:query("New branch from local main; blank cancels", "Create branch") end
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
function Workflow:directories(session, strict)
  self:attach(session)
  local view = checked(self.rex.session.view{ session_id = session })
  local directories = {}
  for _, window in ipairs(view.windows or {}) do
    for _, layer in ipairs(window.layers or {}) do
      for _, block in ipairs(layer.blocks or {}) do
        if block.host_id ~= self.host then
          table.insert(directories, false)
        elseif block.creator_name == TERMINAL then
          local ok, process = pcall(self.process, self, session, block.block_id)
          if not ok and strict then error(process, 0) end
          table.insert(directories, ok and ((process.foreground or {}).cwd or (process.child or {}).cwd) or false)
        end
      end
    end
  end
  return directories
end
function Workflow:associate(paths)
  local live, matches, roots = self:sessions(), {}, {}
  for _, path in ipairs(paths) do matches[path] = {}; table.insert(roots, path) end
  table.sort(roots, function(a, b) return #a > #b end)
  for session in pairs(live) do
    if session ~= self.helper then
      -- Discovery is best-effort: a vanished session or inaccessible terminal
      -- must not prevent New/Open elsewhere. Deletion validates its source strictly.
      local readable, directories = pcall(self.directories, self, session)
      for _, directory in ipairs(readable and directories or {}) do
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
          if ok and root then matches[root][session] = true end
        end
      end
    end
  end
  return matches
end
function Workflow:associations()
  local paths = {}
  for _, tree in ipairs(self.trees) do table.insert(paths, tree.path) end
  return self:associate(paths)
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
  local projects, paths = self:projects(), {}
  for i, project in ipairs(projects) do paths[i] = project.path end
  -- Open projects first, then closed ones; the source session's own project last.
  local matches, groups = self:associate(paths), { {}, {}, {} }
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
function Workflow:focus(session) self.rex.client.queue("session.select", { session_id = session }) end
function Workflow:destroy(session)
  self:attach(session)
  checked(self.rex.call("session.destroy", { session_id = session }))
end
function Workflow:available(tree) return not tree.prunable and self:is_directory(tree.path) end
function Workflow:create(tree)
  -- The primary checkout's session is named after the project, e.g. `dev`.
  local label = slug(self.rex, basename(self.primary))
  if tree.path ~= self.primary then
    local name = tree.branch ~= "" and tree.branch or "detached-" .. tree.HEAD:sub(1, 8)
    label = label .. "-" .. slug(self.rex, name)
  end
  for _, existing in pairs(self:sessions()) do
    if existing == label then label = label:sub(1, 119) .. "-" .. digest(self.rex, tree.path):sub(1, 8); break end
  end
  return checked(self.rex.call("session.create", {
    label = label:sub(1, 128),
    initial_windows = {{ layout = self.rex.layout.block{ flavor = TERMINAL .. ".shell", options = { cwd = tree.path } } }},
  })).session_id
end
function Workflow:open_path(path)
  self.trees = self:worktrees()
  local tree
  for _, item in ipairs(self.trees) do if item.path == path then tree = item end end
  if not tree or not self:available(tree) then fail("Worktree unavailable; repair it with Git before reopening") end
  local n, session = count(self:associations()[path])
  if n > 1 then fail("Several Rex sessions use this checkout; close duplicates before proceeding") end
  session = session or self:create(tree)
  self:focus(session)
  return session
end
function Workflow:open_all()
  -- Git's worktree list is the remembered set of spaces; create only missing sessions.
  self.trees = self:worktrees()
  local matches, failures, destination = self:associations(), {}
  for _, tree in ipairs(self.trees) do
    local n, session = count(matches[tree.path])
    if n == 0 and self:available(tree) then
      local ok, result = pcall(self.create, self, tree)
      if ok then session = result else table.insert(failures, tree.path .. ": " .. tostring(result)) end
    end
    -- The primary is listed first, so its session is focused when it has one.
    if n <= 1 and session and not destination then destination = session end
  end
  if #failures > 0 then fail("Could not open every worktree session:\n" .. table.concat(failures, "\n")) end
  if destination then self:focus(destination) end
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
  -- A project with any open session is left alone; focus returns to the source.
  local checkouts, seen, failures = {}, {}, {}
  for _, project in ipairs(self:projects()) do
    local ok, result = pcall(function()
      if not project.present then fail("directory is missing") end
      return self:physical(line(self:git(project.path, "rev-parse", "--show-toplevel")))
    end)
    if not ok then table.insert(failures, project.path .. ": " .. tostring(result))
    elseif not seen[result] then seen[result] = true; table.insert(checkouts, result) end
  end
  local matches = self:associate(checkouts)
  for _, checkout in ipairs(checkouts) do
    if count(matches[checkout]) == 0 then
      local ok, err = pcall(function()
        self:load(checkout)
        for _, tree in ipairs(self.trees) do if tree.path == self.checkout then self:create(tree) end end
      end)
      if not ok then table.insert(failures, checkout .. ": " .. tostring(err)) end
    end
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
    self:git(self.primary, "show-ref", "--verify", "refs/heads/main")
    self:git(self.primary, "worktree", "add", "-b", branch, path, "main")
  else
    self:git(self.primary, "worktree", "add", path, branch)
  end
  return self:open_path(path) -- failure leaves the branch/checkout for recovery with Open
end
function Workflow:new_branch() return self:add_branch(self.menu:branch(), true) end
function Workflow:open()
  local matches, choices, checked_out, closed = self:associations(), {}, {}, 0
  for _, tree in ipairs(self.trees) do
    local branch = tree.branch ~= "" and tree.branch or "detached-" .. (tree.HEAD or ""):sub(1, 8)
    checked_out[tree.branch] = true
    local status = count(matches[tree.path]) > 0 and "session open" or "session closed"
    if status == "session closed" and self:available(tree) then closed = closed + 1 end
    if tree.locked or tree.prunable then status = status .. "; locked/unavailable" end
    table.insert(choices, { "[worktree; " .. status .. "] " .. branch .. "  " .. tree.path, { path = tree.path } })
  end
  if closed > 1 then
    table.insert(choices, { "[all worktrees] open " .. closed .. " closed sessions", { all = true } })
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
  if target.locked or target.prunable then fail("Worktree is locked or unavailable; no sessions were closed") end
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
  if self.helper == self.args.source_session then fail("Deletion requires a separate menu session") end
  local n, session = count(self:associations()[self.checkout])
  if n ~= 1 or session ~= self.args.source_session then fail("Source session missing or checkout has multiple sessions") end
  local directories = self:directories(session, true)
  if #directories == 0 then fail("Source session has unknown terminal directories") end
  for _, directory in ipairs(directories) do
    if not directory or not inside(self:physical(directory), self.checkout) then
      fail("Source session has unknown, remote, or unrelated terminal directories")
    end
    if self:physical(line(self:git(directory, "rev-parse", "--show-toplevel"))) ~= self.checkout then
      fail("Source session has a terminal in another nested repository")
    end
  end
end
function Workflow:delete()
  local target = self:clean_target()
  self:validate_source()
  local yes = self.menu:pick("DELETE " .. visible(target.branch ~= "" and target.branch or "detached") .. " at " .. visible(self.checkout) .. "? Branch is kept.", {
    { "Cancel", false }, { "Remove worktree and STOP ALL programs in its Rex session", true },
  })
  if not yes then fail(CANCEL) end
  self:clean_target()
  local process = self:process(self.args.source_session, self.args.source_block)
  local directory = (process.foreground or {}).cwd or (process.child or {}).cwd
  if not directory or not inside(self:physical(directory), self.checkout) then fail("Source terminal changed directory; deletion cancelled") end
  self:validate_source()
  self:destroy(self.args.source_session)
  if self:sessions()[self.args.source_session] then fail("Rex session is still running; checkout was not removed") end
  -- Git's non-force removal rechecks cleanliness/locks after programs stop.
  -- Keep the earlier explicit submodule checks: Git allows uninitialized gitlinks.
  self:git(self.primary, "worktree", "remove", self.checkout)
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
  local menu, destination = Menu.new(r), args.source_session
  local ok, err = pcall(function()
    local workflow = Workflow.new(args, r, menu)
    if args.mode == "new" then destination = workflow:new_branch()
    else destination = workflow[args.mode](workflow) end
  end)
  if not ok and tostring(err) ~= CANCEL then
    -- Do not depend on fzf to display its own launch/render errors. Preserve
    -- newlines, remove terminal controls, and keep this terminal until Enter.
    local message = tostring(err):gsub("[%z\1-\8\11-\31\127]", "?")
    terminal.write("\nWorktree action stopped:\n" .. message .. "\n\n")
    terminal.write("If Git refused removal after closing the source session, its checkout remains; use Open to reopen it.\n")
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
      if session.session_id == destination then r.client.queue("session.select", { session_id = destination }); break end
    end
  end)
  destroy_helper()
end

if rex.args and rex.args.mode then M.main(rex.args, rex) end
return M
