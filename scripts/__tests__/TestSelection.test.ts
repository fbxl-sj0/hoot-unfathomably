/*
    Project: Hoot Mobile
    -------------------

    File: TestSelection.test.ts

    Purpose:

        Guard the release test-selection policy.

    Responsibilities:

        - Verify the test-selection checker runs in the strict lint gate
        - Verify current test source contains no focused or skipped tests
        - Verify focused and skipped Jest selectors are rejected

    This file intentionally does NOT contain:

        - Jest runner integration tests
        - Coverage threshold tests
        - React Native rendering tests
*/

import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

/* ------------------------------------------------------------------------- */
/* Test selection guard                                                      */
/* ------------------------------------------------------------------------- */

const projectRoot = path.resolve(__dirname, "..", "..");
const probePath = path.join(projectRoot, "tmp-focused-test.test.ts");

function readPackageJson(): { scripts?: Record<string, string> } {
  return JSON.parse(
    fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"),
  ) as { scripts?: Record<string, string> };
}

function runChecker() {
  return spawnSync(
    "node",
    ["scripts/check-test-selection.js"],
    {
      cwd: projectRoot,
      encoding: "utf8",
    },
  );
}

function selectedTestLine(name: string, selector: string) {
  return `${name}${selector}("release probe", () => {});`;
}

describe("test selection policy", () => {
  afterEach(() => {
    if (fs.existsSync(probePath)) {
      fs.unlinkSync(probePath);
    }
  });

  test("runs as part of the strict lint gate", () => {
    const packageJson = readPackageJson();

    expect(packageJson.scripts?.["lint:strict"]).toContain(
      "npm run lint:test-selection",
    );
  });

  test("accepts the current test suite selection", () => {
    const result = runChecker();

    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
  });

  test("rejects focused and skipped Jest selectors", () => {
    fs.writeFileSync(
      probePath,
      [
        "/*",
        "    Project: Hoot Mobile",
        "    -------------------",
        "",
        "    File: tmp-focused-test.test.ts",
        "*/",
        "",
        selectedTestLine("describe", ".only"),
        selectedTestLine("test", ".skip"),
        selectedTestLine("f", "it"),
        "",
        "/* end of tmp-focused-test.test.ts */",
        "",
      ].join("\n"),
    );

    const result = runChecker();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Test selection check failed");
    expect(result.stderr).toContain("tmp-focused-test.test.ts");
    expect(result.stderr).toContain(selectedTestLine("describe", ".only").slice(0, 14));
    expect(result.stderr).toContain(selectedTestLine("test", ".skip").slice(0, 10));
    expect(result.stderr).toContain(selectedTestLine("f", "it").slice(0, 4));
  });
});

/* end of TestSelection.test.ts */
