# Local llama.cpp inference

This Stow package runs Homebrew `llama.cpp` in router mode for Pi's built-in
llama.cpp provider. Pi discovers the router's GGUF models and provides the
interactive model workflow; this package is only responsible for starting the
host service.

The router listens on `127.0.0.1:8080` and stays available after it is
explicitly bootstrapped for the current login session. It starts without loading
a model; models are loaded and unloaded through Pi's `/llama` command.

## Layout

```text
llama/
├── .config/llama/
│   └── com.hrmnjt.llama-server.plist # on-demand router LaunchAgent
└── .local/bin/
    ├── llama-router                  # router command and HF token discovery
    └── llm                           # host-side router service controller

_models/                              # complete router-managed llama.cpp cache
~/.cache/huggingface/token            # optional host-local Hugging Face token
~/.pi/agent/auth.json                 # Pi's host-local router connection
```

`_models/` is the single model store. `llama-router` sets `LLAMA_CACHE` to this
Git-ignored directory, and every model is downloaded and managed through Pi's
`/llama` UI.

## Install and deploy

Pi 0.81 or later and a current llama.cpp build with router support are required.
The Homebrew package is tracked in `Brewfile`:

```bash
brew bundle install
brew upgrade llama.cpp # when upgrading an existing machine
just stowall
loadshell
```

The plist remains under `~/.config/llama` rather than
`~/Library/LaunchAgents`. macOS does not discover it automatically, but this
avoids requiring terminal permission to install login items. Start it once per
login session when local inference is needed:

```bash
llm start
```

`llm start` bootstraps the LaunchAgent and waits for the router health endpoint.
Use `llm restart` to run `launchctl kickstart -k` when the service is already
registered.

## Hugging Face authentication

Public model search and downloads work without authentication at lower rate
limits. For gated repositories or authenticated downloads, use the Hugging Face
CLI from a host terminal:

```bash
uvx --from huggingface-hub hf auth login
chmod 600 "$HOME/.cache/huggingface/token"
test -s "$HOME/.cache/huggingface/token"
```

The login command prompts for the token instead of putting it in shell history
and writes it outside this repository. Pi already searches this standard
location, and `llama-router` reads the same file
and exports `HF_TOKEN` to the launchd-managed server. This is necessary because
launchd does not inherit the interactive shell's `HF_TOKEN`.

The launcher also honors `HF_TOKEN`, `HF_TOKEN_PATH`, `HF_HOME`, and
`XDG_CACHE_HOME` when it is run outside launchd or those values are supplied by
another service configuration. Restart the service after changing the token.

## Router behavior

`llama-router` starts `llama-server` without `--model`, which enables router
mode. Its shared defaults are:

- local-only access on `127.0.0.1:8080`
- explicit loading with `--no-models-autoload`
- Jinja chat templates and tool calling
- full Metal offload and Flash Attention
- a 32,768-token context window
- a single router-managed cache at `_models/` via `LLAMA_CACHE`
- no web UI

The model context reported to Pi comes from the loaded llama.cpp instance, so
there is no separate Pi metadata to synchronize. Use a
[llama.cpp model preset](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md#model-presets)
when a model needs a different context size or other per-model options.

## Model storage

`_models/` is the complete llama.cpp cache. Its GGUF files, download metadata,
and partial downloads are ignored as a unit. Do not add another model directory
or reorganize cache files manually.

Use `/llama` → **Download model…** for every model. Current evaluation candidates
can be entered by exact repository and quantization:

```text
unsloth/Qwen3.5-122B-A10B-GGUF:UD-Q5_K_XL
unsloth/GLM-4.7-Flash-GGUF:Q8_0
```

Downloads are registered by the router automatically and remain unloaded until
selected in `/llama`. Use the same UI to load and unload them.

## Router service commands

The host-side `llm` command owns router lifecycle and observability only. Model
downloads, loading, and unloading remain in Pi's `/llama` UI so its progress,
cancellation, and multi-model safeguards are preserved.

```bash
llm start        # bootstrap for this login session and wait for health
llm restart      # bootstrap if needed, otherwise launchctl kickstart -k
llm stop         # stop and unregister the LaunchAgent
llm status       # show launchd state, router health, and discovered models
llm models       # list model IDs and loaded/unloaded state
llm logs         # follow the last 100 log lines
llm logs 300     # follow a different number of initial lines
llm help         # explain commands, lifecycle, and common workflow
```

The service is not automatically bootstrapped after a logout or macOS restart
because its plist is outside `~/Library/LaunchAgents`; run `llm start` again.
Once bootstrapped, launchd's `KeepAlive` setting restarts the router if it exits.
The idle router does not load model weights or allocate their KV caches.

See the [Pi package guide](../pi/README.md#local-models-and-themes) for `/login`,
`/llama`, and `/model` usage.

## Check a new model

Load one candidate with `/llama`, select it with `/model`, and start a fresh
session with `/new`. Check:

- Exact instruction following, such as replying only with `LOCAL_MODEL_OK`.
- A grounded, read-only repository question: the model should inspect files
  before answering and distinguish absent settings from unsupported claims.
- A small disposable coding task: observe failing tests, edit only the requested
  files, preserve tests and rerun the complete suite.
- VM boundary awareness: tools cannot query the Mac router or read its cache.
  Ask the user to run `llm status`/`llm models` rather than inventing results
  or attempting a host-service workaround.

Compare candidates with the same prompts in fresh sessions. Record correctness,
unrelated edits, response time and memory pressure, not just generation speed.
Unload other models first; unload/reload the candidate to reset its KV-cache.

## Diagnostics and capacity

Router and model-worker output share `~/Library/Logs/llama-server.log`.
Use `llm logs` to follow it, or filter completed inference timings:

```bash
log="$HOME/Library/Logs/llama-server.log"
tail -F "$log" |
  rg --line-buffered 'prompt eval time|\| +eval time|total time'
```

`prompt eval time` measures input processing; `eval time` reports output
generation, including tokens/second. Worker prefixes such as `[57013]` are
internal ports and timestamps are elapsed worker time. One Pi turn may create
multiple tasks, and later requests can reuse cached context.

Check memory and load errors from a host terminal:

```bash
ps -axo pid,rss,%cpu,etime,command | rg '[l]lama-server'
memory_pressure -Q
sysctl vm.swapusage
du -sh _models
rg -i 'error|failed|out of memory|metal' "$log" | tail -n 30
```

RSS is in KiB but does not fully describe Metal's unified-memory use. Prefer
Memory Pressure and swap growth when deciding whether a model fits. Weights
are only the baseline; the shared 32K context and KV-cache can add several GiB.

The log has no automatic rotation. To discard it, stop the router before
truncating, then restart:

```bash
llm stop
mkdir -p "$HOME/Library/Logs"
: >"$HOME/Library/Logs/llama-server.log"
llm start
```
