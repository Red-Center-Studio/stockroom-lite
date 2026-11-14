import { Hono } from "hono";
import { csrf } from "hono/csrf";
import { secureHeaders } from "hono/secure-headers";
import { HTTPException } from "hono/http-exception";
import type { AppEnv, Bindings } from "./env";
import { createAuth } from "./auth/auth";
import { base, loadSettings, loadUser, verifyCsrf } from "./lib/middleware";
import { forbiddenHtml, notFoundHtml, serverErrorHtml } from "./views/errors";
import { authRoutes } from "./routes/auth";
import { accountRoutes } from "./routes/account";
import { activityRoutes } from "./routes/activity";
import { dashboardRoutes } from "./routes/dashboard";
import { itemRoutes } from "./routes/items";
import { locationRoutes } from "./routes/locations";
import { miscRoutes } from "./routes/misc";
import { recordRoutes } from "./routes/record";
import { setupRoutes } from "./routes/setup";
import { stockRoutes } from "./routes/stock";
import { runScheduled } from "./services/scheduled";

const MAX_BODY_BYTES = 1024 * 1024;

export const app = new Hono<AppEnv>();

app.use(
  secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", "data:"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      baseUri: ["'none'"],
      objectSrc: ["'none'"],
    },
    referrerPolicy: "same-origin",
    permissionsPolicy: { camera: [], microphone: [], geolocation: [] },
  }),
);
app.use(base);

// Reject oversized form posts before reading them. No form in the app sends anywhere near this much.
app.use(async (c, next) => {
  const length = Number(c.req.header("content-length") ?? "0");
  if (length > MAX_BODY_BYTES) return c.text("That form is too big to send.", 413);
  await next();
});

// Better Auth only needs two public endpoints: the links in verification and password reset emails.
// Everything else (sign in, sign up and so on) goes through this app's own forms and validation.
app.get("/api/auth/verify-email", (c) => createAuth(c.env, c.get("origin")).handler(c.req.raw));
app.get("/api/auth/reset-password/:token", (c) => createAuth(c.env, c.get("origin")).handler(c.req.raw));
app.all("/api/auth/*", (c) => c.notFound());

// Form posts must come from this site (Origin check) and carry the CSRF token.
app.use(csrf());
app.use(verifyCsrf);
app.use(loadUser);
app.use(loadSettings);

app.route("/", authRoutes);
app.route("/", dashboardRoutes);
app.route("/", stockRoutes);
app.route("/", recordRoutes);
app.route("/", itemRoutes);
app.route("/", locationRoutes);
app.route("/", activityRoutes);
app.route("/", setupRoutes);
app.route("/", accountRoutes);
app.route("/", miscRoutes);

app.notFound((c) => c.html(notFoundHtml({ user: c.get("user"), csrf: c.get("csrfToken") ?? "" }), 404));

app.onError((err, c) => {
  // Expected rejections (for example a form posted from another site) keep their own status.
  if (err instanceof HTTPException) {
    if (err.status === 403) return c.html(forbiddenHtml({ user: c.get("user"), csrf: c.get("csrfToken") ?? "" }), 403);
    return err.getResponse();
  }
  console.error(
    JSON.stringify({
      event: "unhandled_error",
      path: new URL(c.req.url).pathname,
      error: String(err),
      stack: err.stack,
    }),
  );
  return c.html(serverErrorHtml({ user: c.get("user"), csrf: c.get("csrfToken") ?? "" }), 500);
});

export default {
  fetch: app.fetch,
  // Runs once a day (see triggers in wrangler.jsonc). Only does anything in demo mode.
  scheduled(controller: ScheduledController, env: Bindings, ctx: ExecutionContext) {
    ctx.waitUntil(runScheduled(env, new Date(controller.scheduledTime)));
  },
} satisfies ExportedHandler<Bindings>;
