/*
    Project: Hoot Unfathomably
    --------------------------

    File: UnfathomablyProfileService.ts

    Purpose:

        Update the authenticated profile through the standard credentials API.

    Responsibilities:

        - Encode profile text, privacy flags, metadata fields, and images
        - Bound user-controlled field counts and lengths before upload
        - Return the server's authoritative updated account

    This file intentionally does NOT contain:

        - image selection or cropping
        - profile screen state
        - saved-context persistence
*/

import { request } from "./UnfathomablyService";
import type { UnfathomablyAccount } from "./UnfathomablyService";

export type ProfileFieldInput = {
  name: string;
  value: string;
};

export type ProfileImageInput = {
  mimeType?: string;
  name?: string;
  uri: string;
};

export type UpdateProfileInput = {
  avatar?: ProfileImageInput;
  bot?: boolean;
  discoverable?: boolean;
  displayName: string;
  fields: ProfileFieldInput[];
  header?: ProfileImageInput;
  locked?: boolean;
  note: string;
};

function appendBoolean(form: FormData, name: string, value: boolean | undefined) {
  if (value !== undefined) form.append(name, value ? "true" : "false");
}

function appendImage(
  form: FormData,
  name: "avatar" | "header",
  image: ProfileImageInput | undefined,
) {
  if (!image?.uri.trim()) return;
  form.append(name, {
    name: image.name?.trim().slice(0, 500) || `${name}.jpg`,
    type: image.mimeType?.trim().slice(0, 200) || "image/jpeg",
    uri: image.uri,
  } as unknown as Blob);
}

export function updateProfile(
  ctx: LotideContext,
  input: UpdateProfileInput,
) {
  const form = new FormData();
  form.append("display_name", input.displayName.slice(0, 200));
  form.append("note", input.note.slice(0, 5_000));
  appendBoolean(form, "bot", input.bot);
  appendBoolean(form, "discoverable", input.discoverable);
  appendBoolean(form, "locked", input.locked);
  input.fields.slice(0, 10).forEach((field, index) => {
    form.append(
      `fields_attributes[${index}][name]`,
      field.name.slice(0, 255),
    );
    form.append(
      `fields_attributes[${index}][value]`,
      field.value.slice(0, 2_048),
    );
  });
  appendImage(form, "avatar", input.avatar);
  appendImage(form, "header", input.header);

  return request<UnfathomablyAccount>(
    ctx,
    "/api/v1/accounts/update_credentials",
    { method: "PATCH", body: form },
  );
}

/* end of UnfathomablyProfileService.ts */
