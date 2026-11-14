# Setting up Binwright Lite

This guide takes you from the downloaded code to your own live Binwright Lite, step by step. You do not need to be a
developer. Each command is explained in plain words. Expect it to take about 20 minutes the first time.

Everything runs in **your own Cloudflare account**. Cloudflare's free plan covers a typical small business; check
their current pricing for your size.

Would rather not do it yourself? The Turnkey Setup installs Binwright for you, with your items, places and team
loaded: see [redcenterstudio.com/binwright](https://redcenterstudio.com/binwright/).

## The quickest way: the Deploy to Cloudflare button

If you have a Cloudflare account and a GitHub account, you can skip most of this guide:

1. Click **Deploy to Cloudflare** at the top of the README.
2. Sign in to Cloudflare and connect GitHub when asked. Cloudflare copies Binwright Lite into a new repository in your
   GitHub account and creates the database for you.
3. When it asks for **AUTH_SECRET**, paste a long random string of at least 32 characters (see Step 4 below for a
   one-line way to make one). Do not keep the example value: the app refuses to start with it.
4. Click **Create and deploy** and wait a few minutes. Open the address it shows and create your account. The first
   account becomes the Admin. Then carry on from Step 6 below.

Every change you push to that GitHub repository deploys automatically. The rest of this guide is the manual way, which
gives you a copy on your own computer as well.

## What you need

1. **A Cloudflare account.** Free. Sign up at [dash.cloudflare.com](https://dash.cloudflare.com/sign-up).
2. **Node.js 22.18 or newer.** This runs the setup tools on your computer. Download the "LTS" version from
   [nodejs.org](https://nodejs.org) and install it with the default options.
3. **The Binwright Lite code** in a folder on your computer. On the GitHub page, click the green **Code** button, then
   **Download ZIP**, and unzip it. Or clone it with `git clone`.

To run the commands below, open a terminal in the Binwright Lite folder:

- **Windows:** open the folder in File Explorer, click the address bar, type `powershell` and press Enter.
- **Mac:** right-click the folder in Finder and choose "New Terminal at Folder".

## Step 1: Install the tools

```bash
npm install
```

This downloads the libraries Binwright Lite uses into a `node_modules` folder. It takes a minute or two. You only do
it once (and again after you update the code).

## Step 2: Try it on your computer (optional)

```bash
cp .dev.vars.example .dev.vars
npm run dev
```

- The first line makes a settings file for local testing. On Windows PowerShell use
  `Copy-Item .dev.vars.example .dev.vars` instead.
- The second line builds the styles, creates a local database and starts the app on your computer.

Open [http://localhost:8787](http://localhost:8787). Create an account: the **first account becomes the Admin**.
Press `Ctrl + C` in the terminal to stop it.

Want sample data to click around? Run `npm run seed:local` (this wipes your local test database first). Then sign in
with `admin@demo.binwright.example` and the password `binwright-lite-demo`.

## Step 3: Sign in to Cloudflare

```bash
npx wrangler login
```

This opens your browser and asks you to allow Wrangler (Cloudflare's command-line tool) to manage your account.
Click **Allow**. Nothing is deployed yet.

## Step 4: Set the secret key

The app needs one secret: a long random string that protects sign-in sessions. Never share it or put it in the code.

```bash
npx wrangler secret put AUTH_SECRET
```

It asks for a value. Paste any long random string (40 characters or more) and press Enter. Nothing shows as you
paste; that is normal. To make one:

- **Mac or Linux:** run `openssl rand -hex 32` and copy the result.
- **Windows PowerShell:** run
  `$b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); -join ($b | ForEach-Object { '{0:x2}' -f $_ })` and copy the result.

The first time, Wrangler may ask whether to create the Worker. Answer **yes**.

## Step 5: Deploy

The very first time, run these two commands, one after the other:

```bash
npm run build:css
npx wrangler deploy
```

This uploads the app and creates its database in your account. Wrangler may ask you to confirm the new database;
answer yes. It prints your address, like `https://binwright-lite.your-name.workers.dev`. Do not open it yet: the
database is still empty.

Then run:

```bash
npm run deploy
```

This sets up the database tables, then uploads the app again. From now on, this is the only command you need to
publish changes: it always updates the database before the code.

Now open your address and create your account. The first account becomes the Admin.

## Step 6: Set up your stock

Signed in as the Admin:

1. **Setup page, Region:** your currency (USD, EUR, GBP, AUD and so on), units (metric or US and imperial), date
   format and time zone.
2. **Setup page, Business:** your business name, and what you call a place. A trade business might say **Van**, a
   clinic **Room**, an events company **Kit**. The menu and forms use your word.
3. **Places:** add where stock is kept: vans, storerooms, shelves, cabinets, kits. A place can sit inside another
   (a shelf in a storeroom).
4. **Items:** add them one by one. For each place an item is kept, set the **reorder at** level and the **top up to**
   level. Anything at or below its reorder point shows on the home page.
5. **Count:** count each place once, so the app knows what you have today.
6. **Your team:** send them your address. When they create an account, they appear on the Setup page as "Waiting for
   approval". Give each person a role:
   - **Staff:** record use, receive deliveries, move and count stock.
   - **Manager:** also edits items, places and levels, adjusts stock, sees costs and downloads exports.
   - **Admin:** can change everything, including settings and the team.

From then on, people record what they use and what arrives, and the home page shows what is low or out.

## Optional: use your own web address

In the Cloudflare dashboard, open **Workers & Pages**, click **binwright-lite**, then **Settings**, then **Domains &
Routes**, then **Add**, then **Custom domain**. Enter something like `stock.yourbusiness.com`. Your domain must be on
Cloudflare.

Then set `APP_URL` in `wrangler.jsonc` to that address (for example `"https://stock.yourbusiness.com"`) and run
`npm run deploy` again, so email links use it.

## Optional: email (for password resets)

The app sends **password reset** links, and **confirm your email** for new sign-ups if you switch that on. Without
email set up the app still works, but those emails are only written to the Worker log instead of being sent.

You need a domain on Cloudflare (for example `yourbusiness.com`).

1. **Turn on Email Sending for your domain.** Run `npx wrangler email sending enable yourbusiness.com`, or use the
   Email Service section of the Cloudflare dashboard. Check the records are all there with:

   ```bash
   npx wrangler email sending dns get yourbusiness.com
   ```

2. **Choose the address emails come from**, such as `stock@yourbusiness.com`, on the same domain.

3. **Edit `wrangler.jsonc`:**
   - uncomment `"send_email": [{ "name": "EMAIL" }],`
   - set `"MAIL_FROM"` to the address from step 2
   - set `"APP_URL"` to your app's address

4. **Deploy:** `npm run deploy`.

5. **Test it.** Use **Forgot your password?** on the sign-in page with your own address. The email should arrive
   within a minute. If it never arrives, look for `email_failed` in the Worker logs (Cloudflare dashboard, Workers &
   Pages, binwright-lite, Logs).

There are no API keys for email: the `send_email` binding uses your Cloudflare account directly.

## Using it on phones

The app works in any phone browser. To put it on the home screen like an app: in Chrome, open the menu and choose
**Add to Home screen**; on iPhone, tap **Share**, then **Add to Home Screen**.

## Updating

When a new version is released, download it again (or `git pull` if you cloned the repository), copy your
`wrangler.jsonc` settings across if you changed them, then run:

```bash
npm install
npm run deploy
```

`npm run deploy` applies any new database changes before uploading, and never deletes your data.

## Privacy

The app stores the names and email addresses of everyone with an account, and every stock movement (with who
recorded it and when). Update the Privacy page (`src/routes/misc.tsx`) if you collect anything else. Nothing is
deleted automatically, because the stock ledger is a record you may need for audits.

## Backups

Cloudflare D1 keeps 30 days of point-in-time history automatically. To restore, see
[Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/). To export a copy:

```bash
npx wrangler d1 export DB --remote --output=binwright-lite-backup.sql
```

The Setup page also has CSV downloads of all stock and all activity.

## Something not working?

- **"Please sign in" loops, or "This form has expired":** make sure `AUTH_SECRET` is set (Step 4) and refresh.
- **See what went wrong:** Cloudflare dashboard, then **Workers & Pages**, then **binwright-lite**, then **Logs**.
- **Run the tests:** `npm test` checks the stock rules and permissions on your computer.

## Demo mode (for showing it off, not for real stock)

Setting `"DEMO_MODE": "true"` adds one-click demo sign-ins to the login page, turns off sign-up, and wipes and
reloads sample data every day at 15:00 UTC. Load the data once with `npm run seed:remote -- --yes`. **Never turn
this on for real stock:** it deletes everything nightly.
