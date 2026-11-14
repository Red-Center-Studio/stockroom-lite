import { Hono } from "hono";
import type { AppEnv } from "../env";
import { Card, H1 } from "../views/components";
import { render } from "./render";

export const miscRoutes = new Hono<AppEnv>();

miscRoutes.get("/terms", async (c) => {
  const s = c.get("settings");
  return render(
    c,
    { title: "Terms of use" },
    <>
      <H1>Terms of use</H1>
      <Card>
        <div class="space-y-3">
          <p>
            This app is run by {s.businessName} for its staff and contractors. By using it you agree to record stock
            honestly and as soon as you can: what you use, receive, move, waste and count.
          </p>
          <p>Do not share your sign-in. Everything you record is saved with your name and the time.</p>
          <p>
            Questions about this app go to {s.businessName}
            {s.supportEmail ? (
              <>
                {" "}
                at{" "}
                <a class="text-primary underline" href={`mailto:${s.supportEmail}`}>
                  {s.supportEmail}
                </a>
              </>
            ) : null}
            .
          </p>
        </div>
      </Card>
    </>,
  );
});

miscRoutes.get("/privacy", async (c) => {
  const s = c.get("settings");
  return render(
    c,
    { title: "Privacy" },
    <>
      <H1>Privacy</H1>
      <Card>
        <div class="space-y-3">
          <p>
            {s.businessName} stores your name, your email, and the stock records you make (with the time). This is used
            to run the business's stock, and nothing else.
          </p>
          <p>
            The data is kept in {s.businessName}'s own Cloudflare account. It is not sold or shared with advertisers.
            There are no tracking or advertising cookies; the app only uses cookies to keep you signed in and to protect
            forms.
          </p>
          <p>
            To see, correct or remove your details, ask {s.businessName}
            {s.supportEmail ? (
              <>
                {" "}
                at{" "}
                <a class="text-primary underline" href={`mailto:${s.supportEmail}`}>
                  {s.supportEmail}
                </a>
              </>
            ) : null}
            .
          </p>
        </div>
      </Card>
    </>,
  );
});

miscRoutes.get("/healthz", (c) => c.json({ ok: true }));
miscRoutes.get("/favicon.ico", (c) => c.redirect("/favicon.svg", 301));
