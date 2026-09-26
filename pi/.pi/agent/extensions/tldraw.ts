/**
 * Narrow host bridge to tldraw offline's authenticated local canvas API.
 * Model-facing shell and files remain in Gondolin; the token never enters the VM.
 */
import fs from "node:fs/promises";
import { constants } from "node:fs";
import { createHash } from "node:crypto";
import http from "node:http";
import os from "node:os";
import path from "node:path";

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const APP_DIR = path.join(os.homedir(), "Library", "Application Support", "tldraw");
const SERVER_FILE = path.join(APP_DIR, "server.json");
const SKILL_FILE = path.join(os.homedir(), ".pi", "agent", "skills", "tldraw-offline", "SKILL.md");
const MAX_CODE = 32_000;
const MAX_RESPONSE = 128_000;
const MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 20_000;
const SCREENSHOT_DIR = path.join(os.tmpdir(), "tldraw-agent-api");

async function connection(): Promise<{ port: number; token: string }> {
  let data: unknown;
  try {
    data = JSON.parse(await fs.readFile(SERVER_FILE, "utf8"));
  } catch {
    throw new Error("tldraw is not connected: open the desktop app and check its server.json");
  }
  if (!data || typeof data !== "object") throw new Error("Invalid tldraw server.json");
  const { port, token } = data as Record<string, unknown>;
  if (!Number.isInteger(port) || (port as number) < 1 || (port as number) > 65535 ||
      typeof token !== "string" || !token) {
    throw new Error("Invalid tldraw port or token in server.json");
  }
  return { port: port as number, token };
}

function validateCode(code: string): void {
  if (!code.trim() || Buffer.byteLength(code, "utf8") > MAX_CODE) {
    throw new Error(`JavaScript must be nonempty and at most ${MAX_CODE} bytes`);
  }
}

function request(endpoint: string, code: string, signal?: AbortSignal): Promise<string> {
  return connection().then(({ port, token }) => new Promise((resolve, reject) => {
    // http.request does not follow redirects, consult proxies, or resolve arbitrary hosts.
    const body = JSON.stringify({ code });
    const req = http.request({
      hostname: "127.0.0.1",
      port,
      path: endpoint,
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "content-length": Buffer.byteLength(body),
      },
      signal,
      timeout: REQUEST_TIMEOUT_MS,
    }, (res) => {
      const chunks: Buffer[] = [];
      let size = 0;
      res.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_RESPONSE) {
          req.destroy(new Error("tldraw response too large"));
        } else {
          chunks.push(chunk);
        }
      });
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`tldraw HTTP ${res.statusCode}: ${text.slice(0, 2000)}`));
          return;
        }
        let data: unknown;
        try {
          data = JSON.parse(text);
        } catch {
          reject(new Error("tldraw returned invalid JSON"));
          return;
        }
        if (data && typeof data === "object" && "success" in data && data.success === false) {
          reject(new Error(`tldraw request failed: ${text.slice(0, 2000)}`));
          return;
        }
        resolve(text);
      });
    });
    req.on("timeout", () => req.destroy(new Error("tldraw request timed out")));
    req.on("error", reject);
    req.end(body);
  }));
}

function result(text: string) {
  return { content: [{ type: "text" as const, text }], details: undefined };
}

function validateDocId(docId: string): void {
  if (!docId || docId.length > 2048 || /[\x00-\x1f]/.test(docId)) {
    throw new Error("Invalid document id");
  }
}

async function readScreenshot(filePath: string, docId: string): Promise<Buffer> {
  // Only accept the JPEG returned for THIS document by tldraw's screenshot
  // endpoint, directly below its own temp directory. No model-supplied paths.
  // The current app hashes the opaque id so even ids containing '/' make a
  // legal filename. Older builds used the raw id; accept either exact form.
  const hash = createHash("sha256").update(docId).digest("hex").slice(0, 12);
  const prefixes = [`screenshot-${hash}-`, `screenshot-${docId}-`];
  const fileName = path.basename(filePath);
  if (!path.isAbsolute(filePath) || path.resolve(filePath) !== filePath ||
      !prefixes.some(prefix => fileName.startsWith(prefix) &&
        /^\d{10,17}\.jpg$/.test(fileName.slice(prefix.length)))) {
    throw new Error("tldraw returned an unexpected screenshot path");
  }

  const [dir, file, stat, dirStat] = await Promise.all([
    fs.realpath(SCREENSHOT_DIR), fs.realpath(filePath),
    fs.lstat(filePath), fs.lstat(SCREENSHOT_DIR),
  ]);
  if (!dirStat.isDirectory() || dirStat.isSymbolicLink() ||
      !stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 ||
      path.dirname(file) !== dir || stat.size < 3 || stat.size > MAX_SCREENSHOT_BYTES) {
    throw new Error("tldraw screenshot is not a regular JPEG under the app temp directory");
  }

  const handle = await fs.open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.nlink !== 1 || opened.size < 3 ||
        opened.size > MAX_SCREENSHOT_BYTES || opened.dev !== stat.dev ||
        opened.ino !== stat.ino) {
      throw new Error("tldraw screenshot changed or exceeds 10 MiB");
    }
    const bytes = await handle.readFile();
    if (bytes.length > MAX_SCREENSHOT_BYTES || bytes[0] !== 0xff ||
        bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
      throw new Error("tldraw screenshot is not a valid-size JPEG");
    }
    return bytes;
  } finally {
    await handle.close();
  }
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "tldraw_guide",
    label: "tldraw guide",
    description: "Read the app-installed tldraw-offline skill from the host. Call this before using tldraw. Its curl/tq and temp-file instructions are HOST-only; use tldraw_search, tldraw_exec, and tldraw_screenshot instead because bash runs in Gondolin.",
    parameters: Type.Object({}),
    async execute() {
      // A fixed file, not a user-supplied path; never expose the host filesystem generally.
      const text = await fs.readFile(SKILL_FILE, "utf8");
      if (Buffer.byteLength(text) > MAX_RESPONSE) throw new Error("tldraw skill is too large");
      return result(text);
    },
  });

  pi.registerTool({
    name: "tldraw_search",
    label: "tldraw search",
    description: "Run JavaScript in tldraw's /api/search with the `api` object to discover documents, inspect shapes/bindings, and read recipes. Read tldraw_guide first. Never print or request the bearer token. Select the intended doc by name, not the first open doc.",
    parameters: Type.Object({ code: Type.String({ description: "JavaScript using `api`; return a JSON-serializable result." }) }),
    async execute(_id, { code }, signal) {
      validateCode(code);
      return result(await request("/api/search", code, signal));
    },
  });

  pi.registerTool({
    name: "tldraw_exec",
    label: "tldraw exec",
    description: "Run JavaScript on ONE explicitly selected open tldraw document via /api/doc/:id/exec (editor, helpers). Can change the canvas and run code in the app; inspect doc name/ownership/shapes with tldraw_search before writing. Save local saved documents with helpers.saveDoc(); verify afterward. Do not guess document IDs.",
    parameters: Type.Object({
      docId: Type.String({ description: "Exact opaque id returned by api.getDocs() for the intended document." }),
      code: Type.String({ description: "JavaScript using `editor` and `helpers`; return a JSON-serializable result." }),
    }),
    async execute(_id, { docId, code }, signal) {
      validateDocId(docId);
      validateCode(code);
      // The app matches the literal colon-separated id in the URL path rather
      // than decoding %3A. Encode other URL-unsafe characters, but keep colons.
      const pathId = encodeURIComponent(docId).replace(/%3A/gi, ":");
      return result(await request(`/api/doc/${pathId}/exec`, code, signal));
    },
  });

  pi.registerTool({
    name: "tldraw_screenshot",
    label: "tldraw screenshot",
    description: "Capture a JPEG of ONE explicitly selected open tldraw canvas and return it as an image (not a host path). Select the doc by name with tldraw_search first. Use for visual checks; shape records remain better for exact geometry. Requires a model with image input. Canvas mode fits shapes; window mode includes app chrome.",
    parameters: Type.Object({
      docId: Type.String({ description: "Exact opaque id from api.getDocs() for the intended document." }),
      size: Type.Optional(Type.Union([
        Type.Literal("small"), Type.Literal("medium"), Type.Literal("large"),
      ], { description: "Image size; defaults to medium." })),
      mode: Type.Optional(Type.Union([
        Type.Literal("canvas"), Type.Literal("window"),
      ], { description: "Canvas shapes only (default), or whole app window." })),
      bounds: Type.Optional(Type.Object({
        x: Type.Number(), y: Type.Number(), w: Type.Number(), h: Type.Number(),
      }, { description: "Optional page-coordinate crop; canvas mode only." })),
    }),
    async execute(_id, { docId, size = "medium", mode = "canvas", bounds }, signal, _onUpdate, ctx) {
      validateDocId(docId);
      if (ctx.model && !ctx.model.input.includes("image")) {
        throw new Error("Select a model with image input before capturing a tldraw screenshot");
      }
      if (bounds && (mode !== "canvas" ||
          !Object.values(bounds).every(n => Number.isFinite(n) && Math.abs(n) <= 1e7) ||
          bounds.w <= 0 || bounds.h <= 0)) {
        throw new Error("Screenshot crop needs finite page coordinates and positive dimensions in canvas mode");
      }
      const options = { size, mode, ...(bounds ? { bounds } : {}) };
      const response = JSON.parse(await request("/api/search",
        `return await api.getScreenshot(${JSON.stringify(docId)}, ${JSON.stringify(options)})`, signal));
      const shot = response?.result;
      if (!shot || typeof shot.filePath !== "string") {
        throw new Error("tldraw did not return a screenshot file");
      }
      const bytes = await readScreenshot(shot.filePath, docId);
      return {
        content: [
          { type: "text" as const, text: JSON.stringify({
            docId, pageName: shot.pageName, width: shot.width, height: shot.height,
            captureMode: shot.captureMode,
          }) },
          { type: "image" as const, data: bytes.toString("base64"), mimeType: "image/jpeg" },
        ],
        details: undefined,
      };
    },
  });
}
