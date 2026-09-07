-- Neovim UI for pi's /review command.
--
-- The diff buffer and comment buffers are scratch buffers. Review comments stay
-- in this process until submission, then cross a private short-lived IPC file
-- back to pi. The TypeScript extension removes that file before restoring pi.

local state = {
  protocol = 1,
  target = vim.env.PI_REVIEW_TARGET or "changes",
  output_path = vim.env.PI_REVIEW_OUTPUT_PATH,
  output_written = false,
  lines = {},
  anchors = {},
  files = {},
  hunks = {},
  comments = {},
  next_comment_id = 1,
  namespace = vim.api.nvim_create_namespace("pi-review-comments"),
  diff_buf = nil,
  diff_win = nil,
  files_buf = nil,
  files_win = nil,
}

local function write_payload(payload)
  if state.output_written then
    return true
  end

  if not state.output_path or state.output_path == "" then
    vim.notify("Could not return review to pi: output path is missing", vim.log.levels.ERROR)
    return false
  end

  local output, err = io.open(state.output_path, "w")
  if not output then
    vim.notify("Could not return review to pi: " .. tostring(err), vim.log.levels.ERROR)
    return false
  end

  output:write(vim.json.encode(payload))
  output:flush()
  output:close()
  state.output_written = true
  return true
end

local function fail(message)
  write_payload({ protocol = state.protocol, action = "error", message = tostring(message) })
  vim.schedule(function()
    vim.cmd("qa!")
  end)
end

local function decode_git_command()
  local encoded = vim.env.PI_REVIEW_GIT_COMMAND
  if not encoded or encoded == "" then
    error("PI_REVIEW_GIT_COMMAND is missing")
  end

  local ok, command = pcall(vim.json.decode, encoded)
  if not ok or type(command) ~= "table" or command[1] ~= "git" then
    error("PI_REVIEW_GIT_COMMAND is invalid")
  end

  for _, argument in ipairs(command) do
    if type(argument) ~= "string" then
      error("PI_REVIEW_GIT_COMMAND contains a non-string argument")
    end
  end
  return command
end

local function marker_path(line)
  local path = line:sub(5)
  if path == "/dev/null" then
    return nil
  end
  if path:sub(1, 2) == "a/" or path:sub(1, 2) == "b/" then
    path = path:sub(3)
  end
  return path
end

local function parse_diff(lines)
  local current_file = nil
  local current_hunk = nil
  local old_line = nil
  local new_line = nil

  for row, line in ipairs(lines) do
    if line:match("^diff %-%-git ") then
      local old_path, new_path = line:match("^diff %-%-git a/(.*) b/(.*)$")
      current_file = {
        row = row,
        old_path = old_path,
        new_path = new_path,
        path = new_path or old_path or "(unknown)",
        status = "M",
        additions = 0,
        deletions = 0,
        hunk_count = 0,
      }
      table.insert(state.files, current_file)
      current_hunk = nil
      old_line = nil
      new_line = nil
      state.anchors[row] = { file = current_file }
    elseif current_file then
      if not current_hunk and line:sub(1, 4) == "--- " then
        current_file.old_path = marker_path(line)
        current_file.path = current_file.new_path or current_file.old_path or current_file.path
        state.anchors[row] = { file = current_file }
      elseif not current_hunk and line:sub(1, 4) == "+++ " then
        current_file.new_path = marker_path(line)
        current_file.path = current_file.new_path or current_file.old_path or current_file.path
        state.anchors[row] = { file = current_file }
      elseif line:match("^new file mode ") then
        current_file.status = "A"
        state.anchors[row] = { file = current_file }
      elseif line:match("^deleted file mode ") then
        current_file.status = "D"
        state.anchors[row] = { file = current_file }
      elseif line:match("^rename from ") or line:match("^rename to ") then
        current_file.status = "R"
        state.anchors[row] = { file = current_file }
      elseif line:match("^Binary files ") or line:match("^GIT binary patch") then
        current_file.status = "B"
        state.anchors[row] = { file = current_file }
      else
        local old_start, old_count, new_start, new_count, section =
          line:match("^@@ %-(%d+),?(%d*) %+(%d+),?(%d*) @@(.*)$")
        if old_start then
          old_line = tonumber(old_start)
          new_line = tonumber(new_start)
          current_hunk = {
            row = row,
            index = current_file.hunk_count,
            header = line,
            section = vim.trim(section or ""),
            old_count = tonumber(old_count ~= "" and old_count or "1"),
            new_count = tonumber(new_count ~= "" and new_count or "1"),
            file = current_file,
          }
          current_file.hunk_count = current_file.hunk_count + 1
          table.insert(state.hunks, current_hunk)
          state.anchors[row] = { file = current_file, hunk = current_hunk }
        elseif current_hunk then
          local prefix = line:sub(1, 1)
          if prefix == "+" then
            state.anchors[row] = {
              file = current_file,
              hunk = current_hunk,
              kind = "add",
              new_line = new_line,
            }
            current_file.additions = current_file.additions + 1
            new_line = new_line + 1
          elseif prefix == "-" then
            state.anchors[row] = {
              file = current_file,
              hunk = current_hunk,
              kind = "del",
              old_line = old_line,
            }
            current_file.deletions = current_file.deletions + 1
            old_line = old_line + 1
          elseif prefix == "\\" then
            state.anchors[row] = {
              file = current_file,
              hunk = current_hunk,
              kind = "meta",
            }
          else
            state.anchors[row] = {
              file = current_file,
              hunk = current_hunk,
              kind = "context",
              old_line = old_line,
              new_line = new_line,
            }
            old_line = old_line + 1
            new_line = new_line + 1
          end
        else
          state.anchors[row] = { file = current_file }
        end
      end
    end
  end
end

local function comment_count()
  local count = 0
  for _ in pairs(state.comments) do
    count = count + 1
  end
  return count
end

local function comments_for_file(file)
  local count = 0
  for _, comment in pairs(state.comments) do
    if comment.anchor.file == file then
      count = count + 1
    end
  end
  return count
end

local function sorted_comment_rows()
  local rows = {}
  for row in pairs(state.comments) do
    table.insert(rows, row)
  end
  table.sort(rows)
  return rows
end

local function update_winbar()
  if not state.diff_win or not vim.api.nvim_win_is_valid(state.diff_win) then
    return
  end
  local target = state.target:gsub("%%", "%%%%")
  vim.wo[state.diff_win].winbar = string.format(
    " PI Review: %s  |  %d files  |  %d comments ",
    target,
    #state.files,
    comment_count()
  )
end

local function render_file_list()
  if not state.files_buf or not vim.api.nvim_buf_is_valid(state.files_buf) then
    return
  end

  local lines = {}
  for _, file in ipairs(state.files) do
    local count = comments_for_file(file)
    local comment_label = count > 0 and string.format("  [%dc]", count) or ""
    table.insert(lines, string.format(
      "%s  %s  +%d -%d%s",
      file.status,
      file.path,
      file.additions,
      file.deletions,
      comment_label
    ))
  end

  vim.bo[state.files_buf].modifiable = true
  vim.api.nvim_buf_set_lines(state.files_buf, 0, -1, false, lines)
  vim.bo[state.files_buf].modified = false
  vim.bo[state.files_buf].modifiable = false
end

local function render_comments()
  if not state.diff_buf or not vim.api.nvim_buf_is_valid(state.diff_buf) then
    return
  end

  vim.api.nvim_buf_clear_namespace(state.diff_buf, state.namespace, 0, -1)
  for row, comment in pairs(state.comments) do
    local first_line = comment.body:match("^([^\n]*)") or comment.body
    if #first_line > 100 then
      first_line = first_line:sub(1, 97) .. "..."
    end
    vim.api.nvim_buf_set_extmark(state.diff_buf, state.namespace, row - 1, 0, {
      sign_text = "R",
      sign_hl_group = "DiagnosticInfo",
      virt_text = { { "  REVIEW: " .. first_line, "DiagnosticInfo" } },
      virt_text_pos = "eol",
      hl_mode = "combine",
      priority = 100,
    })
  end

  render_file_list()
  update_winbar()
end

local function jump_to_row(row)
  if not state.diff_win or not vim.api.nvim_win_is_valid(state.diff_win) then
    return
  end
  vim.api.nvim_set_current_win(state.diff_win)
  vim.api.nvim_win_set_cursor(state.diff_win, { row, 0 })
  vim.cmd("normal! zz")
end

local function jump_rows(rows, direction)
  if #rows == 0 then
    vim.notify("No matching review location", vim.log.levels.INFO)
    return
  end

  local current = vim.api.nvim_win_get_cursor(state.diff_win)[1]
  if direction > 0 then
    for _, row in ipairs(rows) do
      if row > current then
        jump_to_row(row)
        return
      end
    end
    jump_to_row(rows[1])
  else
    for index = #rows, 1, -1 do
      if rows[index] < current then
        jump_to_row(rows[index])
        return
      end
    end
    jump_to_row(rows[#rows])
  end
end

local function file_rows()
  local rows = {}
  for _, file in ipairs(state.files) do
    table.insert(rows, file.row)
  end
  return rows
end

local function hunk_rows()
  local rows = {}
  for _, hunk in ipairs(state.hunks) do
    table.insert(rows, hunk.row)
  end
  return rows
end

local function close_file_list()
  if state.files_win and vim.api.nvim_win_is_valid(state.files_win) then
    vim.api.nvim_win_close(state.files_win, true)
  end
  state.files_win = nil
  state.files_buf = nil
  if state.diff_win and vim.api.nvim_win_is_valid(state.diff_win) then
    vim.api.nvim_set_current_win(state.diff_win)
  end
end

local function map_normal(buffer, lhs, rhs, description)
  vim.keymap.set("n", lhs, rhs, {
    buffer = buffer,
    silent = true,
    nowait = true,
    desc = description,
  })
end

local function jump_from_file_list()
  if not state.files_win or not vim.api.nvim_win_is_valid(state.files_win) then
    return
  end
  local index = vim.api.nvim_win_get_cursor(state.files_win)[1]
  local file = state.files[index]
  if file then
    jump_to_row(file.row)
  end
end

local function setup_file_list_mappings(buffer)
  map_normal(buffer, "<CR>", jump_from_file_list, "Pi review: jump to file")
  map_normal(buffer, "l", jump_from_file_list, "Pi review: jump to file")
  map_normal(buffer, "q", close_file_list, "Pi review: close files")
  map_normal(buffer, "h", close_file_list, "Pi review: close files")
end

local function toggle_file_list()
  if state.files_win and vim.api.nvim_win_is_valid(state.files_win) then
    close_file_list()
    return
  end

  local width = math.max(24, math.min(42, math.floor(vim.o.columns * 0.3)))
  vim.cmd("topleft " .. tostring(width) .. "vnew")
  state.files_win = vim.api.nvim_get_current_win()
  state.files_buf = vim.api.nvim_get_current_buf()

  vim.api.nvim_buf_set_name(state.files_buf, "pi-review://files")
  vim.bo[state.files_buf].buftype = "nofile"
  vim.bo[state.files_buf].bufhidden = "wipe"
  vim.bo[state.files_buf].swapfile = false
  vim.bo[state.files_buf].undofile = false
  vim.bo[state.files_buf].filetype = "pi-review-files"
  vim.wo[state.files_win].number = false
  vim.wo[state.files_win].relativenumber = false
  vim.wo[state.files_win].cursorline = true
  vim.wo[state.files_win].wrap = false
  vim.wo[state.files_win].signcolumn = "no"
  vim.wo[state.files_win].winfixwidth = true
  vim.wo[state.files_win].winbar = " Changed files "

  render_file_list()
  setup_file_list_mappings(state.files_buf)
  vim.api.nvim_set_current_win(state.diff_win)
end

local function anchor_label(anchor)
  local parts = { anchor.file.path }
  if anchor.new_line then
    table.insert(parts, "new line " .. tostring(anchor.new_line))
  elseif anchor.old_line then
    table.insert(parts, "old line " .. tostring(anchor.old_line))
  elseif anchor.hunk then
    table.insert(parts, "hunk " .. tostring(anchor.hunk.index + 1))
  else
    table.insert(parts, "file")
  end
  return table.concat(parts, ", ")
end

local function render_context(row, anchor)
  local context = {}
  local first = math.max(1, row - 2)
  local last = math.min(#state.lines, row + 2)
  for candidate_row = first, last do
    local candidate = state.anchors[candidate_row]
    if candidate and candidate.file == anchor.file and candidate.hunk == anchor.hunk then
      local marker = candidate_row == row and "> " or "  "
      table.insert(context, marker .. state.lines[candidate_row])
    end
  end
  return context
end

local function output_comment(row, comment)
  local anchor = comment.anchor
  local output_anchor = {
    context = render_context(row, anchor),
    diffLine = "> " .. state.lines[row],
  }

  if anchor.hunk then
    output_anchor.hunkHeader = anchor.hunk.header
    if anchor.hunk.section ~= "" then
      output_anchor.hunkSection = anchor.hunk.section
    end
  end
  if anchor.kind then
    output_anchor.lineKind = anchor.kind
  end

  return {
    id = comment.id,
    filePath = anchor.file.path,
    hunkIndex = anchor.hunk and anchor.hunk.index or nil,
    oldLine = anchor.old_line,
    newLine = anchor.new_line,
    body = comment.body,
    anchor = output_anchor,
  }
end

local function submit_review()
  local rows = sorted_comment_rows()
  local comments = {}
  for _, row in ipairs(rows) do
    table.insert(comments, output_comment(row, state.comments[row]))
  end

  if write_payload({ protocol = state.protocol, action = "submit", comments = comments }) then
    vim.cmd("qa!")
  end
end

local function cancel_review()
  local count = comment_count()
  if count > 0 then
    local answer = vim.fn.confirm(
      string.format("Discard %d review comment%s?", count, count == 1 and "" or "s"),
      "&Discard\n&Return",
      2
    )
    if answer ~= 1 then
      return
    end
  end

  if write_payload({ protocol = state.protocol, action = "cancel" }) then
    vim.cmd("qa!")
  end
end

local function delete_comment()
  local row = vim.api.nvim_win_get_cursor(state.diff_win)[1]
  if not state.comments[row] then
    vim.notify("No review comment at this line", vim.log.levels.INFO)
    return
  end
  state.comments[row] = nil
  render_comments()
end

local function edit_comment()
  local row = vim.api.nvim_win_get_cursor(state.diff_win)[1]
  local anchor = state.anchors[row]
  if not anchor or not anchor.file or anchor.file.path == "(unknown)" then
    vim.notify("This line cannot anchor a review comment", vim.log.levels.WARN)
    return
  end

  local existing = state.comments[row]
  local comment_id = existing and existing.id or nil
  local buffer = vim.api.nvim_create_buf(false, true)
  local initial = existing and vim.split(existing.body, "\n", { plain = true }) or { "" }
  vim.api.nvim_buf_set_lines(buffer, 0, -1, false, initial)
  local uv = vim.uv or vim.loop
  vim.api.nvim_buf_set_name(buffer, "pi-review-comment://" .. tostring(row) .. "/" .. tostring(uv.hrtime()))
  vim.bo[buffer].buftype = "acwrite"
  vim.bo[buffer].bufhidden = "wipe"
  vim.bo[buffer].swapfile = false
  vim.bo[buffer].undofile = false
  vim.bo[buffer].filetype = "markdown"
  vim.bo[buffer].modified = false

  local width = math.max(40, math.min(90, vim.o.columns - 8))
  local height = math.max(8, math.min(20, vim.o.lines - 8))
  local window = vim.api.nvim_open_win(buffer, true, {
    relative = "editor",
    row = math.max(1, math.floor((vim.o.lines - height) / 2) - 1),
    col = math.max(1, math.floor((vim.o.columns - width) / 2)),
    width = width,
    height = height,
    style = "minimal",
    border = "rounded",
    title = " Review: " .. anchor_label(anchor) .. " ",
    title_pos = "center",
  })
  vim.wo[window].wrap = true
  vim.wo[window].linebreak = true

  local function save(close_window)
    if not vim.api.nvim_buf_is_valid(buffer) then
      return
    end
    local body = table.concat(vim.api.nvim_buf_get_lines(buffer, 0, -1, false), "\n")
    if body:match("^%s*$") then
      state.comments[row] = nil
    else
      if not comment_id then
        comment_id = string.format("nvim-%d-%d", os.time(), state.next_comment_id)
        state.next_comment_id = state.next_comment_id + 1
      end
      state.comments[row] = {
        id = comment_id,
        body = body,
        anchor = anchor,
      }
    end
    vim.bo[buffer].modified = false
    render_comments()
    if close_window and vim.api.nvim_win_is_valid(window) then
      vim.api.nvim_win_close(window, true)
    end
  end

  vim.api.nvim_create_autocmd("BufWriteCmd", {
    buffer = buffer,
    callback = function()
      save(false)
    end,
  })

  map_normal(buffer, "ZZ", function() save(true) end, "Pi review: save comment")
  map_normal(buffer, "ZQ", function()
    if vim.api.nvim_win_is_valid(window) then
      vim.api.nvim_win_close(window, true)
    end
  end, "Pi review: discard comment edit")
  vim.keymap.set({ "n", "i" }, "<C-s>", function() save(true) end, {
    buffer = buffer,
    silent = true,
    desc = "Pi review: save comment",
  })

  vim.cmd("startinsert")
end

local function show_help()
  local lines = {
    "Pi review",
    "",
    "Use normal Vim motions, search, and scrolling.",
    "",
    "[f / ]f       previous / next changed file",
    "[c / ]c       previous / next diff hunk",
    "[r / ]r       previous / next review comment",
    "<leader>rf    toggle changed-files sidebar",
    "<leader>rc    add or edit a comment",
    "<leader>rd    delete comment at cursor",
    "<leader>rs    submit review (also ZZ)",
    "<leader>rq    cancel review (also ZQ)",
    "<leader>rh    show this help",
    "",
    "Comment editor: :w saves, :wq or ZZ saves and closes, ZQ discards.",
    "",
    "Comments are held in memory and returned to pi only on submit.",
  }
  local width = math.max(50, math.min(82, vim.o.columns - 8))
  local height = math.min(#lines, vim.o.lines - 6)
  local buffer = vim.api.nvim_create_buf(false, true)
  vim.api.nvim_buf_set_lines(buffer, 0, -1, false, lines)
  vim.bo[buffer].buftype = "nofile"
  vim.bo[buffer].bufhidden = "wipe"
  vim.bo[buffer].swapfile = false
  vim.bo[buffer].modifiable = false

  local window = vim.api.nvim_open_win(buffer, true, {
    relative = "editor",
    row = math.max(1, math.floor((vim.o.lines - height) / 2) - 1),
    col = math.max(1, math.floor((vim.o.columns - width) / 2)),
    width = width,
    height = height,
    style = "minimal",
    border = "rounded",
    title = " Pi review help ",
    title_pos = "center",
  })
  local close = function()
    if vim.api.nvim_win_is_valid(window) then
      vim.api.nvim_win_close(window, true)
    end
  end
  map_normal(buffer, "q", close, "Pi review: close help")
  map_normal(buffer, "<Esc>", close, "Pi review: close help")
end

local function setup_diff_buffer(lines)
  state.diff_win = vim.api.nvim_get_current_win()
  state.diff_buf = vim.api.nvim_create_buf(false, true)
  vim.api.nvim_win_set_buf(state.diff_win, state.diff_buf)

  vim.api.nvim_buf_set_name(state.diff_buf, "pi-review://diff")
  vim.bo[state.diff_buf].modifiable = true
  vim.api.nvim_buf_set_lines(state.diff_buf, 0, -1, false, lines)
  vim.bo[state.diff_buf].modified = false
  vim.bo[state.diff_buf].buftype = "nofile"
  vim.bo[state.diff_buf].bufhidden = "wipe"
  vim.bo[state.diff_buf].swapfile = false
  vim.bo[state.diff_buf].undofile = false
  vim.bo[state.diff_buf].filetype = "diff"
  vim.bo[state.diff_buf].readonly = true
  vim.bo[state.diff_buf].modifiable = false

  vim.wo[state.diff_win].wrap = false
  vim.wo[state.diff_win].cursorline = true
  vim.wo[state.diff_win].foldenable = false
  vim.wo[state.diff_win].signcolumn = "yes:1"

  map_normal(state.diff_buf, "]f", function() jump_rows(file_rows(), 1) end, "Pi review: next file")
  map_normal(state.diff_buf, "[f", function() jump_rows(file_rows(), -1) end, "Pi review: previous file")
  map_normal(state.diff_buf, "]c", function() jump_rows(hunk_rows(), 1) end, "Pi review: next hunk")
  map_normal(state.diff_buf, "[c", function() jump_rows(hunk_rows(), -1) end, "Pi review: previous hunk")
  map_normal(state.diff_buf, "]r", function() jump_rows(sorted_comment_rows(), 1) end, "Pi review: next comment")
  map_normal(state.diff_buf, "[r", function() jump_rows(sorted_comment_rows(), -1) end, "Pi review: previous comment")
  map_normal(state.diff_buf, "<leader>rf", toggle_file_list, "Pi review: toggle changed files")
  map_normal(state.diff_buf, "<leader>rc", edit_comment, "Pi review: add or edit comment")
  map_normal(state.diff_buf, "<leader>rd", delete_comment, "Pi review: delete comment")
  map_normal(state.diff_buf, "<leader>rs", submit_review, "Pi review: submit")
  map_normal(state.diff_buf, "<leader>rq", cancel_review, "Pi review: cancel")
  map_normal(state.diff_buf, "<leader>rh", show_help, "Pi review: help")
  map_normal(state.diff_buf, "ZZ", submit_review, "Pi review: submit")
  map_normal(state.diff_buf, "ZQ", cancel_review, "Pi review: cancel")

  vim.api.nvim_buf_create_user_command(state.diff_buf, "PiReviewFiles", toggle_file_list, {})
  vim.api.nvim_buf_create_user_command(state.diff_buf, "PiReviewComment", edit_comment, {})
  vim.api.nvim_buf_create_user_command(state.diff_buf, "PiReviewDelete", delete_comment, {})
  vim.api.nvim_buf_create_user_command(state.diff_buf, "PiReviewSubmit", submit_review, {})
  vim.api.nvim_buf_create_user_command(state.diff_buf, "PiReviewCancel", cancel_review, {})
  vim.api.nvim_buf_create_user_command(state.diff_buf, "PiReviewHelp", show_help, {})

  update_winbar()
end

local function start()
  local command = decode_git_command()
  local lines = vim.fn.systemlist(command)
  if vim.v.shell_error ~= 0 then
    error("git diff failed with exit code " .. tostring(vim.v.shell_error))
  end
  if #lines == 0 then
    error("No changes were found for " .. state.target)
  end

  state.lines = lines
  parse_diff(lines)
  if #state.files == 0 then
    error("Could not parse any changed files from git diff")
  end

  setup_diff_buffer(lines)
  render_comments()

  vim.api.nvim_create_autocmd("VimLeavePre", {
    once = true,
    callback = function()
      if not state.output_written then
        write_payload({ protocol = state.protocol, action = "cancel" })
      end
    end,
  })

  if #state.files > 1 and vim.o.columns >= 90 then
    toggle_file_list()
  end

  vim.api.nvim_echo({
    { "Pi review: ", "Title" },
    { "<leader>rc comment  [f/]f files  [c/]c hunks  ZZ submit  ZQ cancel", "Normal" },
  }, false, {})
end

local ok, err = xpcall(start, debug.traceback)
if not ok then
  fail(err)
end
