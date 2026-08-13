/*
    Project: Hoot Unfathomably
    --------------------------

    File: Colors.test.ts

    Purpose:

        Guard the native client's Unfathomably identity and contrast choices.

    Responsibilities:

        - Preserve the canonical primary and galaxy-mark colors
        - Verify primary and secondary controls meet normal-text contrast
        - Verify launcher, splash, and in-app mark source assets stay present
        - Verify Android background metadata remains aligned with the brand

    This file intentionally does NOT contain:

        - Screenshot comparisons
        - Instance-provided theme behavior
        - Component interaction tests
*/

import * as fs from "fs";
import * as path from "path";

import Colors, { UNFATHOMABLY_BRAND } from "../Colors";

/* ------------------------------------------------------------------------- */
/* Color and asset helpers                                                   */
/* ------------------------------------------------------------------------- */

const projectRoot = path.resolve(__dirname, "..", "..");

function relativeLuminance(color: string): number {
  const components = [1, 3, 5].map(index =>
    Number.parseInt(color.slice(index, index + 2), 16) / 255,
  );
  const linear = components.map(component =>
    component <= 0.04045
      ? component / 12.92
      : ((component + 0.055) / 1.055) ** 2.4,
  );

  return (0.2126 * linear[0]) + (0.7152 * linear[1]) + (0.0722 * linear[2]);
}

function contrastRatio(first: string, second: string): number {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);

  return (lighter + 0.05) / (darker + 0.05);
}

function pngDimensions(relativePath: string): { height: number; width: number } {
  const buffer = fs.readFileSync(path.join(projectRoot, relativePath));

  expect(buffer.subarray(1, 4).toString("ascii")).toBe("PNG");

  return {
    height: buffer.readUInt32BE(20),
    width: buffer.readUInt32BE(16),
  };
}

/* ------------------------------------------------------------------------- */
/* Branding contract                                                         */
/* ------------------------------------------------------------------------- */

describe("Unfathomably colors and assets", () => {
  test("uses the current frontend identity", () => {
    expect(UNFATHOMABLY_BRAND).toEqual({
      mark: "#0482d8",
      primary: "#7e0000",
      primaryDark: "#f87271",
    });
    expect(Colors.light.background).toBe("#f8fafa");
    expect(Colors.dark.background).toBe("#000000");
    expect(Colors.light.brandMark).toBe(UNFATHOMABLY_BRAND.mark);
    expect(Colors.dark.brandMark).toBe(UNFATHOMABLY_BRAND.mark);
  });

  test.each(["light", "dark"] as const)(
    "%s controls preserve normal-text contrast",
    colorScheme => {
      const theme = Colors[colorScheme];

      expect(contrastRatio(theme.tint, theme.onTint)).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(theme.secondaryTint, theme.onSecondaryTint),
      ).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(theme.background, theme.text)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(theme.background, theme.secondaryText)).toBeGreaterThanOrEqual(4.5);
    },
  );

  test("keeps high-resolution launcher and shared mark assets", () => {
    expect(pngDimensions("assets/images/icon.png")).toEqual({
      height: 1024,
      width: 1024,
    });
    expect(pngDimensions("assets/images/adaptive-icon.png")).toEqual({
      height: 1024,
      width: 1024,
    });
    expect(pngDimensions("assets/images/splash.png")).toEqual({
      height: 512,
      width: 512,
    });
    expect(pngDimensions("assets/images/unfathomably-mark.png")).toEqual({
      height: 512,
      width: 512,
    });
  });

  test("keeps the canonical editable galaxy geometry", () => {
    const logo = fs.readFileSync(
      path.join(projectRoot, "assets/images/unfathomably-logo.svg"),
      "utf8",
    );

    expect(logo).toContain('stroke="#0482d8"');
    expect(logo).toContain('circle cx="442" cy="96" r="21"');
    expect(logo).toContain('circle cx="70" cy="416" r="21"');
    expect(logo.match(/<path\b/g)).toHaveLength(2);
  });

  test("uses black launcher and splash backgrounds", () => {
    const appJson = JSON.parse(
      fs.readFileSync(path.join(projectRoot, "app.json"), "utf8"),
    ) as {
      expo: {
        android: { adaptiveIcon: { backgroundColor: string } };
        plugins: unknown[];
        primaryColor: string;
      };
    };
    const splash = appJson.expo.plugins.find(
      plugin => Array.isArray(plugin) && plugin[0] === "expo-splash-screen",
    );

    expect(appJson.expo.android.adaptiveIcon.backgroundColor).toBe("#000000");
    expect(appJson.expo.primaryColor).toBe(UNFATHOMABLY_BRAND.primary);
    expect(splash).toEqual([
      "expo-splash-screen",
      expect.objectContaining({ backgroundColor: "#000000" }),
    ]);
  });
});

/* end of Colors.test.ts */
