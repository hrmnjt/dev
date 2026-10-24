-- Worktree and project actions only.
-- Appearance preferences remain manual: rex/README.md.

-- Projects for Cmd+Shift+K, and for New/Open outside a Git checkout. List
-- primary checkouts in the order you want them; `~/` is your home directory.
local projects = {
  "~/code/github.com/hrmnjt/dev",
}

local function checked(value, err)
  if not value then error(err or "Rex returned no result", 0) end
  return value
end

local function terminal_directory(ctx)
  if not ctx.block_id then error("Run this action from a terminal in the local Rex app", 0) end
  local status = checked(rex.call("server.status"))
  local view = checked(rex.session.view{ session_id = ctx.session_id })
  local local_terminal = false
  for _, window in ipairs(view.windows or {}) do
    for _, layer in ipairs(window.layers or {}) do
      for _, block in ipairs(layer.blocks or {}) do
        if block.block_id == ctx.block_id then
          local_terminal = block.host_id == status.host_id
            and block.creator_name == "com.superlogical.terminal"
        end
      end
    end
  end
  if not local_terminal then error("Worktree actions require a local terminal block", 0) end
  local process = checked(rex.block.call("com.superlogical.terminal", "process", {
    session_id = ctx.session_id, block_id = ctx.block_id,
  }))
  local directory = (process.foreground or {}).cwd or (process.child or {}).cwd
  if not directory or directory:sub(1, 1) ~= "/" then
    error("Cannot determine this terminal's directory; try from a shell prompt", 0)
  end
  return directory
end

local function worktree_menu(mode, ctx)
  if not ctx.session_id or not ctx.client_id then
    error("Run this action from a terminal in the local Rex app", 0)
  end
  -- The project picker works from any pane; the worktree actions need its directory.
  local directory = mode ~= "project" and terminal_directory(ctx) or nil
  local home = assert(os.getenv("HOME"), "HOME is not set")
  local config = os.getenv("XDG_CONFIG_HOME") or (home .. "/.config")
  local helper = config .. "/rex/worktrees.lua"
  local file = io.open(helper, "r")
  if not file then error("Deploy rex/worktrees.lua with just stowall first", 0) end
  file:close()
  local binary_dir = os.getenv("REX_BIN_DIR")
  local binary = binary_dir and (binary_dir .. "/rex") or "rex"
  local expanded = {}
  for i, path in ipairs(projects) do
    expanded[i] = path:sub(1, 2) == "~/" and home .. path:sub(2) or path
  end
  local arguments = checked(rex.json.encode{
    mode = mode, directory = directory,
    source_session = ctx.session_id, source_block = ctx.block_id,
    -- Delete only ever acts on the focused terminal's own checkout.
    projects = mode ~= "delete" and expanded or nil,
  })

  -- A separate, short-lived menu session survives stopping the target session.
  -- This lets delete stop its programs BEFORE asking Git to remove the checkout.
  local menu = checked(rex.call("session.create", {
    label = "rex-worktrees-" .. mode,
    initial_windows = {{ layout = rex.layout.block{
      flavor = "com.superlogical.terminal.shell",
      options = {
        cwd = home,
        command = { binary, "--autostart=false", "-C", ctx.client_id,
          "do", helper, "--args", arguments },
        exit = { on_completion = false },
      },
    }}},
  }))
  rex.client.queue("session.select", { session_id = menu.session_id })
end

-- Cmd shortcuts never reach terminal programs, so every Ctrl key stays theirs.
for _, item in ipairs({
  { "new", "cmd+shift+n", "Create Worktree", "worktree_new" },
  { "open", "cmd+shift+o", "Open Worktree or Branch", "worktree_open" },
  { "delete", "cmd+shift+backspace", "Delete Current Worktree", "worktree_delete" },
  { "project", "cmd+shift+k", "Open or Switch Project", "project_switch" },
}) do
  local mode = item[1]
  rex.action{
    name = item[4], title = item[3], category = "Worktrees",
    run = function(ctx) worktree_menu(mode, ctx) end,
  }
  rex.bind(item[2], item[4])
end
