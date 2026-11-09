#!/usr/bin/env node
// Narrow Linux clipboard adapter: output images only, never text or file lists.
import path from "node:path";
const name = path.basename(process.argv[1]);
const args = process.argv.slice(2);
const typeIndex = args.findIndex(a => ["-t", "-target", "--type"].includes(a));
const type = typeIndex >= 0 ? args[typeIndex + 1] : undefined;
const listing = type === "TARGETS" || args.includes("--list-types");
const reading = args.includes("-o") || args.includes("-out") || name === "wl-paste";
if (!reading && !listing) process.exitCode = 1;
else if (!listing && type !== "image/png") process.exitCode = 1;
else {
  try {
    const response = await fetch(process.env.AGENT_CLIPBOARD_URL, {signal: AbortSignal.timeout(5000)});
    if (!response.ok || response.headers.get("content-type") !== "image/png") throw new Error("No image");
    const image = Buffer.from(await response.arrayBuffer());
    if (image.length > 10 * 1024 * 1024 || !image.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) throw new Error("Invalid image");
    process.stdout.write(listing ? "image/png\n" : image);
  } catch { process.exitCode = 1; }
}
