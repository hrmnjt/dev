# syntax=docker/dockerfile:1
ARG NODE_IMAGE
FROM ${NODE_IMAGE}
ENV DEBIAN_FRONTEND=noninteractive PLAYWRIGHT_BROWSERS_PATH=/opt/playwright \
    DISABLE_AUTOUPDATER=1 AMP_SKIP_UPDATE_CHECK=1
RUN apt-get update && apt-get install -y --no-install-recommends \
    bash ca-certificates curl git gh ripgrep fd-find jq python3 python3-venv \
    unzip util-linux procps less openssh-client bindfs fuse3 sudo \
    && rm -rf /var/lib/apt/lists/* \
    && ln -s /usr/bin/fdfind /usr/local/bin/fd
COPY pins.json /opt/agent-pins.json
RUN node -e 'const p=require("/opt/agent-pins.json");require("node:child_process").execFileSync("npm",["install","-g","@anthropic-ai/claude-code@"+p.claude,"@ampcode/cli@"+p.amp,"playwright@"+p.playwright],{stdio:"inherit"})'
RUN playwright install --with-deps chromium && chmod -R a+rX /opt/playwright \
    && test "$(id -u node)" = 1000 \
    && usermod --login agent --home /home/agent --move-home --shell /bin/bash node \
    && groupmod --new-name agent node \
    && mkdir -p /agent-state /etc/agent-config /home/agent/.claude /home/agent/.pi \
    && chmod 755 /agent-state
# Guest root is disposable and host protections are enforced host-side, so the
# agent may install guest packages without asking. Keep Gondolin's CA variables
# so sudo npm/pip/curl still trust its HTTPS interception.
RUN printf '%s\n' 'Defaults:agent env_keep += "SSL_CERT_FILE CURL_CA_BUNDLE REQUESTS_CA_BUNDLE NODE_EXTRA_CA_CERTS"' \
      'agent ALL=(ALL:ALL) NOPASSWD: ALL' > /etc/sudoers.d/agent \
    && chmod 0440 /etc/sudoers.d/agent && visudo -cf /etc/sudoers.d/agent
COPY guest/clipboard.mjs /usr/local/lib/agent-clipboard.mjs
COPY guest/agent-enter /usr/local/bin/agent-enter
COPY guest/check-clis.mjs /usr/local/lib/agent-check-clis.mjs
RUN chmod 755 /usr/local/bin/agent-enter /usr/local/lib/agent-clipboard.mjs \
    && ln -s /usr/local/lib/agent-clipboard.mjs /usr/local/bin/xclip \
    && ln -s /usr/local/lib/agent-clipboard.mjs /usr/local/bin/wl-paste \
    && node /usr/local/lib/agent-check-clis.mjs
# Gondolin's macOS build extracts this image with non-root bsdtar, which drops
# setuid/setgid/sticky bits and applies the umask. Record those modes for the
# launcher to restore at boot; sudo must be among them.
RUN find / -xdev \( -path /home -o -path /etc/agent-config -o -path /agent-state \) -prune \
      -o \( -type f -o -type d \) -perm /7022 -printf '%m\t%p\n' > /etc/agent-image-modes \
    && awk -F '\t' '$1 == "4755" && $2 == "/usr/bin/sudo" {found = 1} END {exit !found}' /etc/agent-image-modes
COPY agent-image.json /etc/agent-image.json
ENV HOME=/home/agent PATH=/usr/local/bin:/usr/bin:/bin \
    AMP_FORCE_BEL=1
WORKDIR /home/agent
