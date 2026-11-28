-- Worktree and project actions, which programs a restart resumes, and an
-- action that applies the Rex app's appearance preferences.

-- Projects for Cmd+Shift+K, and for New/Open outside a Git checkout. List
-- primary checkouts in the order you want them; `~/` is your home directory.
local projects = {
  "~/code/github.com/hrmnjt/dev",
  "~/code/github.com/hrmnjt/sttp",
  "~/code/github.com/hrmnjt/worklog",
  "~/code/github.com/hrmnjt/assistant",
  "~/code/work/doh/CoreDataEngineering",
}

-- Session Restore brings sessions, tabs and panes back after a Rex server
-- restart. Resume only Claude Code and Pi, and only in projects under ~/code;
-- agents not used here never resume. Other panes come back as shells.
rex.set("resume.trust.claude.dir", "~/code")
-- Rex 0.1.0-preview.25 ships no Pi rule, so set it in full; a whole rule
-- also replaces a built-in one where it exists.
rex.set("resume.trust.pi", { command = { "pi", "--session", rex.match.uuid }, dir = "~/code" })
-- Turning off a rule this Rex doesn't ship is accepted and does nothing.
for _, agent in ipairs({ "codex", "opencode", "gemini", "copilot", "crush" }) do
  rex.set("resume.trust." .. agent, false)
end

-- The actions load worktrees.lua from this file's own folder, so trying a
-- branch's copy with `rex do <checkout>/rex/.config/rex/init.lua --action ...`
-- never runs the deployed one.
local here = (debug.getinfo(1, "S").source or ""):gsub("^@", ""):match("^(/.*)/[^/]+$")

local function checked(value, err)
  if not value then error(err or "Rex returned no result", 0) end
  return value
end

local function expanded_projects(home)
  local expanded = {}
  for i, path in ipairs(projects) do
    expanded[i] = path:sub(1, 2) == "~/" and home .. path:sub(2) or path
  end
  return expanded
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

-- Every action asks in the command palette inside this action, so none needs
-- a menu session, fzf, or Remote Control. Never wrap this in pcall: Rex
-- refuses prompts there.
local function palette_action(mode, ctx)
  if not ctx.session_id then error("Run this action from a terminal in the local Rex app", 0) end
  -- Projects works from any pane; the others act on the focused terminal's checkout.
  local directory = mode ~= "project" and terminal_directory(ctx) or nil
  local module = here and (here .. "/worktrees.lua")
  local file = module and io.open(module, "r")
  if not file then error("Deploy rex/worktrees.lua with just stowall first", 0) end
  file:close()
  local worktrees = dofile(module)
  worktrees.action(mode, {
    directory = directory, source_session = ctx.session_id, source_block = ctx.block_id,
    -- Delete only ever acts on the focused terminal's own checkout.
    projects = mode ~= "delete" and expanded_projects(assert(os.getenv("HOME"), "HOME is not set")) or nil,
  }, rex)
end

-- The Rex app's own settings, applied by "Apply Appearance Preferences" in the
-- command palette without quitting Rex. Each is a client.setting.* action of
-- Rex for Mac (`rex -C <app> actions` lists their arguments).
local appearance = {
  -- JetBrains Mono Nerd Font, Regular, 18 pt; the font cask is in Brewfile.
  { "client.setting.terminal.typography.font", { value = "JetBrainsMono Nerd Font Mono" } },
  { "client.setting.terminal.typography.style", { value = "Regular" } },
  { "client.setting.terminal.typography.size", { value = 18 } },
  { "client.setting.terminal.advanced_fonts.smoothing", { value = true } },
  { "client.setting.terminal.advanced_fonts.ligatures", { value = true } },
  -- Improve contrast, keep Pi/Neovim colors, and use sRGB rather than P3.
  { "client.setting.terminal.colors.contrast", { value = true } },
  { "client.setting.terminal.colors.palette", { value = false } },
  { "client.setting.terminal.colors.display_p3", { value = false } },
  -- Keep the clipboard intact and the theme's selection colors.
  { "client.setting.terminal.selection.copy_on_select", { value = false } },
  { "client.setting.terminal.selection.background", { value = "theme" } },
  { "client.setting.terminal.selection.foreground", { value = "theme" } },
  -- Balance splits; click to focus panes.
  { "client.setting.interface.splits_focus.autobalance", { value = true } },
  { "client.setting.interface.splits_focus.focus_follows_mouse", { value = false } },
  -- Allow notifications without Rex's extra program-activity sounds.
  { "client.setting.notifications.macos.terminal_notifications", { value = true } },
  { "client.setting.notifications.activity.system_notifications", { value = true } },
  { "client.setting.notifications.activity.sounds", { value = false } },
}
-- Queued client actions run in the app that ran this action once it returns,
-- so this needs no Remote Control.
rex.action{
  name = "appearance_apply", title = "Apply Appearance Preferences", category = "Appearance",
  run = function()
    local theme = here and (here .. "/themes/gruvbox-dark-hard")
    local file = theme and io.open(theme, "r")
    if not file then error("Deploy rex/themes/gruvbox-dark-hard with just stowall first", 0) end
    file:close()
    -- Dark appearance with the Gruvbox theme; importing a theme also selects it.
    rex.client.queue("client.appearance.switch_mode", { mode = "dark" })
    rex.client.queue("client.theme.import", { path = theme })
    for _, setting in ipairs(appearance) do rex.client.queue(setting[1], setting[2]) end
  end,
}

-- Cmd shortcuts never reach terminal programs, so every Ctrl key stays theirs.
for _, item in ipairs({
  { "new", "cmd+shift+n", "Create Worktree", "worktree_new" },
  { "open", "cmd+shift+o", "Open Worktree or Branch", "worktree_open" },
  { "delete", "cmd+shift+backspace", "Delete Current Worktree", "worktree_delete" },
  { "project", "cmd+shift+k", "Open a Project or Path", "project_switch" },
}) do
  local mode = item[1]
  rex.action{
    name = item[4], title = item[3], category = "Worktrees",
    run = function(ctx) palette_action(mode, ctx) end,
  }
  rex.bind(item[2], item[4])
end
