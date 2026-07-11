# Local inference models

This directory stores model weights used by the local llama.cpp server. GGUF
weights, multimodal projectors, and partial downloads are ignored by Git.

Use one subdirectory per model or quantization so locally downloaded files stay
organized without adding model-specific data to the dotfiles configuration:

```text
_models/
├── README.md
├── <model-a>/
│   └── <model-a>.gguf
└── <model-b>/
    ├── <model-b>.gguf
    └── mmproj.gguf
```

Model downloads are intentionally not encoded in `Justfile`: sources, licenses,
file layouts, checksums, and authentication requirements vary by publisher.
Download each model from its publisher, verify it using the publisher's digest
when available, and keep its weights under this directory.

## Select the active model

After deploying with `just stowall`, use the interactive switcher:

```bash
loadshell
llm-switch
```

The switcher searches `_models/` recursively for GGUF files, excludes
multimodal projector files, and shows only `00001-of-*` for sharded models so
llama.cpp can discover the remaining shards automatically. It opens an fzf
selector and writes the choice to the host-local configuration:

```text
~/.config/llama/server.env
```

It creates that file from the tracked example when necessary, then starts or
restarts the service automatically. The selected weights are exposed through
the stable `local-model` alias, so switching GGUFs does not require changing
pi's provider ID.

Advanced settings can still be edited directly in `server.env`. After changing
one manually, apply it with `llm-restart`.

## Runtime configuration

Supported `server.env` values:

| Variable | Default | Purpose |
|---|---:|---|
| `LOCAL_LLM_MODEL` | selected by `llm-switch` | Absolute path to the active GGUF |
| `LOCAL_LLM_MODELS_DIR` | repo `_models/` | Directory searched by `llm-switch` |
| `LOCAL_LLM_ALIAS` | `local-model` | Model ID exposed by the API; keep aligned with pi |
| `LOCAL_LLM_CONTEXT_SIZE` | `32768` | Server context window; keep aligned with pi |
| `LOCAL_LLM_HOST` | `127.0.0.1` | Listen address |
| `LOCAL_LLM_PORT` | `8080` | Listen port |
| `LOCAL_LLM_PARALLEL` | `1` | Number of inference slots |
| `LOCAL_LLM_START_TIMEOUT` | `300` | Startup wait timeout in seconds |
| `LOCAL_LLM_BINARY` | `/opt/homebrew/bin/llama-server` | llama-server executable |
| `LOCAL_LLM_MMPROJ` | unset | Optional multimodal projector |

The wrapper keeps Metal offload, Flash Attention, Jinja chat templates, and the
localhost-only server behavior as generic defaults. Sampling is left to the
client or model defaults instead of embedding model-specific recommendations.

Pi's tracked `local-model` entry uses conservative text-only, non-reasoning
metadata. When a model requires a different context limit, image input, or a
specific reasoning format, update both `pi/.pi/agent/models.json` and
`server.env` as appropriate.
