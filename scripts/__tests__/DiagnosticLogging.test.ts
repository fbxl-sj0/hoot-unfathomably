/*
    Project: Hoot Mobile
    -------------------

    File: DiagnosticLogging.test.ts

    Purpose:

        Guard the release diagnostic logging policy.

    Responsibilities:

        - Verify the diagnostic checker runs in the strict lint gate
        - Verify current app source passes the centralized logging check
        - Verify direct app console calls are rejected

    This file intentionally does NOT contain:

        - Runtime logging helper tests
        - adb logcat integration tests
        - Remote telemetry tests
*/

import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

/* ------------------------------------------------------------------------- */
/* Diagnostic logging guard                                                  */
/* ------------------------------------------------------------------------- */

const projectRoot = path.resolve(__dirname, "..", "..");
const probePath = path.join(projectRoot, "tmp-diagnostic-logging-probe.ts");

function readPackageJson(): { scripts?: Record<string, string> } {
  return JSON.parse(
    fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"),
  ) as { scripts?: Record<string, string> };
}

function runChecker() {
  return spawnSync(
    "node",
    ["scripts/check-diagnostics.js"],
    {
      cwd: projectRoot,
      encoding: "utf8",
    },
  );
}

describe("diagnostic logging policy", () => {
  afterEach(() => {
    if (fs.existsSync(probePath)) {
      fs.unlinkSync(probePath);
    }
  });

  test("runs as part of the strict lint gate", () => {
    const packageJson = readPackageJson();

    expect(packageJson.scripts?.["lint:strict"]).toContain(
      "npm run lint:diagnostics",
    );
  });

  test("accepts the current centralized logging surface", () => {
    const result = runChecker();

    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
  });

  test("rejects direct console calls in app source", () => {
    fs.writeFileSync(
      probePath,
      [
        "/*",
        "    Project: Hoot Mobile",
        "    -------------------",
        "",
        "    File: tmp-diagnostic-logging-probe.ts",
        "*/",
        "",
        "export function probe() {",
        "  console.warn(\"drift\");",
        "}",
        "",
        "/* end of tmp-diagnostic-logging-probe.ts */",
        "",
      ].join("\n"),
    );

    const result = runChecker();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Diagnostic logging check failed");
    expect(result.stderr).toContain("tmp-diagnostic-logging-probe.ts");
    expect(result.stderr).toContain("utils/debugLog.ts");
  });
});

/* end of DiagnosticLogging.test.ts */
