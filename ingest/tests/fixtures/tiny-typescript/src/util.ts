// The repo's own tsconfig includes only src/core, so this file is only reachable by import.
export interface Config {
  name: string;
}

export function helper(value: string): string {
  return value.trim();
}

export function wrap<T>(fn: T): T {
  return fn;
}
