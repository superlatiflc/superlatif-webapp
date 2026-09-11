// Lints every PHP file of the WordPress bridge plugin and runs its own tests (ADR-072).
//
// Uses the system `php` when present (CI: ubuntu-latest ships it). Without
// one, falls back to the pinned WebAssembly build of PHP from npm, so the
// check is runnable on a machine with no PHP installed. Deliberately not
// part of `verify`: that fallback downloads a package, and `verify` must
// work offline.

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const pluginDir = path.join(root, "wordpress-plugins", "superlatif-app-bridge");

const hasSystemPhp = spawnSync("php", ["-v"], { stdio: "ignore" }).status === 0;
const [command, ...prefix] = hasSystemPhp ? ["php"] : ["npx", "--yes", "@php-wasm/cli@3.1.53"];

function php(args, options = {}) {
  execFileSync(command, [...prefix, ...args], { stdio: "inherit", ...options });
}

function phpFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return phpFiles(full);
    return entry.name.endsWith(".php") ? [full] : [];
  });
}

console.log(`test:wp-bridge: using ${hasSystemPhp ? "system php" : "@php-wasm/cli (no system php found)"}`);
for (const file of phpFiles(pluginDir)) php(["-l", path.relative(pluginDir, file)], { cwd: pluginDir });
php(["tests/run.php"], { cwd: pluginDir });
