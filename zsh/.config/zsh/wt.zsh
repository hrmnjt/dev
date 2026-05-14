# git worktree helper
#
# Usage:
#   wt                 # fzf-select an existing worktree and cd into it
#   wt <branch>        # go to existing worktree, or create it, then cd
#   wt ls|list         # list worktrees
#   wt go [branch]     # go to an existing worktree
#   wt new <branch> [base]
#   wt rm|remove [--force|-f] [branch]
#   wt clean           # fzf multi-select worktrees to remove
#   wt prune           # prune git metadata and empty repo.worktrees dirs
#
# Defaults:
#   WT_BASE=origin/main
#   worktree dir = <primary-repo-root>.worktrees/<branch>

__wt_err() {
  print -u2 -- "wt: $*"
}

__wt_usage() {
  cat <<'EOF'
usage:
  wt                         select existing worktree with fzf and cd into it
  wt <branch>                go to existing worktree or create it from origin/main
  wt ls|list                 list worktrees
  wt go [branch]             go to existing worktree; fzf when branch is omitted
  wt new <branch> [base]     create worktree; base defaults to $WT_BASE or origin/main
  wt rm|remove [-f] [branch] remove worktree; fzf when branch is omitted
  wt clean                   fzf multi-select worktrees to remove
  wt prune                   git worktree prune + remove empty worktree dirs
  wt help                    show this help

environment:
  WT_BASE                    default base for new branches; default: origin/main
EOF
}

__wt_require_git_repo() {
  git rev-parse --is-inside-work-tree >/dev/null 2>&1 || {
    __wt_err "not inside a git worktree"
    return 1
  }
}

# Return the primary/original repo root, even when called from a linked worktree.
# For normal repos and linked worktrees, git-common-dir is <primary-root>/.git.
__wt_repo_root() {
  local top common
  top=$(git rev-parse --show-toplevel 2>/dev/null) || return 1

  common=$(git -C "$top" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)
  if [[ -z "$common" ]]; then
    common=$(cd "$top" && git rev-parse --git-common-dir 2>/dev/null) || return 1
    [[ "$common" != /* ]] && common="$top/$common"
  fi

  if [[ "${common:t}" == ".git" ]]; then
    print -r -- "${common:h}"
  else
    __wt_err "unsupported repository layout: git common dir is $common"
    return 1
  fi
}

__wt_worktrees_dir() {
  local root
  root=$(__wt_repo_root) || return 1
  print -r -- "${root}.worktrees"
}

__wt_validate_branch() {
  local branch="$1"
  [[ -n "$branch" ]] || {
    __wt_err "missing branch name"
    return 1
  }
  git check-ref-format --branch "$branch" >/dev/null 2>&1 || {
    __wt_err "invalid branch name: $branch"
    return 1
  }
}

__wt_list_lines() {
  git worktree list --porcelain | awk '
    /^worktree / { path = substr($0, 10); branch = "" }
    /^branch / {
      branch = substr($0, 8)
      sub(/^refs\/heads\//, "", branch)
    }
    /^$/ {
      if (path != "") {
        if (branch == "") branch = "(detached)"
        printf "%s\t%s\n", branch, path
      }
      path = ""; branch = ""
    }
    END {
      if (path != "") {
        if (branch == "") branch = "(detached)"
        printf "%s\t%s\n", branch, path
      }
    }
  '
}

__wt_list() {
  __wt_require_git_repo || return 1
  __wt_list_lines | awk -F '\t' '{ printf "%-32s %s\n", $1, $2 }'
}

__wt_path_for_branch() {
  local branch="$1"
  __wt_list_lines | awk -F '\t' -v b="$branch" '$1 == b { print $2; exit }'
}

__wt_select_one() {
  local prompt="${1:-worktree> }"
  if ! command -v fzf >/dev/null 2>&1; then
    __wt_err "fzf not found; pass a branch name instead, e.g. 'wt feat/foo'"
    return 1
  fi

  __wt_list_lines |
    fzf --prompt="$prompt" --height=40% --layout=reverse --border |
    awk -F '\t' '{ print $2 }'
}

__wt_select_many_removable() {
  local root
  root=$(__wt_repo_root) || return 1

  if ! command -v fzf >/dev/null 2>&1; then
    __wt_err "fzf not found; pass branches to 'wt rm' instead"
    return 1
  fi

  __wt_list_lines |
    awk -F '\t' -v root="$root" '$2 != root { print $0 }' |
    fzf --multi --prompt="remove worktree> " --height=40% --layout=reverse --border |
    awk -F '\t' '{ print $2 }'
}

__wt_cd_path() {
  local wt_path="$1"
  [[ -n "$wt_path" ]] || return 1
  if [[ ! -d "$wt_path" ]]; then
    __wt_err "worktree path does not exist: $wt_path"
    return 1
  fi
  cd "$wt_path"
}

__wt_go() {
  __wt_require_git_repo || return 1

  local branch wt_path
  branch="$1"

  if [[ -z "$branch" ]]; then
    wt_path=$(__wt_select_one "go worktree> ") || return 1
    __wt_cd_path "$wt_path"
    return $?
  fi

  wt_path=$(__wt_path_for_branch "$branch")
  if [[ -z "$wt_path" ]]; then
    __wt_err "no worktree found for branch: $branch"
    return 1
  fi

  __wt_cd_path "$wt_path"
}

__wt_create() {
  __wt_require_git_repo || return 1

  local branch base root dir target existing
  branch="$1"
  base="${2:-${WT_BASE:-origin/main}}"

  __wt_validate_branch "$branch" || return 1

  existing=$(__wt_path_for_branch "$branch")
  if [[ -n "$existing" ]]; then
    print -- "wt: existing worktree for $branch: $existing"
    __wt_cd_path "$existing"
    return $?
  fi

  root=$(__wt_repo_root) || return 1
  dir=$(__wt_worktrees_dir) || return 1
  target="$dir/$branch"

  if [[ -e "$target" ]]; then
    __wt_err "target already exists but is not registered as a worktree: $target"
    return 1
  fi

  print -- "wt: fetching origin"
  git -C "$root" fetch --prune origin || return 1

  mkdir -p "${target:h}" || return 1

  if git -C "$root" show-ref --verify --quiet "refs/heads/$branch"; then
    print -- "wt: creating worktree for local branch $branch"
    git -C "$root" worktree add "$target" "$branch" || return 1
  elif git -C "$root" show-ref --verify --quiet "refs/remotes/origin/$branch"; then
    print -- "wt: creating tracking worktree for origin/$branch"
    git -C "$root" worktree add --track -b "$branch" "$target" "origin/$branch" || return 1
  else
    print -- "wt: creating new branch $branch from $base"
    git -C "$root" worktree add -b "$branch" "$target" "$base" || return 1
  fi

  __wt_cd_path "$target"
}

__wt_remove_empty_parents() {
  local dir="$1"
  local stop="$2"

  while [[ -n "$dir" && "$dir" != "$stop" && "$dir" == "$stop"/* ]]; do
    rmdir "$dir" >/dev/null 2>&1 || break
    dir="${dir:h}"
  done
}

__wt_remove_path() {
  local wt_path="$1"
  local force="$2"
  local root dir current_top

  [[ -n "$wt_path" ]] || return 1

  root=$(__wt_repo_root) || return 1
  dir=$(__wt_worktrees_dir) || return 1
  current_top=$(git rev-parse --show-toplevel 2>/dev/null)

  if [[ "$wt_path" == "$root" ]]; then
    __wt_err "refusing to remove primary worktree: $wt_path"
    return 1
  fi

  if [[ -n "$current_top" && "$wt_path" == "$current_top" ]]; then
    __wt_err "refusing to remove current worktree: $wt_path"
    return 1
  fi

  if [[ "$force" != "1" ]]; then
    if [[ -n "$(git -C "$wt_path" status --porcelain 2>/dev/null)" ]]; then
      __wt_err "worktree has uncommitted changes: $wt_path"
      __wt_err "use 'wt rm --force ...' to remove anyway"
      return 1
    fi
  fi

  if [[ "$force" == "1" ]]; then
    git -C "$root" worktree remove --force "$wt_path" || return 1
  else
    git -C "$root" worktree remove "$wt_path" || return 1
  fi

  __wt_remove_empty_parents "${wt_path:h}" "$dir"
}

__wt_remove() {
  __wt_require_git_repo || return 1

  local force=0 branch wt_path

  while [[ "$1" == "--force" || "$1" == "-f" ]]; do
    force=1
    shift
  done

  branch="$1"

  if [[ -z "$branch" ]]; then
    wt_path=$(__wt_select_one "remove worktree> ") || return 1
  else
    wt_path=$(__wt_path_for_branch "$branch")
    if [[ -z "$wt_path" ]]; then
      __wt_err "no worktree found for branch: $branch"
      return 1
    fi
  fi

  __wt_remove_path "$wt_path" "$force"
}

__wt_clean() {
  __wt_require_git_repo || return 1

  local paths wt_path
  paths=(${(f)$(__wt_select_many_removable)}) || return 1
  [[ ${#paths[@]} -gt 0 ]] || return 0

  for wt_path in "${paths[@]}"; do
    print -- "wt: removing $wt_path"
    __wt_remove_path "$wt_path" 0 || return 1
  done
}

__wt_prune() {
  __wt_require_git_repo || return 1

  local root dir empty_dirs d
  root=$(__wt_repo_root) || return 1
  dir=$(__wt_worktrees_dir) || return 1

  git -C "$root" worktree prune || return 1

  if [[ -d "$dir" ]]; then
    empty_dirs=(${(f)$(find "$dir" -depth -type d -empty -print 2>/dev/null)})
    for d in "${empty_dirs[@]}"; do
      [[ "$d" == "$dir" ]] && continue
      rmdir "$d" >/dev/null 2>&1 || true
    done
  fi
}

wt() {
  local cmd="$1"

  case "$cmd" in
    "" )
      __wt_go
      ;;
    help|-h|--help )
      __wt_usage
      ;;
    ls|list )
      __wt_list
      ;;
    go )
      shift
      __wt_go "$@"
      ;;
    new )
      shift
      __wt_create "$@"
      ;;
    rm|remove )
      shift
      __wt_remove "$@"
      ;;
    clean )
      shift
      __wt_clean "$@"
      ;;
    prune )
      shift
      __wt_prune "$@"
      ;;
    * )
      __wt_create "$cmd"
      ;;
  esac
}
