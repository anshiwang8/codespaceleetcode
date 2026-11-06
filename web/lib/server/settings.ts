import "server-only";
import { z } from "zod";
import type { AppearanceSettings, ProfileDetails, ProfileLinks } from "@/lib/api-types";
import {
  bioField,
  birthdayField,
  LIMITS,
  LINK_PLATFORMS,
  linkField,
  linkLabelField,
  oneLine,
  type FieldResult,
} from "@/lib/profile-fields";
import { getPool } from "@/lib/server/db";
import { THEMES } from "@/lib/themes/catalog.generated";
import type { ThemePreference } from "@/lib/themes/runtime";

// Editable profile details, links and appearance. Every function takes the signed-in user's id
// from the caller (who got it from getCurrentUser) and touches only that user's rows. Writes go to
// codebases' own tables, never to Better Auth's: a GitHub sign-in can't overwrite them, and editing
// them can't change the login, provider or account ownership.

const THEME_IDS = new Set(THEMES.map((theme) => theme.id));

/** Field errors keyed by field name, for the form to show next to each field. */
export type FieldErrors = Record<string, string>;
export type Validated<T> = { ok: true; value: T } | { ok: false; errors: FieldErrors };

function collect<T extends object>(results: { [K in keyof T]: FieldResult<T[K]> }): Validated<T> {
  const errors: FieldErrors = {};
  const value = {} as T;
  for (const [key, result] of Object.entries(results) as [keyof T & string, FieldResult<unknown>][]) {
    if (result.ok) value[key] = result.value as T[typeof key];
    else errors[key] = result.error;
  }
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, value };
}

/** The request body for details: these four keys only, each a string or null. */
export const detailsBody = z.strictObject({
  displayName: z.string().max(400).nullable(),
  pronouns: z.string().max(400).nullable(),
  bio: z.string().max(4000).nullable(),
  birthday: z.string().max(20).nullable(),
});

export function validateDetails(body: z.infer<typeof detailsBody>, now: Date = new Date()): Validated<ProfileDetails> {
  return collect<ProfileDetails>({
    displayName: oneLine(body.displayName, LIMITS.displayName, "Display name"),
    pronouns: oneLine(body.pronouns, LIMITS.pronouns, "Pronouns"),
    bio: bioField(body.bio),
    birthday: birthdayField(body.birthday, now),
  });
}

export const linksBody = z.strictObject({
  linkedin: z.string().max(2000).nullable(),
  github: z.string().max(2000).nullable(),
  website: z.string().max(2000).nullable(),
  x: z.string().max(2000).nullable(),
  bluesky: z.string().max(2000).nullable(),
  mastodon: z.string().max(2000).nullable(),
  custom: z.array(z.strictObject({ label: z.string().max(400), url: z.string().max(2000) })).max(LIMITS.customLinks),
});

export function validateLinks(body: z.infer<typeof linksBody>): Validated<ProfileLinks> {
  const errors: FieldErrors = {};
  const links: ProfileLinks = { custom: [] };
  for (const platform of LINK_PLATFORMS) {
    const result = linkField(body[platform], platform);
    if (!result.ok) errors[platform] = result.error;
    else if (result.value) links[platform] = result.value;
  }
  body.custom.forEach((entry, index) => {
    const label = linkLabelField(entry.label);
    const url = linkField(entry.url, "custom");
    if (!label.ok) errors[`custom.${index}.label`] = label.error;
    if (!url.ok) errors[`custom.${index}.url`] = url.error;
    if (label.ok && url.ok) {
      if (label.value && url.value) links.custom.push({ label: label.value, url: url.value });
      else if (label.value && !url.value) errors[`custom.${index}.url`] = "Add a link for this label, or remove the row.";
      else if (!label.value && url.value) errors[`custom.${index}.label`] = "Give this link a label.";
    }
  });
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, value: links };
}

/** Reads stored links back, keeping only well-formed entries, so the shape is always right. */
export function storedLinks(value: unknown): ProfileLinks {
  const links: ProfileLinks = { custom: [] };
  if (typeof value !== "object" || value === null) return links;
  const record = value as Record<string, unknown>;
  for (const platform of LINK_PLATFORMS) {
    const result = linkField(record[platform], platform);
    if (result.ok && result.value) links[platform] = result.value;
  }
  if (Array.isArray(record.custom)) {
    for (const entry of record.custom.slice(0, LIMITS.customLinks)) {
      const item = entry as Record<string, unknown>;
      const label = linkLabelField(item?.label);
      const url = linkField(item?.url, "custom");
      if (label.ok && url.ok && label.value && url.value) links.custom.push({ label: label.value, url: url.value });
    }
  }
  return links;
}

export const preferenceSchema = z.union([
  z.strictObject({ mode: z.literal("system") }),
  z.strictObject({ mode: z.literal("theme"), id: z.string().regex(/^[a-z0-9-]{1,40}$/) }),
]);

export const preferencesBody = z
  .strictObject({
    preference: preferenceSchema.optional(),
    favorites: z.array(z.string().regex(/^[a-z0-9-]{1,40}$/)).max(200).optional(),
  })
  .refine((body) => body.preference !== undefined || body.favorites !== undefined);

export interface ProfileRecord {
  details: ProfileDetails;
  links: ProfileLinks;
}

export async function getProfileRecord(userId: string): Promise<ProfileRecord> {
  const { rows } = await getPool().query<{
    display_name: string | null;
    pronouns: string | null;
    bio: string | null;
    birthday: string | null;
    links: unknown;
  }>(
    `select display_name, pronouns, bio, to_char(birthday, 'YYYY-MM-DD') as birthday, links
       from user_profiles where user_id = $1`,
    [userId],
  );
  const row = rows[0];
  return {
    details: {
      displayName: row?.display_name ?? null,
      pronouns: row?.pronouns ?? null,
      bio: row?.bio ?? null,
      birthday: row?.birthday ?? null,
    },
    links: storedLinks(row?.links ?? {}),
  };
}

/** Saves details only; links and everything else are untouched. */
export async function saveDetails(userId: string, details: ProfileDetails): Promise<void> {
  await getPool().query(
    `insert into user_profiles (user_id, display_name, pronouns, bio, birthday, updated_at)
     values ($1, $2, $3, $4, $5::date, now())
     on conflict (user_id) do update
       set display_name = excluded.display_name, pronouns = excluded.pronouns, bio = excluded.bio,
           birthday = excluded.birthday, updated_at = now()`,
    [userId, details.displayName, details.pronouns, details.bio, details.birthday],
  );
}

/** Saves links only; details are untouched. */
export async function saveLinks(userId: string, links: ProfileLinks): Promise<void> {
  await getPool().query(
    `insert into user_profiles (user_id, links, updated_at) values ($1, $2::jsonb, now())
     on conflict (user_id) do update set links = excluded.links, updated_at = now()`,
    [userId, JSON.stringify(links)],
  );
}

export async function getAppearance(userId: string): Promise<AppearanceSettings> {
  const { rows } = await getPool().query<{ theme_mode: string | null; theme_id: string | null; favorite_themes: string[] }>(
    "select theme_mode, theme_id, favorite_themes from user_preferences where user_id = $1",
    [userId],
  );
  const row = rows[0];
  let preference: ThemePreference | null = null;
  if (row?.theme_mode === "system") preference = { mode: "system" };
  else if (row?.theme_mode === "theme" && row.theme_id && THEME_IDS.has(row.theme_id)) {
    preference = { mode: "theme", id: row.theme_id };
  }
  return { preference, favorites: (row?.favorite_themes ?? []).filter((id) => THEME_IDS.has(id)) };
}

/** Saves the theme and/or favorites. Unknown theme IDs are refused; unknown favorites dropped. */
export async function saveAppearance(
  userId: string,
  body: z.infer<typeof preferencesBody>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (body.preference?.mode === "theme" && !THEME_IDS.has(body.preference.id)) return { ok: false, error: "Unknown theme" };
  const favorites = body.favorites ? [...new Set(body.favorites.filter((id) => THEME_IDS.has(id)))] : null;
  const mode = body.preference?.mode ?? null;
  const id = body.preference?.mode === "theme" ? body.preference.id : null;
  await getPool().query(
    `insert into user_preferences (user_id, theme_mode, theme_id, favorite_themes, updated_at)
     values ($1, $2, $3, coalesce($4::text[], '{}'), now())
     on conflict (user_id) do update set
       theme_mode = case when $5 then excluded.theme_mode else user_preferences.theme_mode end,
       theme_id = case when $5 then excluded.theme_id else user_preferences.theme_id end,
       favorite_themes = coalesce($4::text[], user_preferences.favorite_themes),
       updated_at = now()`,
    [userId, mode, id, favorites, body.preference !== undefined],
  );
  return { ok: true };
}

/** What every signed-in page needs about the account: no email address, no birthday. */
export async function getAccountSummary(userId: string): Promise<{
  displayName: string | null;
  avatarVersion: string | null;
  needsEmail: boolean;
  appearance: AppearanceSettings;
}> {
  const [summary, appearance] = await Promise.all([
    getPool().query<{ display_name: string | null; version: string | null; has_email: boolean }>(
      `select p.display_name, a.version, exists (select 1 from user_emails e where e.user_id = $1) as has_email
         from (select $1::uuid as id) u
         left join user_profiles p on p.user_id = u.id
         left join user_avatars a on a.user_id = u.id`,
      [userId],
    ),
    getAppearance(userId),
  ]);
  const row = summary.rows[0];
  return {
    displayName: row?.display_name ?? null,
    avatarVersion: row?.version ?? null,
    needsEmail: !row?.has_email,
    appearance,
  };
}
