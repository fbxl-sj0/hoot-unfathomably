/*
    Project: Hoot Mobile
    -------------------

    File: Instance.ts

    Purpose:

        Load and normalize Lotide instance metadata.

    Responsibilities:

        - Fetch instance information
        - Parse API version from software version
        - Fill safe defaults for older instances

    This file intentionally does NOT contain:

        - host selection UI
        - login state
*/

import { lotideRequest, readJson } from "./util";
import { expectRecord, isRecord, normalizeContent } from "./validation";

export async function getInstanceInfo(
  ctx: LotideContext,
): Promise<InstanceInfo> {
  return lotideRequest(ctx, "GET", "instance", undefined, true)
    .then(readJson)
    .then(data => {
      const instance = expectRecord(data, "instance");
      const software = isRecord(instance.software)
        ? instance.software
        : undefined;
      const version = typeof software?.version === "string"
        ? software.version
        : "unknown";
      const softwareName = typeof software?.name === "string"
        ? software.name
        : software
        ? "unknown"
        : "lotide";
      const apiVersion = parseApiVersion(version);
      return {
        ...instance,
        description: normalizeContent(instance.description),
        site_name:
          typeof instance.site_name === "string" ? instance.site_name : "lotide",
        software: {
          ...software,
          name: softwareName,
          version,
        },
        apiVersion,
      } as InstanceInfo;
    });
}

export function parseApiVersion(version: string): number {
  const match = version.match(/^\d+\.(\d+)/);

  if (!match) {
    return 0;
  }

  return Number(match[1]) || 0;
}

/* end of Instance.ts */
