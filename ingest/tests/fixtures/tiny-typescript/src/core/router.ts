import { Config, helper, wrap } from "../util";
import { Logged } from "./hidden";

export interface Handler {
  handle(path: string): string;
}

export const arrow = (path: string): string => helper(path);

export const wrapped = wrap((path: string) => helper(path));

export function exported(config: Config): string {
  return arrow(config.name);
}

export function overloaded(value: string): string;
export function overloaded(value: number): string;
export function overloaded(value: unknown): string {
  return helper(String(value));
}

export class Base {
  protected name = helper("base");
}

export class Router extends Base implements Handler {
  field = helper("field");
  routes: Handler[] = [];

  handler = (path: string): string => helper(path);

  constructor(private readonly config: Config) {
    super();
  }

  get size(): number {
    return helper("size").length;
  }

  set size(value: number) {
    this.resize(value);
  }

  private resize(value: number): void {
    helper(String(value));
  }

  @Logged
  handle(path: string): string {
    return this.handler(path);
  }

  typed(other: Router): Router {
    return other;
  }

  static create(config: Config): Router {
    return new Router(config);
  }
}

export default function (): Router {
  return Router.create({ name: "default" });
}

export const table = {
  method(path: string): string {
    return helper(path);
  },
  property: (path: string): string => helper(path),
};

export namespace Inner {
  export function nested(): string {
    return helper("nested");
  }
}
