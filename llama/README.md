# Local llama.cpp inference

This Stow package runs local GGUF models through Homebrew `llama.cpp` and exposes
them to Pi through an OpenAI-compatible API.

The tracked service configuration is model-agnostic. Model weights live in the
repo-local, Git-ignored `_models/` directory, while the active model selection
is host-local state.

## Layout

```text
llama/
├── .config/llama/
│   ├── com.hrmnjt.llama-server.plist # on-demand LaunchAgent
│   └── server.env.example            # runtime configuration template
└── .local/bin/
    └── local-llm                     # service and model controller

_models/                              # repo-local GGUF weights, not Stowed
~/.config/llama/server.env            # active host-local configuration
pi/.pi/agent/models.json              # Pi provider metadata
```

The server binds to `127.0.0.1:8080` by default and exposes whichever GGUF is
active through the stable `local-model` alias.

## Install and deploy

The required packages are tracked in `Brewfile`:

```bash
just brewinst
just stowall
loadshell
```

`llama.cpp` provides the Metal-accelerated server, and `fzf` powers the model
switcher.

## Models I am currently trying

Run downloads from the repository root. `uvx` runs the Hugging Face CLI without
installing `huggingface-hub` globally.

### Qwen3.5 9B Q4_K_M

```bash
uvx --from huggingface-hub hf download \
    unsloth/Qwen3.5-9B-GGUF \
    --include "Qwen3.5-9B-Q4_K_M.gguf" \
    --local-dir _models/qwen3.5-9b
```

### Qwen3-Coder-Next Q5_K_M

```bash
uvx --from huggingface-hub hf download \
    Qwen/Qwen3-Coder-Next-GGUF \
    --include "Qwen3-Coder-Next-Q5_K_M/*" \
    --local-dir _models/qwen3-coder-next-q5-k-m
```

The coder model is sharded. The switcher displays only its `00001-of-*` shard;
llama.cpp discovers and loads the remaining shards automatically.

These are current experiments rather than permanent defaults. Other models can
be downloaded into their own `_models/<model-name>/` directory using the
publisher's instructions. Verify publisher-provided checksums when available.

## Select and start a model

```bash
llm switch
llm check
```

`llm switch` searches `_models/` recursively, excludes multimodal projector
files, hides all but the first shard of sharded models, and opens an `fzf`
selector. It then:

1. Creates `~/.config/llama/server.env` from the tracked example when needed.
2. Stores the selected GGUF path in that host-local file.
3. Starts or restarts the LaunchAgent.
4. Waits for the server health endpoint to become ready.

`llm check` requires a healthy server and prints the models exposed by its
OpenAI-compatible API.

On first use in Pi, open `/model` and select:

```text
llama.cpp / local-model
```

Switching GGUFs does not require changing Pi's provider or model ID.

## Service commands

```bash
llm start    # start the configured model
llm stop     # stop and unload the LaunchAgent
llm restart  # restart the configured model
llm switch   # select a GGUF and restart the service
llm status   # show launchd state and server health
llm check    # require a healthy server and list API models
llm logs     # follow ~/Library/Logs/llama-server.log
llm --help
```

The LaunchAgent has `RunAtLoad` and `KeepAlive` disabled. It runs only after an
explicit `llm start`, `llm restart`, or `llm switch` and remains stopped after
`llm stop`.

## Runtime configuration

Supported values in `~/.config/llama/server.env`:

| Variable | Default | Purpose |
|---|---:|---|
| `LOCAL_LLM_MODEL` | selected by `llm switch` | Absolute path to the active GGUF |
| `LOCAL_LLM_MODELS_DIR` | repo `_models/` | Directory searched by `llm switch` |
| `LOCAL_LLM_ALIAS` | `local-model` | Model ID exposed by the API; keep aligned with Pi |
| `LOCAL_LLM_CONTEXT_SIZE` | `32768` | Server context window; keep aligned with Pi |
| `LOCAL_LLM_HOST` | `127.0.0.1` | Listen address |
| `LOCAL_LLM_PORT` | `8080` | Listen port |
| `LOCAL_LLM_PARALLEL` | `1` | Number of inference slots |
| `LOCAL_LLM_START_TIMEOUT` | `300` | Startup timeout in seconds |
| `LOCAL_LLM_BINARY` | `/opt/homebrew/bin/llama-server` | Server executable |
| `LOCAL_LLM_MMPROJ` | unset | Optional multimodal projector |

After manually editing the runtime configuration, apply it with:

```bash
llm restart
```

The wrapper enables Metal offload, Flash Attention, Jinja chat templates, and
localhost-only serving as generic defaults. Sampling remains controlled by the
client or model defaults.

Pi's tracked `local-model` entry uses conservative text-only, non-reasoning
metadata. When a model needs a different context limit, image input, or a
specific reasoning format, update both `pi/.pi/agent/models.json` and
`~/.config/llama/server.env` as appropriate.
