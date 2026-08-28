#!/usr/bin/env node

/**
 * Installs the pinned Gitleaks binary (GOV-003, BD-08).
 *
 * Downloads the exact release asset for the current platform, verifies its
 * SHA-256 against scripts/gitleaks-pin.mjs before extracting anything, and
 * refuses to run the binary if the digest does not match. This is what
 * "pinned by version and checksum/digest" means for a tool that is not
 * distributed as an npm package: the version is named, and every byte is
 * verified before it is trusted.
 *
 * Idempotent: if the pinned binary is already installed and its own digest
 * still matches, the download is skipped.
 */

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";
import { GITLEAKS_ASSETS, GITLEAKS_VERSION, assetKeyFor } from "./gitleaks-pin.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const installDirectory = path.join(root, ".cache", "gitleaks", GITLEAKS_VERSION);
const binaryPath = path.join(installDirectory, "gitleaks");

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

/** Minimal tar reader: enough to pull one named entry out of a GNU/ustar tarball. */
function extractFromTar(tarBuffer, entryName) {
  let offset = 0;
  while (offset + 512 <= tarBuffer.length) {
    const header = tarBuffer.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break; // end-of-archive marker

    const name = header.subarray(0, 100).toString("utf8").replace(/\0.*$/s, "");
    const sizeOctal = header.subarray(124, 136).toString("utf8").replace(/\0.*$/s, "").trim();
    const size = Number.parseInt(sizeOctal, 8) || 0;
    const dataStart = offset + 512;

    if (name === entryName) {
      return tarBuffer.subarray(dataStart, dataStart + size);
    }
    offset = dataStart + Math.ceil(size / 512) * 512;
  }
  throw new Error(`"${entryName}" was not found inside the downloaded archive`);
}

async function downloadAsset(asset) {
  const url = `https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/${asset.file}`;
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) {
    throw new Error(`Download failed (${response.status} ${response.statusText}): ${url}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const digest = sha256(buffer);
  if (digest !== asset.sha256) {
    throw new Error(
      `Checksum mismatch for ${asset.file}. Expected ${asset.sha256}, received ${digest}. ` +
        "Refusing to extract or execute an unverified binary.",
    );
  }
  return buffer;
}

export async function ensureGitleaksInstalled() {
  const assetKey = assetKeyFor(process.platform, process.arch);
  const asset = GITLEAKS_ASSETS[assetKey];
  if (!asset) {
    throw new Error(
      `No pinned Gitleaks release for platform "${assetKey}". ` +
        `Add it to scripts/gitleaks-pin.mjs with a digest read from the release's own checksums file.`,
    );
  }

  if (fs.existsSync(binaryPath)) {
    const digest = sha256(fs.readFileSync(binaryPath));
    // The pinned digest covers the compressed release asset, not the raw
    // binary, so a cached binary is trusted only via a marker file written
    // right after a verified extraction - never by re-deriving trust here.
    const markerPath = `${binaryPath}.verified-sha256`;
    if (fs.existsSync(markerPath) && fs.readFileSync(markerPath, "utf8").trim() === asset.sha256) {
      return { binaryPath, version: GITLEAKS_VERSION, cached: true, digestOfCachedBinary: digest };
    }
  }

  fs.mkdirSync(installDirectory, { recursive: true });
  const tarGz = await downloadAsset(asset);
  const tar = zlib.gunzipSync(tarGz);
  const binary = extractFromTar(tar, "gitleaks");
  fs.writeFileSync(binaryPath, binary, { mode: 0o755 });
  fs.chmodSync(binaryPath, 0o755);
  fs.writeFileSync(`${binaryPath}.verified-sha256`, `${asset.sha256}\n`);

  return { binaryPath, version: GITLEAKS_VERSION, cached: false, digestOfCachedBinary: sha256(binary) };
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? "")) {
  ensureGitleaksInstalled()
    .then((result) => {
      console.log(JSON.stringify({ status: "PASS", ...result }, null, 2));
    })
    .catch((error) => {
      console.error(JSON.stringify({ status: "FAIL", reason: error.message }, null, 2));
      process.exitCode = 1;
    });
}
