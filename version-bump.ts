import { readFileSync, writeFileSync } from "fs";

interface ManifestJson {
  version: string;
  minAppVersion: string;
  [key: string]: unknown;
}

const targetVersion = process.env.npm_package_version;
if (!targetVersion) {
  throw new Error("npm_package_version environment variable is not defined.");
}

// Update manifest.json
const manifestPath = "manifest.json";
const manifestUnknown = JSON.parse(readFileSync(manifestPath, "utf8")) as unknown;
const manifest = manifestUnknown as ManifestJson;
manifest.version = targetVersion;
writeFileSync(manifestPath, JSON.stringify(manifest, null, "\t"));

// Update versions.json
const versionsPath = "versions.json";
const versionsUnknown = JSON.parse(readFileSync(versionsPath, "utf8")) as unknown;
const versions = versionsUnknown as Record<string, string>;
versions[targetVersion] = manifest.minAppVersion;
writeFileSync(versionsPath, JSON.stringify(versions, null, "\t"));
