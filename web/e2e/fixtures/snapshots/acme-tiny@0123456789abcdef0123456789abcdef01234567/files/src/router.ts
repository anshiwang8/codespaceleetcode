import { renderNotFound } from "./views";

export class Router {
  handle(path: string, port: number): string {
    if (this.match(path)) {
      return `ok on ${port}`;
    }
    return renderNotFound(path);
  }

  match(path: string): boolean {
    const trimmed = path.trim();
    return trimmed.startsWith("/");
  }
}
