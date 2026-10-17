import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { ConformanceError, reportConformance, testArtifact } from "./conformance.mjs";
import { withProcess } from "./process.mjs";

const root = process.cwd();
const artifact = resolve(root, "dist/plugin.mjs");

await reportConformance(async () => {
  await runStep("typecheck", resolve(root, "node_modules/typescript/bin/tsc"), ["--noEmit"]);
  await runStep("build", resolve(root, "node_modules/esbuild/bin/esbuild"), [
    "src/plugin.ts",
    "--bundle",
    "--platform=node",
    "--format=esm",
    "--target=node24",
    "--minify",
    "--outfile=dist/plugin.mjs",
  ]);
  const first = await digest();
  await runStep("build", resolve(root, "node_modules/esbuild/bin/esbuild"), [
    "src/plugin.ts",
    "--bundle",
    "--platform=node",
    "--format=esm",
    "--target=node24",
    "--minify",
    "--outfile=dist/plugin.mjs",
  ]);
  const second = await digest();
  if (first.hash !== second.hash || first.bytes !== second.bytes) {
    throw new ConformanceError("build is not deterministic", "build_not_deterministic");
  }
  return testArtifact(root);
});

async function runStep(label, binPath, args) {
  const exitCode = await withProcess(process.execPath, [binPath, ...args], { cwd: root }, async (child, closed) => {
    child.stdout.pipe(process.stderr, { end: false });
    child.stderr.pipe(process.stderr, { end: false });
    return closed;
  }, 120_000);
  if (exitCode !== 0) throw new ConformanceError(`${label} failed with exit code ${exitCode}`, `${label}_failed`);
}

async function digest() {
  const bytes = await readFile(artifact);
  return {
    bytes: bytes.length,
    hash: createHash("sha256").update(bytes).digest("hex"),
  };
}
