/*
    Project: Hoot Mobile
    -------------------

    File: AndroidSmokeScript.test.ts

    Purpose:

        Guard the Android smoke launcher behavior that release validation
        depends on.

    Responsibilities:

        - Verify the smoke launcher checks the installed notification
          permission declaration
        - Verify the opt-in Android notification permission grant remains
          documented in the script usage

    This file intentionally does NOT contain:

        - Android emulator orchestration
        - Native notification delivery tests
        - Shell integration tests
*/

import * as fs from "fs";
import * as path from "path";

/* ------------------------------------------------------------------------- */
/* Android smoke launcher guard                                              */
/* ------------------------------------------------------------------------- */

const projectRoot = path.resolve(__dirname, "..", "..");
const scriptPath = path.join(
  projectRoot,
  "build_scripts",
  "android-smoke-launch.sh",
);

function readSmokeScript(): string {
  return fs.readFileSync(scriptPath, "utf8");
}

describe("Android smoke launcher", () => {
  test("checks the installed notification permission surface", () => {
    const script = readSmokeScript();

    expect(script).toContain("android.permission.POST_NOTIFICATIONS");
    expect(script).toContain("check_notification_permission_surface");
    expect(script).toContain("dumpsys package");
  });

  test("documents the opt-in notification permission grant", () => {
    const script = readSmokeScript();

    expect(script).toContain("HOOT_MOBILE_GRANT_NOTIFICATIONS=1");
    expect(script).toContain("pm grant");
    expect(script).toContain("POST_NOTIFICATION allow");
  });
});

/* end of AndroidSmokeScript.test.ts */
