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
function Menu:branch()
  local output = self:run("New branch from local main; blank cancels", { "Create branch" },
    { "--disabled", "--print-query" })
  local branch = trim(output:match("^([^%z]*)") or "")
  if branch == "" then fail(CANCEL) end
  return branch
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
  self.checkout = self:physical(line(self:git(args.directory, "rev-parse", "--show-toplevel")))
  self.trees = self:worktrees()
  if not self.trees[1] or self.trees[1].bare then fail("A non-bare primary checkout is required") end
  self.primary = self.trees[1].path
  local registered = false
  for _, tree in ipairs(self.trees) do if tree.path == self.checkout then registered = true end end
  if not registered then fail("Current directory is not a registered worktree") end
  self.host = checked(r.call("server.status")).host_id
  self.helper = r.session_id
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
function Workflow:associations()
  local live, matches, roots = self:sessions(), {}, {}
  for _, tree in ipairs(self.trees) do matches[tree.path] = {}; table.insert(roots, tree.path) end
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
function Workflow:focus(session) self.rex.client.queue("session.select", { session_id = session }) end
function Workflow:destroy(session)
  self:attach(session)
  checked(self.rex.call("session.destroy", { session_id = session }))
end
function Workflow:open_path(path)
  self.trees = self:worktrees()
  local tree
  for _, item in ipairs(self.trees) do if item.path == path then tree = item end end
  if not tree or tree.prunable or not self:is_directory(path) then fail("Worktree unavailable; repair it with Git before reopening") end
  local n, session = count(self:associations()[path])
  if n > 1 then fail("Several Rex sessions use this checkout; close duplicates before proceeding") end
  if not session then
    local name = tree.branch ~= "" and tree.branch or "detached-" .. tree.HEAD:sub(1, 8)
    local label = slug(self.rex, basename(self.primary)) .. "-" .. slug(self.rex, name)
    for _, existing in pairs(self:sessions()) do
      if existing == label then label = label:sub(1, 119) .. "-" .. digest(self.rex, path):sub(1, 8); break end
    end
    session = checked(self.rex.call("session.create", {
      label = label:sub(1, 128),
      initial_windows = {{ layout = self.rex.layout.block{ flavor = TERMINAL .. ".shell", options = { cwd = path } } }},
    })).session_id
  end
  self:focus(session)
  return session
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
  local matches, choices, checked_out = self:associations(), {}, {}
  for _, tree in ipairs(self.trees) do
    local branch = tree.branch ~= "" and tree.branch or "detached-" .. (tree.HEAD or ""):sub(1, 8)
    checked_out[tree.branch] = true
    local status = count(matches[tree.path]) > 0 and "session open" or "session closed"
    if tree.locked or tree.prunable then status = status .. "; locked/unavailable" end
    table.insert(choices, { "[worktree; " .. status .. "] " .. branch .. "  " .. tree.path, { path = tree.path } })
  end
  local branches = self:git(self.primary, "for-each-ref", "--format=%(refname:strip=2)", "refs/heads")
  for branch in branches:gmatch("[^\n]+") do
    if not checked_out[branch] then table.insert(choices, { "[branch only; create worktree] " .. branch, { branch = branch } }) end
  end
  local choice = self.menu:pick(basename(self.primary) .. ": worktrees and local branches", choices)
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
  for _, name in ipairs({ "source_session", "source_block", "directory" }) do
    if type(args[name]) ~= "string" or args[name] == "" then fail("Launch using the Rex worktree keybindings") end
  end
  if not r.session_id or r.session_id == args.source_session then fail("Launch using the Rex worktree keybindings") end
  if args.mode ~= "new" and args.mode ~= "open" and args.mode ~= "delete" then fail("Invalid worktree action") end
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
