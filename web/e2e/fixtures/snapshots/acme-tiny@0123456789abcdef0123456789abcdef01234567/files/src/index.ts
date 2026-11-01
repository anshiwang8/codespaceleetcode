import { DEFAULT_PORT } from "./config";
import { logRequest } from "./logging/logger";
import { Router } from "./router";

export function start(path: string): string {
  const router = new Router();
  logRequest(path);
  return router.handle(path, DEFAULT_PORT);
}
