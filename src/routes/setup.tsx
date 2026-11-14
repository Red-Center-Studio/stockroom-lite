import { Hono, type Context } from "hono";
import type { AppEnv } from "../env";
import { requirePermission } from "../lib/middleware";
import { COMMON_TIME_ZONES, DATE_FORMATS, UNIT_SYSTEMS } from "../lib/region";
import { firstError, formValues, id as idSchema, roleSchema, settingsSchema } from "../lib/validate";
import { COMMON_CURRENCIES, PENDING_LABEL, roleHelp, roleLabel, ROLES } from "../labels";
import { getSettings, updateSettings } from "../services/settings";
import { listTeam, setRole } from "../services/team";
import { Alert, btn, Button, Card, Checkbox, Csrf, Field, H1, H2, Select } from "../views/components";
import { flash, formBody, render } from "./render";

export const setupRoutes = new Hono<AppEnv>();

const MESSAGES = {
  saved: "Settings saved.",
  role: "Role updated.",
  removed: "Access removed. They have been signed out.",
};

async function setupPage(c: Context<AppEnv>, error?: string, values?: Record<string, string>, status: 200 | 400 = 200) {
  const db = c.get("db");
  const user = c.get("user")!;
  const s = await getSettings(db);
  const team = await listTeam(db, user);
  const v = (k: keyof typeof s) => values?.[k] ?? String(s[k] ?? "");
  const checked = (k: "showSetupOffer") => (values ? values[k] === "1" : s[k]);
  const pending = team.filter((m) => !m.role).length;
  const msg = flash(c, MESSAGES);
  return render(
    c,
    { title: "Setup", active: "setup", status },
    <>
      <H1 sub="Business details, region and team.">Setup</H1>
      {msg ? <Alert tone="success">{msg}</Alert> : null}
      {error ? <Alert tone="error">{error}</Alert> : null}
      {pending > 0 ? (
        <Alert tone="warning">
          {pending} {pending === 1 ? "person is" : "people are"} waiting for access.{" "}
          <a class="font-semibold underline" href="#team">
            Give them a role
          </a>
          .
        </Alert>
      ) : null}
      <form method="post" action="/setup" data-enhance>
        <Csrf token={c.get("csrfToken")} />
        <Card class="mb-5" label="Business">
          <H2>Business</H2>
          <div class="grid gap-x-4 sm:grid-cols-2">
            <Field
              label="Business name"
              name="businessName"
              value={v("businessName")}
              required
              maxlength={80}
              hint="Shown in the header and on emails."
            />
            <Field
              label="Support email"
              name="supportEmail"
              type="email"
              value={v("supportEmail")}
              maxlength={254}
              hint="Shown to your team on the terms and privacy pages."
            />
            <Field
              label="What you call a place"
              name="locationWord"
              value={v("locationWord")}
              required
              maxlength={30}
              hint="Location, Van, Room, Site, Kit. Used across the app."
            />
          </div>
        </Card>
        <Card class="mb-5" label="Region">
          <H2>Region</H2>
          <div class="grid gap-x-4 sm:grid-cols-2">
            <Field
              label="Currency"
              name="currency"
              value={v("currency")}
              required
              maxlength={3}
              list="currencies"
              hint="A 3-letter code, such as USD, EUR, GBP, AUD or JPY."
            />
            <datalist id="currencies">
              {COMMON_CURRENCIES.map((x) => (
                <option value={x} />
              ))}
            </datalist>
            <Select
              label="Units offered first"
              name="unitSystem"
              options={Object.entries(UNIT_SYSTEMS).map(([value, label]) => ({ value, label }))}
              value={v("unitSystem")}
              required
              hint="Any unit can still be typed for an item."
            />
            <Select
              label="Date format"
              name="dateFormat"
              options={Object.entries(DATE_FORMATS).map(([value, d]) => ({
                value,
                label: `${d.label} (${d.example})`,
              }))}
              value={v("dateFormat")}
              required
            />
            <Field
              label="Time zone"
              name="timeZone"
              value={v("timeZone")}
              list="zones"
              maxlength={64}
              hint={`Empty uses ${c.env.TIME_ZONE || "UTC"} from the app settings.`}
            />
            <datalist id="zones">
              {COMMON_TIME_ZONES.map((z) => (
                <option value={z} />
              ))}
            </datalist>
          </div>
        </Card>
        <Card class="mb-5" label="Help">
          <H2>Help</H2>
          <Checkbox
            label="Show the setup help offer on the home page"
            name="showSetupOffer"
            checked={checked("showSetupOffer")}
          />
        </Card>
        <Button>Save settings</Button>
      </form>

      <Card class="mt-6" id="team" label="Team">
        <H2>Team</H2>
        <p class="mb-3 text-sm text-gray-700">
          People sign up at {c.get("origin")}/signup, then wait here until you give them a role.
        </p>
        <ul class="mb-4 grid gap-2 text-sm sm:grid-cols-3">
          {ROLES.map((r) => (
            <li class="rounded-xl bg-gray-50 p-3">
              <strong>{roleLabel[r]}:</strong> {roleHelp[r]}
            </li>
          ))}
        </ul>
        <ul class="divide-y divide-line">
          {team.map((m) => (
            <li class="flex flex-wrap items-center justify-between gap-3 py-3">
              <div class="min-w-0">
                <p class="font-semibold">
                  {m.name}
                  {m.id === user.id ? " (you)" : ""}
                </p>
                <p class="truncate text-sm text-gray-700">
                  {m.email}. {m.role ? roleLabel[m.role] : <strong class="text-danger">{PENDING_LABEL}</strong>}
                </p>
              </div>
              <div class="flex flex-wrap items-end gap-2">
                <form method="post" action={`/setup/team/${m.id}/role`} class="flex items-end gap-2" data-enhance>
                  <Csrf token={c.get("csrfToken")} />
                  <Select
                    label={`Role for ${m.name}`}
                    name="role"
                    id={`role-${m.id}`}
                    options={ROLES.map((r) => ({ value: r, label: roleLabel[r] }))}
                    value={m.role ?? "staff"}
                    class="mb-0"
                  />
                  <Button kind="secondary">{m.role ? "Change" : "Give access"}</Button>
                </form>
                {m.role && m.id !== user.id ? (
                  <form method="post" action={`/setup/team/${m.id}/remove`} data-enhance>
                    <Csrf token={c.get("csrfToken")} />
                    <Button kind="danger" confirm={`Remove ${m.name}'s access? They are signed out straight away.`}>
                      Remove access
                    </Button>
                  </form>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <Card class="mt-6" label="Export">
        <H2>Export</H2>
        <p class="mb-3">Download everything for your accountant or a backup.</p>
        <p class="flex flex-wrap gap-2">
          <a class={btn("secondary")} href="/stock/export.csv">
            Stock CSV
          </a>
          <a class={btn("secondary")} href="/activity.csv">
            Activity CSV
          </a>
        </p>
      </Card>
    </>,
  );
}

setupRoutes.get("/setup", requirePermission("settings:edit"), (c) => setupPage(c));

setupRoutes.post("/setup", requirePermission("settings:edit"), async (c) => {
  const values = formValues(await formBody(c));
  const parsed = settingsSchema.safeParse(values);
  if (!parsed.success) return setupPage(c, firstError(parsed.error), values, 400);
  const res = await updateSettings(c.get("db"), c.get("user")!, parsed.data);
  if (!res.ok) return setupPage(c, res.message, values, 400);
  return c.redirect("/setup?m=saved", 303);
});

setupRoutes.post("/setup/team/:id/role", requirePermission("team:manage"), async (c) => {
  const target = idSchema.safeParse(c.req.param("id"));
  const role = roleSchema.safeParse(formValues(await formBody(c)));
  if (!target.success || !role.success) return setupPage(c, "Pick a role.", undefined, 400);
  const res = await setRole(c.get("db"), c.get("user")!, target.data, role.data.role);
  if (!res.ok) return setupPage(c, res.message, undefined, 400);
  return c.redirect("/setup?m=role#team", 303);
});

setupRoutes.post("/setup/team/:id/remove", requirePermission("team:manage"), async (c) => {
  const target = idSchema.safeParse(c.req.param("id"));
  if (!target.success) return c.notFound();
  const res = await setRole(c.get("db"), c.get("user")!, target.data, null);
  if (!res.ok) return setupPage(c, res.message, undefined, 400);
  return c.redirect("/setup?m=removed#team", 303);
});
