declare module "node:sqlite" {
  export class StatementSync {
    run(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  }

  export class DatabaseSync {
    constructor(path: string);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
  }

  export class Session {}

  export const constants: Record<string, unknown>;

  export function backup(...args: unknown[]): unknown;
}
