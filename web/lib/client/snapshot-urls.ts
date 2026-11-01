// Where a snapshot's manifest and files are fetched from. Locally that's the /snapshots route; when
// NEXT_PUBLIC_SNAPSHOT_CDN_URL is set, the same paths under the CDN.

function cdnBase(): string {
  return (process.env.NEXT_PUBLIC_SNAPSHOT_CDN_URL ?? "").replace(/\/+$/, "");
}

export function resolveManifestUrl(manifestUrl: string, cdn: string = cdnBase()): string {
  if (/^https?:\/\//.test(manifestUrl)) return manifestUrl;
  return `${cdn}${manifestUrl}`;
}

/** Each path segment is encoded on its own, so spaces and `#` survive but `/` stays a separator. */
export function snapshotFileUrl(manifestUrl: string, filePath: string, cdn?: string): string {
  const manifest = resolveManifestUrl(manifestUrl, cdn);
  const folder = manifest.slice(0, manifest.lastIndexOf("/"));
  const encoded = filePath.split("/").map(encodeURIComponent).join("/");
  return `${folder}/files/${encoded}`;
}

export function githubTreeUrl(repoUrl: string, sha: string): string {
  return `${repoUrl}/tree/${sha}`;
}

export function githubFileUrl(repoUrl: string, sha: string, filePath: string): string {
  return `${repoUrl}/blob/${sha}/${filePath.split("/").map(encodeURIComponent).join("/")}`;
}
