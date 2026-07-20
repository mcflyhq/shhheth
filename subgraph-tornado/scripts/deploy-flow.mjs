/**
 * Deploy a recent-startBlock copy for flow.shhheth windows (24h / 7d).
 * Leaves subgraph.yaml untouched for the full-history 0.2.0 deploy.
 */
import { readFileSync, writeFileSync, copyFileSync, unlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const yamlPath = join(root, "subgraph.yaml");
const bakPath = join(root, "subgraph.yaml.flowbak");

// ~3 weeks of mainnet history is enough for 7d windows with margin.
const FLOW_START = 25_400_000;

copyFileSync(yamlPath, bakPath);
try {
  const yaml = readFileSync(yamlPath, "utf8").replace(
    /startBlock:\s*\d+/g,
    `startBlock: ${FLOW_START}`,
  );
  writeFileSync(yamlPath, yaml);
  const build = spawnSync("pnpm", ["build"], { cwd: root, stdio: "inherit" });
  if (build.status !== 0) process.exit(build.status ?? 1);
  const deploy = spawnSync(
    "goldsky",
    ["subgraph", "deploy", "shhheth-tornado-flow/1.0.0", "--path", "."],
    { cwd: root, stdio: "inherit" },
  );
  if (deploy.status !== 0) process.exit(deploy.status ?? 1);
} finally {
  copyFileSync(bakPath, yamlPath);
  unlinkSync(bakPath);
  spawnSync("pnpm", ["build"], { cwd: root, stdio: "inherit" });
}
