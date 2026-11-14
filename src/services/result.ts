/** What every service function returns: ok with an optional value, or a plain-language message to show. */
export type Result<T = undefined> = { ok: true; value?: T } | { ok: false; message: string };

export const denied = (what = "do that") => ({ ok: false as const, message: `Your role cannot ${what}.` });
