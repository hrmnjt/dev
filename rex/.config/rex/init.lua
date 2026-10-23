-- Worktree lifecycle only. Appearance preferences remain manual: rex/README.md.
local function checked(value, err)
  if not value then error(err or "Rex returned no result", 0) end
  return value
end

local function worktree_menu(mode, ctx)
  if not ctx.session_id or not ctx.block_id or not ctx.client_id then
    error("Run this action from a terminal in the local Rex app", 0)
  end
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
  local home = assert(os.getenv("HOME"), "HOME is not set")
  local config = os.getenv("XDG_CONFIG_HOME") or (home .. "/.config")
  local helper = config .. "/rex/worktrees.py"
  local file = io.open(helper, "r")
  if not file then error("Deploy rex/worktrees.py with just stowall first", 0) end
  file:close()

  -- A separate, short-lived menu session survives stopping the target session.
  -- This lets delete stop its programs BEFORE asking Git to remove the checkout.
  local menu = checked(rex.call("session.create", {
    label = "rex-worktrees-" .. mode,
    initial_windows = {{ layout = rex.layout.block{
      flavor = "com.superlogical.terminal.shell",
      options = {
        cwd = home,
        command = { "python3", helper, mode, ctx.session_id, ctx.block_id, ctx.client_id, directory },
        exit = { on_completion = false },
      },
    }}},
  }))
  rex.client.queue("session.select", { session_id = menu.session_id })
end

for _, item in ipairs({
  { "new", "g", "Create Worktree" },
  { "open", "o", "Open Worktree or Branch" },
  { "delete", "d", "Delete Current Worktree" },
}) do
  local mode = item[1]
  local action = "worktree_" .. mode
  rex.action{
    name = action, title = item[3], category = "Worktrees",
    run = function(ctx) worktree_menu(mode, ctx) end,
  }
  rex.bind("ctrl+b>shift+" .. item[2], action)
end
-- Ctrl+B starts a sequence; press it twice to send Ctrl+B to the terminal.
rex.bind("ctrl+b>ctrl+b", "pane.send_key", { key = "ctrl+b" })
