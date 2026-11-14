import type { Child, FC } from "hono/jsx";
import { CSRF_FIELD } from "../lib/csrf-field";
import { statusLabel, type StockStatus } from "../services/levels";

export const Csrf: FC<{ token: string }> = ({ token }) => <input type="hidden" name={CSRF_FIELD} value={token} />;

/** Page title banner. `action` is an optional button shown on the right, such as "Add item". */
export const H1: FC<{ children?: Child; sub?: string | undefined; action?: Child }> = ({ children, sub, action }) => (
  <div class="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-brand-800 px-5 py-4 text-white shadow-md">
    <div class="min-w-0">
      <h1 class="text-2xl font-bold tracking-tight">{children}</h1>
      {sub ? <p class="mt-1 text-brand-200">{sub}</p> : null}
    </div>
    {action ? <div class="flex flex-wrap gap-2">{action}</div> : null}
  </div>
);

export const Card: FC<{ children?: Child; class?: string; id?: string; label?: string }> = (props) => (
  <section
    id={props.id}
    aria-label={props.label}
    class={`rounded-2xl border border-line bg-white p-4 shadow-md shadow-brand/5 sm:p-5 ${props.class ?? ""}`}
  >
    {props.children}
  </section>
);

export const H2: FC<{ children?: Child; id?: string }> = ({ children, id }) => (
  <h2 id={id} class="mb-3 border-l-4 border-primary pl-3 text-lg font-bold text-brand">
    {children}
  </h2>
);

type Tone = "info" | "success" | "error" | "warning";
const toneClass: Record<Tone, string> = {
  info: "border-primary-200 bg-primary-50 text-ink",
  success: "border-success-200 bg-success-50 text-success",
  error: "border-danger-200 bg-danger-50 text-danger",
  warning: "border-alert-200 bg-alert-50 text-ink",
};

export const Alert: FC<{ tone?: Tone; children?: Child; id?: string }> = ({ tone = "info", children, id }) => (
  <div
    id={id}
    role={tone === "error" ? "alert" : "status"}
    class={`mb-4 rounded-xl border px-4 py-3 text-sm ${toneClass[tone]}`}
  >
    {children}
  </div>
);

const inputClass =
  "block w-full rounded-xl border border-gray-500 bg-white px-3 py-3 text-base focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary";

interface FieldProps {
  label: string;
  name: string;
  type?: string;
  value?: string | number | null | undefined;
  required?: boolean;
  autocomplete?: string;
  inputmode?: "numeric" | "decimal" | "email" | "text" | "search";
  hint?: string;
  maxlength?: number;
  min?: number | string;
  max?: number | string;
  step?: string;
  pattern?: string;
  placeholder?: string;
  id?: string;
  /** Id of a <datalist> with suggestions. */
  list?: string;
  /** Hide the "(optional)" note, for fields inside a table row. */
  bare?: boolean;
  class?: string;
}

export const Field: FC<FieldProps> = (p) => {
  const id = p.id ?? `f-${p.name}`;
  return (
    <div class={p.class ?? "mb-4"}>
      <label for={id} class="mb-1 block text-sm font-medium">
        {p.label}
        {p.required || p.bare ? null : <span class="font-normal text-gray-600"> (optional)</span>}
      </label>
      <input
        id={id}
        name={p.name}
        type={p.type ?? "text"}
        value={p.value === null || p.value === undefined ? "" : String(p.value)}
        required={p.required}
        autocomplete={p.autocomplete}
        inputmode={p.inputmode}
        maxlength={p.maxlength}
        min={p.min}
        max={p.max}
        step={p.step}
        pattern={p.pattern}
        placeholder={p.placeholder}
        list={p.list}
        aria-describedby={p.hint ? `${id}-hint` : undefined}
        class={inputClass}
      />
      {p.hint ? (
        <p id={`${id}-hint`} class="mt-1 text-sm text-gray-700">
          {p.hint}
        </p>
      ) : null}
    </div>
  );
};

/** A number box that accepts decimals and shows the numeric keypad on phones. */
export const QtyField: FC<Omit<FieldProps, "type" | "inputmode">> = (p) => (
  <Field {...p} type="text" inputmode="decimal" pattern="[0-9]*[.,]?[0-9]*" autocomplete="off" />
);

export interface Option {
  value: string;
  label: string;
}

export const Select: FC<{
  label: string;
  name: string;
  options: Option[];
  value?: string | null | undefined;
  required?: boolean;
  hint?: string;
  id?: string;
  /** Text for an empty first option, such as "Pick an item". */
  placeholder?: string;
  class?: string;
  /** Submit the form when the choice changes (with JS), for filter bars. */
  autosubmit?: boolean;
}> = (p) => {
  const id = p.id ?? `f-${p.name}`;
  return (
    <div class={p.class ?? "mb-4"}>
      <label for={id} class="mb-1 block text-sm font-medium">
        {p.label}
        {p.required || p.placeholder === undefined ? null : <span class="font-normal text-gray-600"> (optional)</span>}
      </label>
      <select
        id={id}
        name={p.name}
        required={p.required}
        data-autosubmit={p.autosubmit ? "1" : undefined}
        aria-describedby={p.hint ? `${id}-hint` : undefined}
        class={inputClass}
      >
        {p.placeholder !== undefined ? <option value="">{p.placeholder}</option> : null}
        {p.options.map((o) => (
          <option value={o.value} selected={o.value === (p.value ?? "")}>
            {o.label}
          </option>
        ))}
      </select>
      {p.hint ? (
        <p id={`${id}-hint`} class="mt-1 text-sm text-gray-700">
          {p.hint}
        </p>
      ) : null}
    </div>
  );
};

export const TextArea: FC<{
  label: string;
  name: string;
  value?: string;
  maxlength: number;
  rows?: number;
  required?: boolean;
  hint?: string;
  id?: string;
}> = (p) => {
  const id = p.id ?? `f-${p.name}`;
  return (
    <div class="mb-4">
      <label for={id} class="mb-1 block text-sm font-medium">
        {p.label}
        {p.required ? null : <span class="font-normal text-gray-600"> (optional)</span>}
      </label>
      <textarea
        id={id}
        name={p.name}
        rows={p.rows ?? 3}
        maxlength={p.maxlength}
        required={p.required}
        aria-describedby={p.hint ? `${id}-hint` : undefined}
        class={inputClass}
      >
        {p.value ?? ""}
      </textarea>
      {p.hint ? (
        <p id={`${id}-hint`} class="mt-1 text-sm text-gray-700">
          {p.hint}
        </p>
      ) : null}
    </div>
  );
};

export const Checkbox: FC<{ label: string; name: string; checked?: boolean; hint?: string; id?: string }> = (p) => {
  const id = p.id ?? `f-${p.name}`;
  return (
    <div class="mb-4 flex items-start gap-3">
      <label class="-m-2.5 flex size-11 shrink-0 items-center justify-center">
        <input
          id={id}
          type="checkbox"
          name={p.name}
          value="1"
          checked={p.checked}
          aria-describedby={p.hint ? `${id}-hint` : undefined}
          class="size-6 accent-primary"
        />
      </label>
      <div>
        <label for={id} class="font-medium">
          {p.label}
        </label>
        {p.hint ? (
          <p id={`${id}-hint`} class="text-sm text-gray-700">
            {p.hint}
          </p>
        ) : null}
      </div>
    </div>
  );
};

type ButtonKind = "primary" | "secondary" | "danger" | "ghost" | "accent";
const buttonClass: Record<ButtonKind, string> = {
  primary: "bg-primary text-white hover:bg-primary-dark",
  secondary: "border border-gray-500 bg-white text-ink hover:bg-gray-50",
  danger: "border border-danger-200 bg-white text-danger hover:bg-danger-50",
  ghost: "text-primary underline-offset-2 hover:bg-primary-50 hover:underline",
  accent: "bg-primary text-white shadow-md hover:bg-primary-dark",
};

export const btn = (kind: ButtonKind = "primary", extra = "") =>
  `inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold focus:outline-none focus-visible:ring-4 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-60 ${buttonClass[kind]} ${extra}`;

export const Button: FC<{
  kind?: ButtonKind;
  children?: Child;
  type?: "submit" | "button";
  name?: string;
  value?: string;
  class?: string;
  full?: boolean;
  confirm?: string;
  form?: string;
  label?: string;
}> = (p) => (
  <button
    type={p.type ?? "submit"}
    name={p.name}
    value={p.value}
    form={p.form}
    aria-label={p.label}
    data-confirm={p.confirm}
    class={btn(p.kind, `${p.full ? "w-full" : ""} ${p.class ?? ""}`)}
  >
    {p.children}
  </button>
);

const statusTone: Record<StockStatus, string> = {
  out: "bg-danger text-white",
  low: "bg-alert-100 text-alert-700 ring-1 ring-alert-200",
  ok: "bg-success-50 text-success ring-1 ring-success-200",
  untracked: "bg-gray-100 text-gray-700 ring-1 ring-gray-300",
};

export const StatusBadge: FC<{ status: StockStatus }> = ({ status }) => (
  <span class={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusTone[status]}`}>
    {statusLabel[status]}
  </span>
);

export const Badge: FC<{ children?: Child; tone?: "neutral" | "warn" | "danger" | "good" }> = ({
  children,
  tone = "neutral",
}) => {
  const cls = {
    neutral: "bg-gray-100 text-gray-800 ring-1 ring-gray-300",
    warn: "bg-alert-100 text-alert-700 ring-1 ring-alert-200",
    danger: "bg-danger-50 text-danger ring-1 ring-danger-200",
    good: "bg-success-50 text-success ring-1 ring-success-200",
  }[tone];
  return (
    <span class={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>
      {children}
    </span>
  );
};

/** A number tile on the dashboard. Links to the list behind the number. */
export const Stat: FC<{
  label: string;
  value: string | number;
  href: string;
  tone?: "danger" | "warn" | "info" | "plain";
}> = ({ label, value, href, tone = "plain" }) => {
  const bar = { danger: "border-l-danger", warn: "border-l-warn", info: "border-l-primary", plain: "border-l-line" }[
    tone
  ];
  return (
    <a
      href={href}
      class={`block rounded-2xl border border-line border-l-8 ${bar} bg-white p-4 shadow-sm hover:shadow-md focus:outline-none focus-visible:ring-4 focus-visible:ring-primary focus-visible:ring-offset-2`}
    >
      <span class="block text-3xl font-bold tabular-nums text-brand">{value}</span>
      <span class="mt-1 block text-sm font-medium text-gray-700">{label}</span>
    </a>
  );
};

export const Empty: FC<{ children?: Child }> = ({ children }) => (
  <div class="rounded-2xl border-2 border-dashed border-line bg-white/70 p-6 text-center text-gray-700">{children}</div>
);

/** A table that scrolls sideways on narrow screens instead of breaking the page. */
export const Table: FC<{ caption: string; children?: Child; captionHidden?: boolean }> = ({
  caption,
  children,
  captionHidden,
}) => (
  <div class="-mx-4 overflow-x-auto sm:mx-0" tabindex={0} role="region" aria-label={caption}>
    <table class="w-full min-w-[34rem] border-collapse text-left text-sm">
      <caption class={captionHidden ? "sr-only" : "mb-2 text-left font-semibold"}>{caption}</caption>
      {children}
    </table>
  </div>
);

export const Th: FC<{ children?: Child; class?: string }> = ({ children, class: cls }) => (
  <th
    scope="col"
    class={`border-b-2 border-line px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-700 ${cls ?? ""}`}
  >
    {children}
  </th>
);

export const Td: FC<{ children?: Child; class?: string }> = ({ children, class: cls }) => (
  <td class={`border-b border-line/70 px-3 py-2.5 align-top ${cls ?? ""}`}>{children}</td>
);

/** "Showing 1 to 100", with previous and next links that keep the other filters. */
export const Pager: FC<{ base: URLSearchParams; offset: number; size: number; shown: number; path: string }> = (p) => {
  const link = (o: number) => {
    const q = new URLSearchParams(p.base);
    if (o > 0) q.set("offset", String(o));
    else q.delete("offset");
    const s = q.toString();
    return s ? `${p.path}?${s}` : p.path;
  };
  if (p.offset === 0 && p.shown < p.size) return null;
  return (
    <nav aria-label="Pages" class="mt-4 flex items-center justify-between gap-3">
      {p.offset > 0 ? (
        <a class={btn("secondary")} href={link(Math.max(0, p.offset - p.size))}>
          Newer
        </a>
      ) : (
        <span />
      )}
      {p.shown === p.size ? (
        <a class={btn("secondary")} href={link(p.offset + p.size)}>
          Older
        </a>
      ) : null}
    </nav>
  );
};
