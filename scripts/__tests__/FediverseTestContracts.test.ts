/*
    Project: Hoot Unfathomably
    --------------------------

    File: FediverseTestContracts.test.ts

    Purpose:

        Guard the supported-server contract policy used by release checks.

    Responsibilities:

        - Verify the contract checker is part of strict lint.
        - Verify the current Fediverse test suite passes the checker.
        - Verify a retired service fixture is rejected.

    This file intentionally does NOT contain:

        - Live server requests.
        - Credentials.
        - Application behavior tests.
*/

import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

const projectRoot = path.resolve(__dirname, "..", "..");
const probePath = path.join(
  projectRoot,
  "tmp-retired-contract.test.ts",
);

function readPackageJson(): { scripts?: Record<string, string> } {
  return JSON.parse(
    fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"),
  ) as { scripts?: Record<string, string> };
}

function runChecker() {
  return spawnSync(
    "node",
    ["scripts/check-fediverse-test-contracts.js"],
    {
      cwd: projectRoot,
      encoding: "utf8",
    },
  );
}

describe("Fediverse test contracts", () => {
  afterEach(() => {
    if (fs.existsSync(probePath)) {
      fs.unlinkSync(probePath);
    }
  });

  test("runs as part of the strict lint gate", () => {
    expect(readPackageJson().scripts?.["lint:strict"]).toContain(
      "npm run lint:fediverse-tests",
    );
  });

  test("accepts the current supported-server suite", () => {
    const result = runChecker();

    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
  });

  test("rejects a retired service fixture", () => {
    const retiredServicePath = ["services", "LotideService"].join("/");
    fs.writeFileSync(
      probePath,
      [
        "const retiredService =",
        `  jest.requireActual("./${retiredServicePath}");`,
        "test('retired contract probe', () => {",
        "  expect(retiredService).toBeDefined();",
        "});",
        "",
      ].join("\n"),
    );

    const result = runChecker();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Fediverse test-contract check failed");
    expect(result.stderr).toContain("tmp-retired-contract.test.ts");
    expect(result.stderr).toContain(
      "replace the retired service with UnfathomablyService",
    );
  });
});

/* end of FediverseTestContracts.test.ts */
