import type { ManifestFile } from "@/lib/api-types";

export interface TreeNode {
  name: string;
  /** Full path. Files use it as their canonical ID. */
  path: string;
  /** Null for a file. Directories first, then files, each in name order. */
  children: TreeNode[] | null;
}

interface Building {
  name: string;
  path: string;
  dirs: Map<string, Building>;
  files: TreeNode[];
}

function finish(node: Building): TreeNode[] {
  const byName = (a: { name: string }, b: { name: string }) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  const dirs = [...node.dirs.values()]
    .sort(byName)
    .map((dir) => ({ name: dir.name, path: dir.path, children: finish(dir) }));
  return [...dirs, ...node.files.sort(byName)];
}

/** Turns the manifest's flat list into a tree. Runs once per page, so 24,000 files is fine. */
export function buildTree(files: ManifestFile[]): TreeNode[] {
  const root: Building = { name: "", path: "", dirs: new Map(), files: [] };
  for (const file of files) {
    const parts = file.path.split("/");
    const fileName = parts.pop();
    if (fileName === undefined) continue;
    let current = root;
    for (const part of parts) {
      let next = current.dirs.get(part);
      if (!next) {
        next = {
          name: part,
          path: current.path ? `${current.path}/${part}` : part,
          dirs: new Map(),
          files: [],
        };
        current.dirs.set(part, next);
      }
      current = next;
    }
    current.files.push({ name: fileName, path: file.path, children: null });
  }
  return finish(root);
}

/** The directories that contain a path, outermost first. */
export function ancestorsOf(path: string): string[] {
  const parts = path.split("/");
  return parts.slice(0, -1).map((_, index) => parts.slice(0, index + 1).join("/"));
}
