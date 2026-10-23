-- Run: luajit _scripts/tests/rex-setup.lua _scripts/rex-setup.lua
-- Pure Lua mocks: never execute native commands or alter app preferences.
local script = assert(arg[1], "Pass the setup helper path")
local real_print, real_getenv, real_open = print, os.getenv, io.open

local function exercise(mode, options)
  options = options or {}
  local calls, actions, output = {}, {}, {}
  rex = {
    args = mode and { mode = mode } or {},
    exec = function(argv, opts)
      calls[#calls + 1] = argv
      assert(opts.timeout == 10)
      local code, stdout, stderr = 0, "", ""
      if argv[1] == "/usr/bin/uname" then
        stdout = options.platform or "Darwin\n"
      elseif argv[1] == "/usr/bin/pgrep" then
        code = options.process_code or 1
      elseif argv[1] == "/usr/bin/defaults" then
        assert(argv[3] == "com.superlogical.rex")
        if options.start_failure then return nil, "cannot start defaults" end
        if argv[2] == "read" then
          code, stdout = 1, ""
          if argv[4] == "Workspace.terminalFontName" then code, stdout = 0, "Old Font\n" end
        elseif argv[2] == "write" then
          if options.write_failure then code, stderr = 1, "write refused" end
        else
          error("Unexpected defaults operation")
        end
      else
        error("Unexpected command: " .. argv[1])
      end
      return { ok = code == 0, code = code, stdout = stdout, stderr = stderr,
               timed_out = options.timeout and argv[1] == "/usr/bin/pgrep" or false }
    end,
    client = { queue = function(name, args)
      actions[#actions + 1] = { name = name, args = args }
    end },
  }
  print = function(message) output[#output + 1] = message end
  os.getenv = function(name)
    assert(name == "HOME")
    return "/fake home"
  end
  io.open = function(path, mode_arg)
    assert(path == "/fake home/.config/rex/themes/gruvbox-dark-hard")
    assert(mode_arg == "r")
    if options.missing_theme then return nil, "missing" end
    return { close = function() end }
  end
  local ok, result = pcall(dofile, script)
  print, os.getenv, io.open = real_print, real_getenv, real_open
  return { ok = ok, result = result, calls = calls, actions = actions, output = output }
end

local function writes(run)
  local result = {}
  for _, call in ipairs(run.calls) do
    if call[1] == "/usr/bin/defaults" and call[2] == "write" then
      result[call[4]] = { kind = call[5], value = call[6] }
    end
  end
  return result
end

local preview = exercise(nil)
assert(preview.ok and preview.result.mode == "preview" and preview.result.settings == 13)
assert(next(writes(preview)) == nil and #preview.actions == 0)
assert(preview.output[1]:find("Old Font -> JetBrainsMono Nerd Font Mono", 1, true))
real_print("PASSED: default preview is read-only")

for _, code in ipairs({0, 2}) do
  local refused = exercise("apply", { process_code = code })
  assert(not refused.ok and next(writes(refused)) == nil and #refused.actions == 0)
end
assert(not exercise("apply", { timeout = true }).ok)
real_print("PASSED: running app and indeterminate process check are refused")

local applied = exercise("apply")
assert(applied.ok and applied.result.settings == 13 and #applied.actions == 0)
local values = writes(applied)
local count = 0
for _ in pairs(values) do count = count + 1 end
assert(count == 13)
assert(values["Workspace.terminalFontName"].kind == "-string")
assert(values["Workspace.terminalFontName"].value == "JetBrainsMono Nerd Font Mono")
assert(values["Workspace.terminalFontPointSize"].kind == "-float")
assert(values["Workspace.terminalFontPointSize"].value == "18")
assert(values["Workspace.terminalUseThemePalette"].value == "false")
assert(values["Workspace.terminalCopyOnSelect"].value == "false")
assert(values["Workspace.balancesSplitsOnCreation"].value == "true")
assert(values["Workspace.focusFollowsMouse"].value == "false")
assert(values["Workspace.playsProgramActivitySounds"].value == "false")
real_print("PASSED: explicit apply uses typed argv, not shell strings")

local themed = exercise("theme")
assert(themed.ok and #themed.calls == 1 and #themed.actions == 2)
assert(themed.actions[1].name == "client.appearance.switch_mode")
assert(themed.actions[1].args.mode == "dark")
assert(themed.actions[2].name == "client.theme.import")
assert(themed.actions[2].args.path == "/fake home/.config/rex/themes/gruvbox-dark-hard")
local missing = exercise("theme", { missing_theme = true })
assert(not missing.ok and #missing.actions == 0)
real_print("PASSED: theme uses native client actions, preflighting its file")

local failed = exercise("apply", { write_failure = true })
assert(not failed.ok and tostring(failed.result):find("write refused", 1, true))
assert(#failed.calls == 3) -- uname, pgrep, first write; no continuation
assert(not exercise("preview", { start_failure = true }).ok)
assert(not exercise("apply", { platform = "Linux\n" }).ok)
local invalid = exercise("typo")
assert(not invalid.ok and #invalid.calls == 0)
real_print("PASSED: command failures, wrong platform, invalid mode stop safely")
