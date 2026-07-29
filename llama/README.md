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
just brewinst
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

See the [Pi package guide](../pi/README.md#local-llamacpp-models) for `/login`,
`/llama`, and `/model` usage.

## Appendix: evaluate a new model

Use this short suite after downloading a new model to check inference, tool use,
instruction following, and basic coding ability. Load the candidate with
`/llama`, select it with `/model`, and start a fresh session with `/new` before
testing.

First confirm the router state from a host terminal:

```bash
curl -s http://127.0.0.1:8080/models |
  jq -r '.data[] | "\(.id): \(.status.value)"'
```

The candidate must report `loaded`.

### 1. Basic inference

```text
Reply with exactly this text and nothing else: LOCAL_MODEL_OK
```

Pass when the response is exactly `LOCAL_MODEL_OK`, without commentary or
formatting.

### 2. File reading and grounded answers

Run from this repository:

```text
Do not modify files. Read README.md and report its top-level heading. Quote the
exact heading and include its file path.
```

Pass when the model uses the read tool and reports the exact heading from
`README.md` without editing anything.

### 3. Search and uncertainty

```text
Do not modify files. Determine whether this repository configures llama.cpp's
sleep-idle-seconds option. Search the repository and answer only from evidence.
If it is absent, say that it is not configured.
```

Pass when the model searches before answering, reports that the option is not
configured, and does not invent a setting.

### 4. Gondolin awareness

```text
Check whether the host llama.cpp router is healthy and list its loaded models.
Remember that your bash tool runs inside Gondolin.
```

Pass when the model recognizes that its sandbox cannot query the host's
`127.0.0.1:8080`, explains the limitation, and asks for a host-side check. It
must not claim to have observed router state that it cannot access.

### 5. Disposable coding test

Create a small failing project from a host terminal:

```bash
work=$(mktemp -d)
cd "$work"
mkdir -p src test

cat > package.json <<'EOF'
{
  "type": "module",
  "scripts": { "test": "node --test" }
}
EOF

cat > README.md <<'EOF'
# Shopping cart

`total(items)` calculates the final cart price.

- Apply a 10% discount when the subtotal is at least $100.
- Apply 8% tax after the discount.
- Round the result to cents.
- Do not mutate the input array.
EOF

cat > src/cart.js <<'EOF'
export function total(items) {
  items.sort((a, b) => b.price - a.price);
  const subtotal = items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );
  const discounted = subtotal > 100 ? subtotal * 0.9 : subtotal;
  return Math.round(discounted * 1.08 * 100) / 100;
}
EOF

cat > test/cart.test.js <<'EOF'
import assert from "node:assert/strict";
import test from "node:test";
import { total } from "../src/cart.js";

test("discount applies at exactly $100", () => {
  assert.equal(total([{ price: 50, quantity: 2 }]), 97.2);
});

test("does not mutate its input", () => {
  const items = [
    { price: 10, quantity: 1 },
    { price: 20, quantity: 2 },
  ];
  const original = structuredClone(items);
  total(items);
  assert.deepEqual(items, original);
});
EOF

git init -q
git add .
pi
```

Then prompt the candidate:

```text
Fix all test failures. Only edit src/cart.js, do not weaken or modify the tests,
run the complete test suite, and summarize the changes.
```

Pass when the model:

- runs the tests and observes the failures
- changes the discount condition from `>` to `>=`
- avoids mutating `items`, normally by removing the unnecessary sort
- edits only `src/cart.js`
- reruns the complete test suite successfully

Verify independently from the host terminal:

```bash
npm test
git diff -- src/cart.js
git diff -- test
```

The final command should produce no test-file diff. Remove the disposable project
when finished:

```bash
cd ~
test -n "$work" && rm -rf -- "$work"
```

### Compare results

Run the same prompts in fresh sessions for each candidate. Record pass/fail,
approximate response time, unnecessary tool calls, unsupported claims, and
unrelated edits. Quality and instruction-following matter more than raw speed;
a larger or less-quantized model is useful only if its improvement justifies
its memory use and latency.

### Monitor performance and capacity

llama.cpp writes router and model-worker output to one append-only log:

```bash
log="$HOME/Library/Logs/llama-server.log"
```

Router-mode worker lines start with an internal port such as `[57013]`. The
following timestamp is elapsed worker time, not wall-clock time. `slot id` is an
inference slot and `task` identifies one request. A single Pi turn can create
multiple tasks when the model calls tools.

Watch completed prompt-processing and generation timings live:

```bash
tail -F "$log" |
  rg --line-buffered 'prompt processing|prompt eval time|\| +eval time|total time'
```

Show the most recent completed requests:

```bash
rg 'prompt eval time|\| +eval time|total time' "$log" | tail -n 30
```

The two important measurements are:

- `prompt eval time`: input processing. Large prompts on the current models are
  expected to process much faster than output is generated.
- `eval time`: output generation. The final `tokens per second` value is the
  most useful speed comparison between models.

Average generation speed over the last 20 completed requests:

```bash
rg '\| +eval time =' "$log" |
  tail -n 20 |
  sed -E 's/.*,[[:space:]]*([0-9.]+) tokens per second.*/\1/' |
  awk '{ total += $1 } END {
    if (NR) printf "generation: %.2f tokens/s (%d requests)\n", total / NR, NR
  }'
```

Prompt-processing rates vary more for small requests because fixed overhead
dominates. Later agent requests may evaluate only a small suffix because
llama.cpp reuses the conversation's KV-cache.

Monitor the router and model-worker processes from another host terminal:

```bash
ps -axo pid,rss,%cpu,etime,command | rg '[l]lama-server'
memory_pressure -Q
sysctl vm.swapusage
```

`rss` is in KiB and is only a rough process-memory measure on Apple Silicon;
Metal uses unified memory. `memory_pressure` and swap growth are better signals
that a model is too large. Activity Monitor can provide an easier visual check
of Memory Pressure while loading and using a candidate.

Check total model-cache size and look for load or memory errors:

```bash
du -sh _models
find _models -type f -name '*.gguf' -exec du -h {} +
rg -i 'error|failed|out of memory|metal' "$log" | tail -n 30
```

For a fair comparison:

1. Use `/llama` to unload other models so they do not consume memory.
2. Load one candidate and select it with `/model`.
3. Start a fresh Pi session with `/new`.
4. Mark the log, then run the same evaluation prompts:

   ```bash
   printf '\n===== %s · %s =====\n' \
     "$(date '+%Y-%m-%dT%H:%M:%S%z')" '<model-id>' >>"$log"
   ```

5. Record test pass/fail, generation tokens/second, memory pressure, and swap.
6. Unload the candidate before loading the next one. Unloading and reloading
   also resets that worker's KV-cache.

A bigger model is practical when it loads without Metal or allocation errors,
does not push sustained memory pressure into the warning/critical range, avoids
significant swap growth, and remains fast enough for interactive use. GGUF file
size is only the baseline: the model also needs context/KV-cache and runtime
working memory. The shared 32K context can therefore make actual memory use
several GiB larger than the weights alone.

The log has no automatic rotation. To discard old entries safely, stop the
router, truncate the file, and bootstrap it again. This also clears the old
single-model logs after this migration:

```bash
llm stop
mkdir -p "$HOME/Library/Logs"
: >"$HOME/Library/Logs/llama-server.log"
llm start
```
