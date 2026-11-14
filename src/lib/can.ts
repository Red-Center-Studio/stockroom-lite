import type { Role } from "../labels";

/**
 * Every permission rule in one place. Routes call `can()` on the server before doing anything, so hiding a
 * button is never the only protection. A user with no role (waiting for approval) can do nothing.
 *
 * | Action          | Staff | Manager | Admin |
 * | --------------- | ----- | ------- | ----- |
 * | stock:view      | yes   | yes     | yes   |
 * | stock:record    | yes   | yes     | yes   |  use, waste, receive, move between places
 * | stock:count     | yes   | yes     | yes   |
 * | stock:adjust    | no    | yes     | yes   |  corrections that are not a count
 * | catalog:edit    | no    | yes     | yes   |  items, locations, min and par levels
 * | data:export     | no    | yes     | yes   |  CSV exports
 * | cost:view       | no    | yes     | yes   |  costs and stock value
 * | settings:edit   | no    | no      | yes   |
 * | team:manage     | no    | no      | yes   |
 */

export type Action =
  | "stock:view"
  | "stock:record"
  | "stock:count"
  | "stock:adjust"
  | "catalog:edit"
  | "data:export"
  | "cost:view"
  | "settings:edit"
  | "team:manage";

export interface Actor {
  role: Role | null;
}

const EVERY_ROLE: readonly Role[] = ["admin", "manager", "staff"];
const MANAGERS: readonly Role[] = ["admin", "manager"];
const ADMIN: readonly Role[] = ["admin"];

const allowed: Record<Action, readonly Role[]> = {
  "stock:view": EVERY_ROLE,
  "stock:record": EVERY_ROLE,
  "stock:count": EVERY_ROLE,
  "stock:adjust": MANAGERS,
  "catalog:edit": MANAGERS,
  "data:export": MANAGERS,
  "cost:view": MANAGERS,
  "settings:edit": ADMIN,
  "team:manage": ADMIN,
};

export function can(actor: Actor | null | undefined, action: Action): boolean {
  if (!actor || !actor.role) return false;
  if (!EVERY_ROLE.includes(actor.role)) return false;
  return allowed[action].includes(actor.role);
}

export const ALL_ACTIONS = Object.keys(allowed) as Action[];
