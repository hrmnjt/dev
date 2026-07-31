/**
 * Clipboard Image Attachment
 *
 * Pi's Ctrl+V image handler writes clipboard bytes to a host temporary file and
 * inserts that file's path into the editor. Gondolin-routed tools cannot read
 * the host temp directory, so convert only Pi-generated clipboard temp paths
 * into image attachments before the prompt reaches the model.
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const MAX_CLIPBOARD_IMAGE_BYTES = 50 * 1024 * 1024;
const UUID_PATTERN =
  "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const CLIPBOARD_FILE_NAME_PATTERN = new RegExp(
  `^pi-clipboard-${UUID_PATTERN}\\.(png|jpe?g|gif|webp)$`,
  "i",
);

const MIME_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

type ImageContent = {
  type: "image";
  data: string;
  mimeType: string;
};

type ClipboardTransformResult = {
  text: string;
  images: ImageContent[];
  attachedPaths: string[];
  failedPaths: string[];
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function clipboardPathPattern(tempDir: string): RegExp {
  const prefix = `${path.join(tempDir, "pi-clipboard-")}`;
  return new RegExp(
    `${escapeRegExp(prefix)}${UUID_PATTERN}\\.(?:png|jpe?g|gif|webp)`,
    "gi",
  );
}

function mimeTypeFor(filePath: string): string | null {
  return MIME_TYPES[path.extname(filePath).slice(1).toLowerCase()] ?? null;
}

async function readClipboardImage(
  filePath: string,
  tempDir: string,
): Promise<ImageContent> {
  const resolvedTempDir = path.resolve(tempDir);
  const resolvedPath = path.resolve(filePath);
  const fileName = path.basename(resolvedPath);

  if (
    path.dirname(resolvedPath) !== resolvedTempDir ||
    !CLIPBOARD_FILE_NAME_PATTERN.test(fileName)
  ) {
    throw new Error("not a Pi clipboard image path");
  }

  const [realTempDir, realPath, stat] = await Promise.all([
    fs.realpath(resolvedTempDir),
    fs.realpath(resolvedPath),
    fs.lstat(resolvedPath),
  ]);

  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    path.dirname(realPath) !== realTempDir
  ) {
    throw new Error("clipboard image is not a regular temp file");
  }
  if (stat.size > MAX_CLIPBOARD_IMAGE_BYTES) {
    throw new Error("clipboard image exceeds the 50 MiB limit");
  }

  const mimeType = mimeTypeFor(realPath);
  if (!mimeType) throw new Error("unsupported clipboard image type");

  const data = await fs.readFile(realPath);
  return { type: "image", data: data.toString("base64"), mimeType };
}

export async function transformClipboardImagePaths(
  text: string,
  existingImages: ImageContent[] = [],
  tempDir = os.tmpdir(),
): Promise<ClipboardTransformResult> {
  const paths = [...new Set(text.match(clipboardPathPattern(tempDir)) ?? [])];
  if (paths.length === 0) {
    return {
      text,
      images: existingImages,
      attachedPaths: [],
      failedPaths: [],
    };
  }

  let transformedText = text;
  const images = [...existingImages];
  const attachedPaths: string[] = [];
  const failedPaths: string[] = [];

  for (const filePath of paths) {
    try {
      const image = await readClipboardImage(filePath, tempDir);
      images.push(image);
      attachedPaths.push(filePath);
      transformedText = transformedText.replaceAll(
        filePath,
        "[Clipboard image attached]",
      );
      await fs.unlink(filePath).catch(() => {});
    } catch {
      failedPaths.push(filePath);
      transformedText = transformedText.replaceAll(
        filePath,
        "[Clipboard image unavailable]",
      );
    }
  }

  return {
    text: transformedText,
    images,
    attachedPaths,
    failedPaths,
  };
}

export default function (pi: ExtensionAPI) {
  pi.on("input", async (event, ctx) => {
    // Only explicit input from the interactive editor may resolve a host path.
    if (event.source !== "interactive") return { action: "continue" };

    const result = await transformClipboardImagePaths(
      event.text,
      event.images as ImageContent[] | undefined,
    );

    if (result.failedPaths.length > 0) {
      ctx.ui.notify(
        `Could not attach ${result.failedPaths.length} clipboard image${result.failedPaths.length === 1 ? "" : "s"}`,
        "warning",
      );
    }
    if (result.attachedPaths.length === 0 && result.failedPaths.length === 0) {
      return { action: "continue" };
    }

    if (
      result.attachedPaths.length > 0 &&
      ctx.model &&
      !ctx.model.input.includes("image")
    ) {
      ctx.ui.notify(
        `Attached ${result.attachedPaths.length} clipboard image${result.attachedPaths.length === 1 ? "" : "s"}, but the current model does not advertise image input`,
        "warning",
      );
    }

    return {
      action: "transform",
      text: result.text,
      images: result.images,
    };
  });
}
