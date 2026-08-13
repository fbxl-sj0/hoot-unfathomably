/*
    Project: Hoot Unfathomably
    --------------------------

    File: InstanceThemeService.ts

    Purpose:

        Read an instance's public Soapbox or Unfathomably presentation
        settings and turn them into safe native application values.

    Responsibilities:

        - Load colors and quick reactions from supported public endpoints
        - Validate and bound all server-controlled theme data
        - Cache validated configuration per server for offline startup
        - Resolve light, dark, black, and system theme modes

    This file intentionally does NOT contain:

        - React context or component state
        - Authentication headers or account credentials
        - Per-instance hostname overrides
*/

import AsyncStorage from "@react-native-async-storage/async-storage";

import Colors, { ColorsObject } from "../constants/Colors";
import type { AppColorScheme } from "../hooks/useColorScheme";
import { logWarning } from "../utils/debugLog";
import { getSupportedServerUrl } from "./UnfathomablyService";

export type InstanceThemeMode = "system" | "light" | "dark" | "black";

type ColorScale = Partial<Record<ThemeShade, string>>;

type FrontendColors = {
  accent: ColorScale;
  danger: ColorScale;
  gray: ColorScale;
  primary: ColorScale;
  secondary: ColorScale;
  success: ColorScale;
};

export type InstanceThemeConfiguration = {
  accentColor: string;
  backgroundColor?: string;
  brandColor: string;
  colors: FrontendColors;
  quickEmoji?: string[];
  secondaryBackgroundColor?: string;
  textColor?: string;
  themeMode: InstanceThemeMode;
};

export type ResolvedInstanceTheme = {
  colorScheme: AppColorScheme;
  colors: ColorsObject;
};

type ThemeShade =
  | "50"
  | "100"
  | "200"
  | "300"
  | "400"
  | "500"
  | "600"
  | "700"
  | "800"
  | "900";

type RgbColor = {
  blue: number;
  green: number;
  red: number;
};

type CachedTheme = {
  storedAt: number;
  theme: InstanceThemeConfiguration;
  version: 1;
};

type CachedQuickEmoji = {
  emoji: string[];
  storedAt: number;
  version: 1;
};

const CACHE_KEY_PREFIX = "@hoot_instance_theme_v1:";
const QUICK_EMOJI_CACHE_KEY_PREFIX = "@hoot_instance_quick_emoji_v1:";
const CONFIGURATION_PATHS = [
  "/api/pleroma/frontend_configurations",
  "/api/v1/pleroma/frontend_configurations",
  "/instance/soapbox.json",
] as const;
const FRONTEND_CONFIGURATION_KEYS = [
  "unfathomably_fe",
  "soapbox_fe",
  "pl_fe",
] as const;
const HEX_COLOR_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const MAX_CONFIGURATION_CHARACTERS = 256 * 1024;
const MAX_QUICK_EMOJI = 24;
const MAX_QUICK_EMOJI_CHARACTERS = 64;
const PLEROMA_THEME_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]{0,127}$/i;
const REQUEST_TIMEOUT_MS = 8_000;

/*
    Unfathomably FE uses this compact reaction order when an instance does not
    publish an allowedEmoji override. Keeping the fallback here makes native
    and web clients agree when a server relies on the frontend default.
*/
export const DEFAULT_QUICK_EMOJI: readonly string[] = Object.freeze([
  "👍",
  "❤️",
  "🤔",
  "😆",
  "😮",
  "😡",
  "😢",
  "😏",
  "🇫",
]);

const THEME_SHADES: ThemeShade[] = [
  "50",
  "100",
  "200",
  "300",
  "400",
  "500",
  "600",
  "700",
  "800",
  "900",
];

const refreshesByOrigin = new Map<
  string,
  Promise<InstanceThemeConfiguration | undefined>
>();
const quickEmojiRefreshesByOrigin = new Map<
  string,
  Promise<string[] | undefined>
>();
const configurationDocumentRefreshes = new Map<
  string,
  Promise<unknown[]>
>();

/* ------------------------------------------------------------------------- */
/* Validation                                                                */
/* ------------------------------------------------------------------------- */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeHexColor(value: unknown): string | undefined {
  if (typeof value !== "string" || !HEX_COLOR_PATTERN.test(value)) {
    return undefined;
  }

  const hex = value.slice(1).toLowerCase();
  if (hex.length === 6) return `#${hex}`;

  return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`;
}

function normalizeColorScale(value: unknown): ColorScale {
  if (!isRecord(value)) return {};

  return THEME_SHADES.reduce<ColorScale>((scale, shade) => {
    const color = normalizeHexColor(value[shade]);
    if (color) scale[shade] = color;
    return scale;
  }, {});
}

function normalizeFrontendColors(value: unknown): FrontendColors {
  const colors = isRecord(value) ? value : {};

  return {
    accent: normalizeColorScale(colors.accent),
    danger: normalizeColorScale(colors.danger),
    gray: normalizeColorScale(colors.gray),
    primary: normalizeColorScale(colors.primary),
    secondary: normalizeColorScale(colors.secondary),
    success: normalizeColorScale(colors.success),
  };
}

function normalizeThemeMode(value: unknown): InstanceThemeMode {
  if (
    value === "light" ||
    value === "dark" ||
    value === "black" ||
    value === "system"
  ) {
    return value;
  }

  return "system";
}

function normalizeQuickEmoji(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const quickEmoji: string[] = [];
  const seen = new Set<string>();

  for (const candidate of value) {
    if (typeof candidate !== "string") continue;

    const emoji = candidate.trim();
    if (
      !emoji ||
      emoji.length > MAX_QUICK_EMOJI_CHARACTERS ||
      /[\u0000-\u001f\u007f]/u.test(emoji) ||
      seen.has(emoji)
    ) {
      continue;
    }

    quickEmoji.push(emoji);
    seen.add(emoji);
    if (quickEmoji.length === MAX_QUICK_EMOJI) break;
  }

  return quickEmoji.length > 0 ? quickEmoji : undefined;
}

export function normalizeInstanceQuickEmoji(
  responseBody: unknown,
): string[] | undefined {
  if (!isRecord(responseBody)) return undefined;

  for (const key of FRONTEND_CONFIGURATION_KEYS) {
    const candidate = responseBody[key];
    if (!isRecord(candidate)) continue;

    const quickEmoji = normalizeQuickEmoji(
      candidate.allowedEmoji ?? candidate.quickEmoji,
    );
    if (quickEmoji) return quickEmoji;
  }

  return normalizeQuickEmoji(
    responseBody.allowedEmoji ?? responseBody.quickEmoji,
  );
}

function normalizeFrontendConfiguration(
  candidate: Record<string, unknown>,
): InstanceThemeConfiguration | undefined {
  const colors = normalizeFrontendColors(candidate.colors);
  const brandColor = normalizeHexColor(candidate.brandColor) ??
    colors.primary["500"] ??
    normalizeHexColor(candidate.accentColor);
  if (!brandColor) return undefined;

  const defaultSettings = isRecord(candidate.defaultSettings)
    ? candidate.defaultSettings
    : {};

  return {
    accentColor: normalizeHexColor(candidate.accentColor) ??
      colors.accent["500"] ??
      brandColor,
    backgroundColor: normalizeHexColor(candidate.backgroundColor),
    brandColor,
    colors,
    quickEmoji: normalizeQuickEmoji(
      candidate.allowedEmoji ?? candidate.quickEmoji,
    ),
    secondaryBackgroundColor: normalizeHexColor(
      candidate.secondaryBackgroundColor,
    ),
    textColor: normalizeHexColor(candidate.textColor),
    themeMode: normalizeThemeMode(
      defaultSettings.themeMode ?? candidate.themeMode,
    ),
  };
}

function normalizePleromaThemeConfiguration(
  responseBody: Record<string, unknown>,
): InstanceThemeConfiguration | undefined {
  const theme = isRecord(responseBody.theme)
    ? responseBody.theme
    : responseBody.source;
  if (!isRecord(theme) || !isRecord(theme.colors)) return undefined;

  const sourceColors = theme.colors;
  const backgroundColor = normalizeHexColor(sourceColors.bg);
  const secondaryBackgroundColor = normalizeHexColor(sourceColors.fg) ??
    backgroundColor;
  const textColor = normalizeHexColor(sourceColors.text);
  const brandColor = normalizeHexColor(sourceColors.accent) ??
    normalizeHexColor(sourceColors.link);
  if (!backgroundColor || !textColor || !brandColor) return undefined;

  const linkColor = normalizeHexColor(sourceColors.link) ?? brandColor;
  const dangerColor = normalizeHexColor(sourceColors.cRed);
  const successColor = normalizeHexColor(sourceColors.cGreen);

  return normalizeFrontendConfiguration({
    accentColor: linkColor,
    backgroundColor,
    brandColor,
    colors: {
      accent: { "500": linkColor },
      danger: { "400": dangerColor, "600": dangerColor },
      gray: {
        "50": textColor,
        "100": textColor,
        "800": textColor,
        "900": textColor,
      },
      primary: {
        "500": brandColor,
        "800": secondaryBackgroundColor,
        "900": backgroundColor,
      },
      secondary: { "500": linkColor },
      success: { "400": successColor, "700": successColor },
    },
    defaultSettings: {
      themeMode: relativeLuminance(backgroundColor) >= 0.4
        ? "light"
        : "dark",
    },
    secondaryBackgroundColor,
    textColor,
  });
}

export function normalizeInstanceThemeConfiguration(
  responseBody: unknown,
): InstanceThemeConfiguration | undefined {
  if (!isRecord(responseBody)) return undefined;

  for (const key of FRONTEND_CONFIGURATION_KEYS) {
    const candidate = responseBody[key];
    if (!isRecord(candidate)) continue;

    const configuration = normalizeFrontendConfiguration(candidate);
    if (configuration) return configuration;
  }

  return normalizeFrontendConfiguration(responseBody) ??
    normalizePleromaThemeConfiguration(responseBody);
}

/* ------------------------------------------------------------------------- */
/* Color calculations                                                        */
/* ------------------------------------------------------------------------- */

function hexToRgb(color: string): RgbColor {
  return {
    red: Number.parseInt(color.slice(1, 3), 16),
    green: Number.parseInt(color.slice(3, 5), 16),
    blue: Number.parseInt(color.slice(5, 7), 16),
  };
}

function rgbToHex(color: RgbColor): string {
  const channel = (value: number) => Math.round(value)
    .toString(16)
    .padStart(2, "0");

  return `#${channel(color.red)}${channel(color.green)}${channel(color.blue)}`;
}

function mixColors(first: string, second: string, firstWeight: number): string {
  const left = hexToRgb(first);
  const right = hexToRgb(second);
  const rightWeight = 1 - firstWeight;

  return rgbToHex({
    red: (left.red * firstWeight) + (right.red * rightWeight),
    green: (left.green * firstWeight) + (right.green * rightWeight),
    blue: (left.blue * firstWeight) + (right.blue * rightWeight),
  });
}

function relativeLuminance(color: string): number {
  const rgb = hexToRgb(color);
  const linearChannel = (value: number) => {
    const component = value / 255;
    return component <= 0.04045
      ? component / 12.92
      : ((component + 0.055) / 1.055) ** 2.4;
  };

  return (0.2126 * linearChannel(rgb.red)) +
    (0.7152 * linearChannel(rgb.green)) +
    (0.0722 * linearChannel(rgb.blue));
}

export function contrastRatio(first: string, second: string): number {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);

  return (lighter + 0.05) / (darker + 0.05);
}

function pickReadableColor(
  candidates: (string | undefined)[],
  background: string,
  minimumContrast = 4.5,
): string {
  const validCandidates = candidates.filter(
    (candidate): candidate is string => !!candidate,
  );
  const readable = validCandidates.find(
    candidate => contrastRatio(candidate, background) >= minimumContrast,
  );

  if (readable) return readable;
  return contrastRatio("#ffffff", background) >=
    contrastRatio("#000000", background)
    ? "#ffffff"
    : "#000000";
}

function pickDistinctBackground(
  candidates: (string | undefined)[],
  background: string,
  fallback: string,
): string {
  return candidates.find(candidate =>
    !!candidate && contrastRatio(candidate, background) >= 1.08,
  ) ?? fallback;
}

function controlCandidates(
  baseColor: string,
  scale: ColorScale,
  background: string,
): string[] {
  const backgroundIsDark = relativeLuminance(background) < 0.18;
  const configured = backgroundIsDark
    ? [scale["500"], scale["400"], scale["300"], scale["200"], scale["100"]]
    : [scale["500"], scale["600"], scale["700"], scale["800"], scale["900"]];
  const adjustmentColor = backgroundIsDark ? "#ffffff" : "#000000";
  const generated = [0.82, 0.68, 0.54, 0.4].map(weight =>
    mixColors(baseColor, adjustmentColor, weight),
  );

  return [baseColor, ...configured, ...generated].filter(
    (candidate): candidate is string => !!candidate,
  );
}

function pickControlColor(
  baseColor: string,
  scale: ColorScale,
  background: string,
): { color: string; onColor: string } {
  const candidates = controlCandidates(baseColor, scale, background);
  const color = candidates.find(
    candidate => contrastRatio(candidate, background) >= 3,
  ) ?? pickReadableColor(candidates, background, 3);
  const onColor = pickReadableColor(["#ffffff", "#000000"], color);

  return { color, onColor };
}

function configuredColor(
  scale: ColorScale,
  shade: ThemeShade,
  fallback: string,
): string {
  return scale[shade] ?? fallback;
}

function resolveVariant(
  mode: InstanceThemeMode,
  systemColorScheme: AppColorScheme,
): "light" | "dark" | "black" {
  if (mode === "system") return systemColorScheme;
  return mode;
}

function createPalette(
  configuration: InstanceThemeConfiguration,
  variant: "light" | "dark" | "black",
): ColorsObject {
  const { colors } = configuration;
  const isLight = variant === "light";
  const fallback = Colors[isLight ? "light" : "dark"];
  let background: string;
  let secondaryBackground: string;
  let tertiaryBackground: string;

  if (variant === "light") {
    background = configuration.backgroundColor ?? "#ffffff";
    secondaryBackground = configuration.secondaryBackgroundColor ??
      colors.gray["50"] ??
      mixColors(configuration.brandColor, "#ffffff", 0.035);
    tertiaryBackground = colors.gray["200"] ??
      mixColors(configuration.brandColor, "#ffffff", 0.12);
  } else if (variant === "black") {
    background = "#000000";
    secondaryBackground = pickDistinctBackground(
      [colors.gray["900"], colors.primary["900"], colors.primary["800"]],
      background,
      mixColors(configuration.brandColor, "#000000", 0.2),
    );
    tertiaryBackground = pickDistinctBackground(
      [colors.gray["800"], colors.primary["800"], colors.primary["700"]],
      secondaryBackground,
      mixColors(configuration.brandColor, "#000000", 0.35),
    );
  } else {
    background = configuration.backgroundColor ??
      colors.primary["900"] ??
      mixColors(configuration.brandColor, "#000000", 0.16);
    secondaryBackground = pickDistinctBackground(
      [
        configuration.secondaryBackgroundColor,
        colors.primary["800"],
        colors.gray["900"],
        colors.gray["800"],
      ],
      background,
      mixColors(configuration.brandColor, "#000000", 0.28),
    );
    tertiaryBackground = pickDistinctBackground(
      [colors.gray["800"], colors.primary["700"], colors.gray["700"]],
      secondaryBackground,
      mixColors(configuration.brandColor, "#000000", 0.4),
    );
  }

  const primaryControl = pickControlColor(
    configuration.brandColor,
    colors.primary,
    background,
  );
  const secondaryControl = pickControlColor(
    configuration.accentColor,
    colors.accent,
    background,
  );
  const text = pickReadableColor(
    isLight
      ? [configuration.textColor, colors.gray["900"], colors.gray["800"], fallback.text]
      : [configuration.textColor, colors.gray["50"], colors.gray["100"], fallback.text],
    background,
  );
  const secondaryText = pickReadableColor(
    isLight
      ? [colors.gray["600"], colors.gray["500"], fallback.secondaryText]
      : [colors.gray["300"], colors.gray["200"], colors.gray["100"], fallback.secondaryText],
    background,
  );
  const placeholderText = pickReadableColor(
    isLight
      ? [colors.gray["500"], colors.gray["600"], fallback.placeholderText]
      : [colors.gray["400"], colors.gray["300"], colors.gray["200"], fallback.placeholderText],
    secondaryBackground,
  );

  return {
    background,
    secondaryBackground,
    tertiaryBackground,
    text,
    secondaryText,
    placeholderText,
    brandMark: configuration.brandColor,
    tint: primaryControl.color,
    onTint: primaryControl.onColor,
    secondaryTint: secondaryControl.color,
    onSecondaryTint: secondaryControl.onColor,
    red: configuredColor(
      colors.danger,
      isLight ? "600" : "400",
      fallback.red,
    ),
    orange: fallback.orange,
    yellow: fallback.yellow,
    green: configuredColor(
      colors.success,
      isLight ? "700" : "400",
      fallback.green,
    ),
    teal: fallback.teal,
    blue: fallback.blue,
    indigo: fallback.indigo,
    purple: fallback.purple,
    tabIconDefault: secondaryText,
    tabIconSelected: primaryControl.color,
    tabBar: background,
  };
}

export function resolveInstanceTheme(
  configuration: InstanceThemeConfiguration | undefined,
  systemColorScheme: AppColorScheme,
): ResolvedInstanceTheme {
  if (!configuration) {
    return {
      colorScheme: systemColorScheme,
      colors: Colors[systemColorScheme],
    };
  }

  const variant = resolveVariant(configuration.themeMode, systemColorScheme);
  return {
    colorScheme: variant === "light" ? "light" : "dark",
    colors: createPalette(configuration, variant),
  };
}

/* ------------------------------------------------------------------------- */
/* Public configuration requests                                             */
/* ------------------------------------------------------------------------- */

function normalizedOrigin(apiUrl: string): string | undefined {
  return getSupportedServerUrl(apiUrl);
}

function cacheKey(origin: string): string {
  return `${CACHE_KEY_PREFIX}${encodeURIComponent(origin)}`;
}

function quickEmojiCacheKey(origin: string): string {
  return `${QUICK_EMOJI_CACHE_KEY_PREFIX}${encodeURIComponent(origin)}`;
}

async function requestConfigurationDocument(
  origin: string,
  path: string,
): Promise<unknown | undefined> {
  const controller = typeof AbortController === "undefined"
    ? undefined
    : new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<undefined>(resolve => {
    timer = setTimeout(() => {
      controller?.abort();
      resolve(undefined);
    }, REQUEST_TIMEOUT_MS);
  });

  try {
    const response = await Promise.race([
      fetch(`${origin}${path}`, {
        headers: { Accept: "application/json" },
        signal: controller?.signal,
      }),
      timeout,
    ]);
    if (!response) return undefined;
    if (!response.ok) return undefined;

    const declaredLength = Number(response.headers.get("content-length"));
    if (
      Number.isFinite(declaredLength) &&
      declaredLength > MAX_CONFIGURATION_CHARACTERS
    ) {
      return undefined;
    }

    const text = await response.text();
    if (text.length > MAX_CONFIGURATION_CHARACTERS) return undefined;

    try {
      return JSON.parse(text) as unknown;
    } catch {
      return undefined;
    }
  } catch {
    return undefined;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function requestConfigurationDocuments(origin: string): Promise<unknown[]> {
  const existing = configurationDocumentRefreshes.get(origin);
  if (existing) return existing;

  const refresh = Promise.all(
    CONFIGURATION_PATHS.map(path => requestConfigurationDocument(origin, path)),
  ).then(documents => documents.filter(
    (document): document is unknown => document !== undefined,
  )).finally(() => {
    configurationDocumentRefreshes.delete(origin);
  });

  configurationDocumentRefreshes.set(origin, refresh);
  return refresh;
}

function getPleromaThemeName(responseBody: unknown): string | undefined {
  if (!isRecord(responseBody) || !isRecord(responseBody.pleroma_fe)) {
    return undefined;
  }

  const themeName = responseBody.pleroma_fe.theme;
  return typeof themeName === "string" &&
    PLEROMA_THEME_NAME_PATTERN.test(themeName)
    ? themeName
    : undefined;
}

async function requestCurrentTheme(
  origin: string,
): Promise<InstanceThemeConfiguration | undefined> {
  /*
      Rebased and Pleroma normally keep frontend configuration in the backend,
      while Mastodon-style deployments publish soapbox.json. Both requests are
      public and independent, so running them together avoids making a missing
      or slow optional endpoint delay startup by a second timeout period.
  */
  const documents = await requestConfigurationDocuments(origin);
  const quickEmoji = documents
    .map(normalizeInstanceQuickEmoji)
    .find((candidate): candidate is string[] => !!candidate);

  for (const document of documents) {
    const configuration = normalizeInstanceThemeConfiguration(document);
    if (configuration) {
      return quickEmoji && !configuration.quickEmoji
        ? { ...configuration, quickEmoji }
        : configuration;
    }
  }

  const themeName = documents
    .map(getPleromaThemeName)
    .find((candidate): candidate is string => !!candidate);
  if (!themeName) return undefined;

  /*
      Pleroma FE and Akkoma advertise the default preset by name, then serve
      its palette from /static/themes. Restricting the name before building the
      path prevents an instance response from turning this into an arbitrary
      URL request.
  */
  const themeDocument = await requestConfigurationDocument(
    origin,
    `/static/themes/${encodeURIComponent(themeName)}.json`,
  );
  const configuration = normalizeInstanceThemeConfiguration(themeDocument);
  return configuration && quickEmoji
    ? { ...configuration, quickEmoji }
    : configuration;
}

async function requestCurrentQuickEmoji(
  origin: string,
): Promise<string[] | undefined> {
  const documents = await requestConfigurationDocuments(origin);
  return documents
    .map(normalizeInstanceQuickEmoji)
    .find((candidate): candidate is string[] => !!candidate);
}

async function storeCachedQuickEmoji(
  origin: string,
  emoji: string[],
): Promise<void> {
  const cached: CachedQuickEmoji = {
    emoji,
    storedAt: Date.now(),
    version: 1,
  };

  try {
    await AsyncStorage.setItem(
      quickEmojiCacheKey(origin),
      JSON.stringify(cached),
    );
  } catch (error) {
    logWarning("Failed to cache instance quick emoji", error);
  }
}

export async function loadCachedInstanceTheme(
  apiUrl: string,
): Promise<InstanceThemeConfiguration | undefined> {
  const origin = normalizedOrigin(apiUrl);
  if (!origin) return undefined;

  try {
    const stored = await AsyncStorage.getItem(cacheKey(origin));
    if (!stored) return undefined;

    const parsed = JSON.parse(stored) as unknown;
    if (!isRecord(parsed) || parsed.version !== 1 || !isRecord(parsed.theme)) {
      await AsyncStorage.removeItem(cacheKey(origin));
      return undefined;
    }

    const normalized = normalizeInstanceThemeConfiguration(parsed.theme);
    if (!normalized) {
      await AsyncStorage.removeItem(cacheKey(origin));
      return undefined;
    }

    return normalized;
  } catch (error) {
    logWarning("Failed to read cached instance theme", error);
    return undefined;
  }
}

export async function loadCachedInstanceQuickEmoji(
  apiUrl: string,
): Promise<string[] | undefined> {
  const origin = normalizedOrigin(apiUrl);
  if (!origin) return undefined;

  try {
    const stored = await AsyncStorage.getItem(quickEmojiCacheKey(origin));
    if (!stored) return undefined;

    const parsed = JSON.parse(stored) as unknown;
    if (!isRecord(parsed) || parsed.version !== 1) {
      await AsyncStorage.removeItem(quickEmojiCacheKey(origin));
      return undefined;
    }

    const normalized = normalizeQuickEmoji(parsed.emoji);
    if (!normalized) {
      await AsyncStorage.removeItem(quickEmojiCacheKey(origin));
      return undefined;
    }

    return normalized;
  } catch (error) {
    logWarning("Failed to read cached instance quick emoji", error);
    return undefined;
  }
}

export async function refreshInstanceQuickEmoji(
  apiUrl: string,
): Promise<string[] | undefined> {
  const origin = normalizedOrigin(apiUrl);
  if (!origin) return undefined;

  const existingRefresh = quickEmojiRefreshesByOrigin.get(origin);
  if (existingRefresh) return existingRefresh;

  const refresh = requestCurrentQuickEmoji(origin)
    .then(async emoji => {
      if (emoji) await storeCachedQuickEmoji(origin, emoji);
      return emoji;
    })
    .finally(() => {
      quickEmojiRefreshesByOrigin.delete(origin);
    });

  quickEmojiRefreshesByOrigin.set(origin, refresh);
  return refresh;
}

export async function refreshInstanceTheme(
  apiUrl: string,
): Promise<InstanceThemeConfiguration | undefined> {
  const origin = normalizedOrigin(apiUrl);
  if (!origin) return undefined;

  const existingRefresh = refreshesByOrigin.get(origin);
  if (existingRefresh) return existingRefresh;

  const refresh = requestCurrentTheme(origin)
    .then(async theme => {
      if (!theme) return undefined;

      const cached: CachedTheme = {
        storedAt: Date.now(),
        theme,
        version: 1,
      };

      try {
        await AsyncStorage.setItem(cacheKey(origin), JSON.stringify(cached));
      } catch (error) {
        logWarning("Failed to cache instance theme", error);
      }

      if (theme.quickEmoji) {
        await storeCachedQuickEmoji(origin, theme.quickEmoji);
      }

      return theme;
    })
    .finally(() => {
      refreshesByOrigin.delete(origin);
    });

  refreshesByOrigin.set(origin, refresh);
  return refresh;
}

/* end of InstanceThemeService.ts */
