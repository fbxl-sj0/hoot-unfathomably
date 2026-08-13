/*
    Project: Hoot Unfathomably
    --------------------------

    File: ComposeDraftMediaService.ts

    Purpose:

        Keep composer attachments available for the lifetime of a saved draft.

    Responsibilities:

        - Copy picker files out of the purgeable cache into app documents
        - Isolate stored files by authenticated account
        - Remove only files owned by the draft-media directory
        - Preserve safe file extensions without trusting picker names as paths

    This file intentionally does NOT contain:

        - media upload requests
        - draft JSON persistence
        - image-picker presentation
*/

import { Directory, File, Paths } from "expo-file-system";

import { accountStoreKeyForContext } from "./StorageService";
import type { ComposeDraftMedia } from "./ComposeDraftService";

const MEDIA_DIRECTORY_NAME = "hoot-compose-media";

function stableFragment(value: string): string {
  let hash = 2_166_136_261;
  for (const character of value) {
    hash ^= character.codePointAt(0) || 0;
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function safeMediaExtension(name: string | undefined): string {
  const extension = name?.match(/\.([a-z0-9]{1,10})$/i)?.[1]?.toLowerCase();
  return extension ? `.${extension}` : ".bin";
}

function accountMediaDirectory(ctx: LotideContext): Directory {
  const accountKey = accountStoreKeyForContext(ctx);
  if (!accountKey) throw new Error("Sign in before attaching media to a draft.");
  return new Directory(
    Paths.document,
    MEDIA_DIRECTORY_NAME,
    stableFragment(accountKey),
  );
}

function draftMediaRootUri(): string {
  return new Directory(Paths.document, MEDIA_DIRECTORY_NAME).uri;
}

export async function persistComposeDraftMedia(
  ctx: LotideContext,
  media: ComposeDraftMedia,
): Promise<ComposeDraftMedia> {
  const sourceUri = media.uri?.trim();
  if (!sourceUri) throw new Error("The selected media file is unavailable.");
  if (sourceUri.startsWith(draftMediaRootUri())) return media;
  if (!sourceUri.startsWith("file://")) {
    throw new Error("The selected media provider did not return a readable file.");
  }

  const directory = accountMediaDirectory(ctx);
  directory.create({ idempotent: true, intermediates: true });
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${safeMediaExtension(media.name)}`;
  const destination = new File(directory, fileName);
  await new File(sourceUri).copy(destination);
  return { ...media, uri: destination.uri };
}

export function removeComposeDraftMedia(media: ComposeDraftMedia): void {
  const uri = media.uri?.trim();
  if (!uri?.startsWith(draftMediaRootUri())) return;
  const file = new File(uri);
  if (file.exists) file.delete();
}

export function removeAllComposeDraftMedia(media: ComposeDraftMedia[]): void {
  media.forEach(item => {
    try {
      removeComposeDraftMedia(item);
    } catch {
      // A missing or OS-removed file must not block draft removal or publish.
    }
  });
}

/* end of ComposeDraftMediaService.ts */
