// Pinned Gitleaks release (BD-08, founder decision of 2026-08-28).
//
// Gitleaks is a Go binary, not an npm package, so "pinned by version and
// checksum/digest" means: name the exact release, and verify every download
// against a SHA-256 recorded here from the release's own checksums file
// (https://github.com/gitleaks/gitleaks/releases/download/v8.30.1/gitleaks_8.30.1_checksums.txt),
// fetched and cross-checked against the downloaded artifact on 2026-08-28.
//
// Bumping the version means updating VERSION and every digest below in the
// same change, sourced from that release's own checksums file - never typed
// from memory.

export const GITLEAKS_VERSION = "8.30.1";

/** platform (Node `process.platform`) + arch (Node `process.arch`) -> release asset. */
export const GITLEAKS_ASSETS = {
  "linux-x64": {
    file: `gitleaks_${GITLEAKS_VERSION}_linux_x64.tar.gz`,
    sha256: "551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb",
  },
  "linux-arm64": {
    file: `gitleaks_${GITLEAKS_VERSION}_linux_arm64.tar.gz`,
    sha256: "e4a487ee7ccd7d3a7f7ec08657610aa3606637dab924210b3aee62570fb4b080",
  },
  "darwin-arm64": {
    file: `gitleaks_${GITLEAKS_VERSION}_darwin_arm64.tar.gz`,
    sha256: "b40ab0ae55c505963e365f271a8d3846efbc170aa17f2607f13df610a9aeb6a5",
  },
  "darwin-x64": {
    file: `gitleaks_${GITLEAKS_VERSION}_darwin_x64.tar.gz`,
    sha256: "dfe101a4db2255fc85120ac7f3d25e4342c3c20cf749f2c20a18081af1952709",
  },
};

export function assetKeyFor(platform, arch) {
  return `${platform}-${arch}`;
}
