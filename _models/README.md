# Local inference models

This directory stores model weights used by the local llama.cpp server. GGUF
weights and partial downloads are ignored by Git; model provenance and server
configuration remain tracked.

## Initial model

| Field | Value |
|---|---|
| Model | Qwen3.5 9B |
| Quantization | Q4_K_M GGUF |
| File size | 5,680,522,464 bytes (~5.3 GiB) |
| License | Apache 2.0 |
| GGUF publisher | [unsloth/Qwen3.5-9B-GGUF](https://huggingface.co/unsloth/Qwen3.5-9B-GGUF) |
| Pinned revision | `3885219b6810b007914f3a7950a8d1b469d598a5` |
| SHA-256 | `03b74727a860a56338e042c4420bb3f04b2fec5734175f4cb9fa853daf52b7e8` |

The model is public and ungated. A Hugging Face token is not required and does
not make this download inherently faster.

Download and verify it from the repository root:

```bash
just llm-download
```

The resumable download is written to:

```text
_models/qwen3.5-9b/Qwen3.5-9B-Q4_K_M.gguf.part
```

It is renamed to `.gguf` only after the transfer finishes, then checked against
the publisher's Git LFS SHA-256.

## Why this model

Qwen3.5 9B is small enough for a quick first setup while supporting coding,
reasoning, and tool calling. The server uses it in text-only mode, so the
separate vision projector is not downloaded. Q4_K_M is intended as a setup and
iteration-friendly starting point, not necessarily the final quality target.

A natural later upgrade for sustained coding-agent work is Qwen3-Coder
30B-A3B-Instruct. Its Q4_K_M GGUF is roughly 17.3 GiB and is well within the
machine's 128 GiB unified-memory capacity.

## Runtime defaults

The tracked server wrapper at `llama/.local/bin/local-llm` uses:

- localhost only: `127.0.0.1:8080`
- one inference slot
- 128K context
- all model layers eligible for Metal offload
- Flash Attention
- the model's Jinja chat template for tool calls
- Qwen's recommended thinking-mode sampling values for precise coding

Override the repository or model path without editing the wrapper:

```bash
LOCAL_LLM_REPO=/path/to/dev local-llm server
LOCAL_LLM_MODEL=/path/to/model.gguf local-llm server
```

These environment overrides are most useful for manual foreground runs. A
`launchd` service does not inherit arbitrary interactive shell variables; edit
the tracked wrapper when changing its persistent defaults. Its plist is
installed at `$XDG_CONFIG_HOME/llama/com.hrmnjt.llama-server.plist` (default:
`~/.config/llama/`) and bootstrapped from that path on demand.
