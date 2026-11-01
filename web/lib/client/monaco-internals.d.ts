// The one piece of Monaco's internals this app touches. See lib/client/monaco.ts.
declare module "monaco-editor/base/common/errors.js" {
  export const errorHandler: { unexpectedErrorHandler: (error: unknown) => void };
}
