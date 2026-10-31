// The repo's own tsconfig excludes this file. It must still be indexed.
export function Logged(target: object, key: string): void {
  console.log(target, key);
}
