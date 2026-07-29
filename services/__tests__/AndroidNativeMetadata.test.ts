/*
    Project: Hoot Mobile
    -------------------

    File: AndroidNativeMetadata.test.ts

    Purpose:

        Guard the checked-in Android project metadata that mirrors app.json.

    Responsibilities:

        - Run the native metadata mirror checker under Jest
        - Ensure app.json and android/ stay synchronized for release packaging
        - Ensure app-local Gradle files stay compatible with modern Gradle

    This file intentionally does NOT contain:

        - Notification polling behavior tests
        - Native notification delivery tests
        - Android build orchestration
*/

import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

/* ------------------------------------------------------------------------- */
/* Android native metadata guard                                             */
/* ------------------------------------------------------------------------- */

const projectRoot = path.resolve(__dirname, "..", "..");

function readPackageJson(): { scripts?: Record<string, string> } {
  return JSON.parse(
    fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"),
  ) as { scripts?: Record<string, string> };
}

function runGradleSyntaxFixture(gradle: string): string[] {
  const result = spawnSync(
    "node",
    [
      "-e",
      `
const metadataCheck = require("./scripts/check-android-native-metadata.js");
const problems = metadataCheck.findGradleModernSyntaxProblems(
  "android/app/build.gradle",
  ${JSON.stringify(gradle)},
);
process.stdout.write(JSON.stringify(problems));
`,
    ],
    {
      cwd: projectRoot,
      encoding: "utf8",
    },
  );

  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);

  return JSON.parse(result.stdout) as string[];
}

describe("Android native metadata", () => {
  test("runs as part of the strict lint gate", () => {
    const packageJson = readPackageJson();

    expect(packageJson.scripts?.["lint:strict"]).toContain(
      "npm run lint:android",
    );
  });

  test("mirrors app.json into the checked-in Android project", () => {
    const result = spawnSync(
      "node",
      ["scripts/check-android-native-metadata.js"],
      {
        cwd: projectRoot,
        encoding: "utf8",
      },
    );

    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
  });

  test("rejects app-local Gradle Groovy property shorthand", () => {
    const problems = runGradleSyntaxFixture(
      `
android {
    ndkVersion rootProject.ext.ndkVersion
    namespace 'org.brokenlamp.hoot'
    defaultConfig {
        versionCode 3
    }
}
dependencies {
    implementation jscFlavor
}
`,
    );

    expect(problems).toEqual([
      "android/app/build.gradle:3: use Gradle assignment syntax for ndkVersion",
      "android/app/build.gradle:4: use Gradle assignment syntax for namespace",
      "android/app/build.gradle:6: use Gradle assignment syntax for versionCode",
      "android/app/build.gradle:10: use implementation(jscFlavor) instead of Gradle command shorthand",
    ]);
  });

  test("accepts app-local Gradle assignment syntax", () => {
    const problems = runGradleSyntaxFixture(
      `
android {
    ndkVersion = rootProject.ext.ndkVersion
    namespace = 'org.brokenlamp.hoot'
    defaultConfig {
        versionCode = 3
    }
}
dependencies {
    implementation(jscFlavor)
}
`,
    );

    expect(problems).toEqual([]);
  });
});

/* end of AndroidNativeMetadata.test.ts */
