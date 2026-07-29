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
    └── llama-router                  # router command and HF token discovery

_models/                              # existing local GGUF weights, not Stowed
~/.cache/huggingface/token            # optional host-local Hugging Face token
~/.pi/agent/auth.json                 # Pi's host-local router connection
```

Pi-initiated downloads use llama.cpp's cache. The `_models/` directory remains
available through `--models-dir` for manually downloaded weights.

## Install and deploy

Pi 0.81 or later and a current llama.cpp build with router support are required.
The Homebrew package is tracked in `Brewfile`:

```bash
just brewinst
brew upgrade llama.cpp # when upgrading an existing machine
just stowall
```

The plist remains under `~/.config/llama` rather than
`~/Library/LaunchAgents`. macOS does not discover it automatically, but this
avoids requiring terminal permission to install login items. Bootstrap it once
per login session when local inference is needed:

```bash
launchctl bootstrap "gui/$(id -u)" \
  "$HOME/.config/llama/com.hrmnjt.llama-server.plist"
```

To reload an already bootstrapped service:

```bash
launchctl kickstart -k "gui/$(id -u)/com.hrmnjt.llama-server"
```

When migrating from the old `local-llm` controller, remove its obsolete Stow
links and host-local active-model configuration once the old service is stopped:

```bash
launchctl bootout "gui/$(id -u)/com.hrmnjt.llama-server" 2>/dev/null || true
rm -f \
  "$HOME/.local/bin/local-llm" \
  "$HOME/.config/llama/server.env.example" \
  "$HOME/.config/llama/server.env" \
  "$HOME/.pi/agent/models.json"
just stowall
launchctl bootstrap "gui/$(id -u)" \
  "$HOME/.config/llama/com.hrmnjt.llama-server.plist"
```

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
- no web UI

The model context reported to Pi comes from the loaded llama.cpp instance, so
there is no separate Pi metadata to synchronize. Use a
[llama.cpp model preset](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md#model-presets)
when a model needs a different context size or other per-model options.

Local model groups must be directly below `_models/`:

```text
_models/
├── qwen3.5-9b/
│   └── Qwen3.5-9B-Q4_K_M.gguf
└── qwen3-coder-next-q5-k-m/
    ├── Qwen3-Coder-Next-Q5_K_M-00001-of-00004.gguf
    ├── Qwen3-Coder-Next-Q5_K_M-00002-of-00004.gguf
    ├── Qwen3-Coder-Next-Q5_K_M-00003-of-00004.gguf
    └── Qwen3-Coder-Next-Q5_K_M-00004-of-00004.gguf
```

Restart the router after manually adding or moving files. Downloads made through
Pi's `/llama` command are registered by the router automatically.

## Service checks

```bash
# launchd state
launchctl print "gui/$(id -u)/com.hrmnjt.llama-server"

# bootstrap is asynchronous, so retry while the router starts
curl --fail --retry 20 --retry-connrefused --retry-delay 1 \
  http://127.0.0.1:8080/health
curl --fail http://127.0.0.1:8080/models

# logs
tail -n 100 -f "$HOME/Library/Logs/llama-server.log"

# restart
launchctl kickstart -k "gui/$(id -u)/com.hrmnjt.llama-server"

# stop until it is explicitly bootstrapped again
launchctl bootout "gui/$(id -u)/com.hrmnjt.llama-server"
```

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
unrelated edits. Timing details from llama.cpp are available with:

```bash
tail -n 300 "$HOME/Library/Logs/llama-server.log" |
  rg 'prompt eval|eval time|tokens per second'
```
