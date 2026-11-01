// A nested package: scip-typescript starts this file's namespaces at packages/lib.
import { aliased } from "@lib/aliased";

export namespace Tools {
  export function tool(): string {
    return "tool";
  }
}

export function inPackage(): string {
  return Tools.tool();
}

export function viaAlias(): string {
  return aliased();
}
