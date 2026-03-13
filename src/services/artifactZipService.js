import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

async function ensureDirsAndWrite(root, files) {
  for (const [name, content] of Object.entries(files || {})) {
    const safeName = String(name || "").replace(/^\/+/, "");
    const target = join(root, safeName);
    const dir = dirname(target);
    if (dir !== root) {
      await mkdir(dir, { recursive: true });
    }
    await writeFile(target, String(content ?? ""));
  }
}

export async function buildArtifactZip({ bundle, basename = "artifact-bundle" }) {
  if (!bundle || typeof bundle !== "object") throw new Error("bundle is required");
  const files = bundle.files || {};
  if (!Object.keys(files).length) throw new Error("bundle has no files");

  const root = await mkdtemp(join(tmpdir(), "elo-artifact-bundle-"));
  const zipPath = join(root, `${basename}.zip`);

  try {
    await ensureDirsAndWrite(root, files);
    await execFile("zip", ["-qr", zipPath, ...Object.keys(files)], { cwd: root });
    const data = await readFile(zipPath);
    return {
      filename: `${basename}.zip`,
      contentType: "application/zip",
      data
    };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
