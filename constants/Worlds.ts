/*
    Project: Hoot Unfathomably
    --------------------------

    File: Worlds.ts

    Purpose:

        Describe the user-facing Worlds families published by Unfathomably.

    Responsibilities:

        - Keep stable family identifiers in one place
        - Provide plain-language labels and finder prompts
        - Group related Worlds for compact mobile presentation

    This file intentionally does NOT contain:

        - API requests
        - server capability detection
        - React Native presentation code
*/

export type WorldFamily =
  | "all"
  | "audio"
  | "video"
  | "longform"
  | "photo"
  | "books"
  | "bookmarks"
  | "groups"
  | "events"
  | "development"
  | "models"
  | "marketplace"
  | "games"
  | "routes"
  | "culture"
  | "coordination"
  | "publishing";

export type WorldDefinition = {
  family: Exclude<WorldFamily, "all">;
  title: string;
  description: string;
  searchPlaceholder: string;
};

export type WorldSection = {
  id: "media" | "participation" | "making";
  title: string;
  description: string;
  families: WorldDefinition[];
};

export const WORLD_DEFINITIONS: WorldDefinition[] = [
  {
    family: "books",
    title: "Books",
    description: "Books, editions, shelves, reviews, and reading activity.",
    searchPlaceholder: "Find a book, author, or ISBN",
  },
  {
    family: "culture",
    title: "Culture",
    description: "Film, music, games, exhibitions, ratings, and reviews.",
    searchPlaceholder: "Find a work, creator, or title",
  },
  {
    family: "audio",
    title: "Audio",
    description: "Music, podcasts, artists, albums, and recordings.",
    searchPlaceholder: "Find music or a podcast",
  },
  {
    family: "video",
    title: "Video",
    description: "Videos, channels, playlists, and live streams.",
    searchPlaceholder: "Find a video or channel",
  },
  {
    family: "photo",
    title: "Photography",
    description: "Photographs, galleries, photographers, and image stories.",
    searchPlaceholder: "Find photographs or photographers",
  },
  {
    family: "longform",
    title: "Articles",
    description: "Articles, blogs, newsletters, writers, and feed entries.",
    searchPlaceholder: "Find an article or writer",
  },
  {
    family: "bookmarks",
    title: "Bookmarks",
    description: "Saved links, annotations, tags, and curators.",
    searchPlaceholder: "Find a saved link",
  },
  {
    family: "publishing",
    title: "Publishing",
    description: "Publications, documents, chapters, and shared knowledge.",
    searchPlaceholder: "Find a publication or document",
  },
  {
    family: "groups",
    title: "Communities",
    description: "Forums, groups, channels, topics, and discussions.",
    searchPlaceholder: "Find a community",
  },
  {
    family: "events",
    title: "Events",
    description: "Events, organizers, schedules, places, and gatherings.",
    searchPlaceholder: "Find an event",
  },
  {
    family: "games",
    title: "Games",
    description: "Players, games, challenges, positions, and moves.",
    searchPlaceholder: "Find a player or game",
  },
  {
    family: "coordination",
    title: "Coordination",
    description: "Offers, needs, resources, proposals, and mutual aid.",
    searchPlaceholder: "Find help, offers, or needs",
  },
  {
    family: "marketplace",
    title: "Marketplace",
    description: "Classified listings, offers, requests, and sellers.",
    searchPlaceholder: "Find an offer or request",
  },
  {
    family: "routes",
    title: "Routes",
    description: "Routes, trails, maps, geographic facts, and GPX tracks.",
    searchPlaceholder: "Find a route or trail",
  },
  {
    family: "models",
    title: "3D models",
    description: "Models, printable files, collections, and designers.",
    searchPlaceholder: "Find a 3D model",
  },
  {
    family: "development",
    title: "Software",
    description: "Projects, repositories, issues, patches, and releases.",
    searchPlaceholder: "Find a project or issue",
  },
];

function definitionsFor(
  families: WorldDefinition["family"][],
): WorldDefinition[] {
  return families.flatMap(family => {
    const definition = WORLD_DEFINITIONS.find(item => item.family === family);
    return definition ? [definition] : [];
  });
}

export const WORLD_SECTIONS: WorldSection[] = [
  {
    id: "media",
    title: "Read, watch, and listen",
    description: "Choose the kind of work you want, not a server to browse.",
    families: definitionsFor([
      "books",
      "culture",
      "audio",
      "video",
      "photo",
      "longform",
      "bookmarks",
      "publishing",
    ]),
  },
  {
    id: "participation",
    title: "Meet and participate",
    description: "Join people around communities, events, games, and needs.",
    families: definitionsFor([
      "groups",
      "events",
      "games",
      "coordination",
    ]),
  },
  {
    id: "making",
    title: "Make, build, and exchange",
    description: "Find useful things and the people creating or sharing them.",
    families: definitionsFor([
      "marketplace",
      "routes",
      "models",
      "development",
    ]),
  },
];

export function getWorldDefinition(
  family: WorldFamily,
): WorldDefinition | undefined {
  if (family === "all") return undefined;
  return WORLD_DEFINITIONS.find(item => item.family === family);
}

export function isWorldFamily(value: unknown): value is WorldFamily {
  return value === "all" || WORLD_DEFINITIONS.some(item => item.family === value);
}

/* end of Worlds.ts */
