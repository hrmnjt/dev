-- Run explicitly with: rex --autostart=false do ./_scripts/rex-setup.lua mode=preview
-- Native client APIs where available; rex.exec only for missing settings APIs.
-- Never require this file from init.lua: setup must not run during config reload.
local mode = rex.args.mode or "preview"
if mode ~= "preview" and mode ~= "apply" and mode ~= "theme" then
  error("mode must be preview, apply, or theme", 0)
end

local function exec(argv)
  local result, err = rex.exec(argv, { timeout = 10 })
  if not result then error(err or "Could not start " .. argv[1], 0) end
  return result
end

local function checked(argv)
  local result = exec(argv)
  if not result.ok then
    error(table.concat(argv, " ") .. " failed: " .. (result.stderr or ""), 0)
  end
  return result
end

if not checked({ "/usr/bin/uname", "-s" }).stdout:match("^Darwin%s*$") then
  error("This setup helper is for the local macOS Rex app", 0)
end

if mode == "theme" then
  local home = assert(os.getenv("HOME"), "HOME is not set")
  local path = home .. "/.config/rex/themes/gruvbox-dark-hard"
  local file, err = io.open(path, "r")
  if not file then error("Deploy the theme with just stowall first: " .. tostring(err), 0) end
  file:close()
  -- These are native Rex client actions, not subprocesses or plist edits.
  rex.client.queue("client.appearance.switch_mode", { mode = "dark" })
  rex.client.queue("client.theme.import", { path = path })
  return { mode = mode, theme = path }
end

-- No native Lua setters exist for these app preferences in Beta 0.1.0 (1347).
-- Keep this fallback small and explicit; review these private keys after upgrades.
local domain = "com.superlogical.rex"
local settings = {
  { "terminalFontName", "string", "JetBrainsMono Nerd Font Mono", "Terminal font" },
  { "terminalFontPointSize", "float", "18", "Default font size in points" },
  { "terminalFontSmoothing", "bool", "true", "Font smoothing" },
  { "terminalAllowsLigatures", "bool", "true", "Programming ligatures" },
  { "terminalImproveTextContrast", "bool", "true", "Improve low-contrast text" },
  { "terminalUseThemePalette", "bool", "false", "Preserve application RGB/256 colors" },
  { "terminalUsesDisplayP3", "bool", "false", "Use sRGB for the shared palette" },
  { "terminalCopyOnSelect", "bool", "false", "Do not replace clipboard on selection" },
  { "balancesSplitsOnCreation", "bool", "true", "Balance panes on creation and close" },
  { "focusFollowsMouse", "bool", "false", "Click to focus a terminal pane" },
  { "allowsTerminalNotifications", "bool", "true", "Allow OSC 9/777 notifications" },
  { "showsProgramActivityNotifications", "bool", "true", "Reported program activity notifications" },
  { "playsProgramActivitySounds", "bool", "false", "No extra program activity sounds" },
}

if mode == "apply" then
  -- The app can overwrite defaults from its in-memory settings on exit.
  -- Do not quit it automatically or write preferences while it is open.
  local process = exec({ "/usr/bin/pgrep", "-x", "Rex" })
  if process.code == 0 then error("Fully quit Rex (Cmd-Q); run apply from Ghostty", 0) end
  if process.code ~= 1 or process.timed_out then
    error("Cannot check whether Rex is running; no preferences were changed", 0)
  end
end

for _, setting in ipairs(settings) do
  local key = "Workspace." .. setting[1]
  if mode == "preview" then
    local current = exec({ "/usr/bin/defaults", "read", domain, key })
    local value = current.ok and current.stdout:gsub("[\r\n]+$", "") or "<unset; Rex default>"
    print(setting[4] .. "\n  " .. key .. ": " .. value .. " -> " .. setting[3])
  else
    checked({ "/usr/bin/defaults", "write", domain, key, "-" .. setting[2], setting[3] })
  end
end

if mode == "preview" then
  print("Preview only. Quit Rex, then use mode=apply from Ghostty to change these settings.")
else
  print("Preferences updated. Reopen Rex, then run this helper with mode=theme.")
end
return { mode = mode, settings = #settings }
