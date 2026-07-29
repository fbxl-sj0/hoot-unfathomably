/*
    Project: Hoot Mobile
    -------------------

    File: DeprecatedPackages.test.ts

    Purpose:

        Guard the release dependency hygiene check against accidental removal.

    Responsibilities:

        - Verify deprecated-package scanning runs in the strict lint gate
        - Run the deprecated-package scanner under Jest

    This file intentionally does NOT contain:

        - npm install logic
        - vulnerability auditing
        - package upgrade recommendations
*/

import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

/* ------------------------------------------------------------------------- */
/* Deprecated package metadata guard                                         */
/* ------------------------------------------------------------------------- */

const projectRoot = path.resolve(__dirname, "..", "..");

function readPackageJson(): { scripts?: Record<string, string> } {
  return JSON.parse(
    fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"),
  ) as { scripts?: Record<string, string> };
}

describe("deprecated package metadata", () => {
  test("runs as part of the strict lint gate", () => {
    const packageJson = readPackageJson();

    expect(packageJson.scripts?.["lint:strict"]).toContain(
      "npm run lint:deps",
    );
  });

  test("is absent from the lockfile and installed package metadata", () => {
    const result = spawnSync(
      "node",
      ["scripts/check-deprecated-packages.js"],
      {
        cwd: projectRoot,
        encoding: "utf8",
      },
    );

    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
  });
});

/* end of DeprecatedPackages.test.ts */
