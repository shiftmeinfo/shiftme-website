# ShiftMe website: setup guide

You'll do this once. Allow about an hour, most of it waiting for the domain to switch over.

**How it fits together**

| Piece | What it does | Cost |
|---|---|---|
| **GitHub** | Holds the website files and hosts the site (GitHub Pages). Edit a file, it's live in about a minute. | Free |
| **GoDaddy** | Keeps owning shiftme.uk. You just point it at GitHub. | Your existing domain fee |
| **Google Sheet + Apps Script** (in shiftmeinfo@gmail.com) | Stores every booking, tells the calendar which days are full, emails you and the customer. | Free |

**What's in the folder**

| File | What it is |
|---|---|
| `index.html` | The home page with the quote, prices, booking calendar and contact |
| `config.js` | **The file you edit.** Prices, add ons, contact details, booking rules |
| `styles.css`, `app.js` | Design and booking logic. You shouldn't need to touch these |
| `booking-policy.html`, `privacy.html` | Policy pages (check the privacy wording before going live) |
| `CNAME`, `favicon.svg` | Tells GitHub your domain, and the little tab icon |
| `booking-backend/Code.gs` | The booking system code that goes into Google Apps Script |

Do the parts in order.

---

## Part 1: Booking system (Google Sheet)

1. Sign in to Google as **shiftmeinfo@gmail.com**.
2. Go to **sheets.new**. Name the sheet **ShiftMe Bookings**.
3. In the sheet menu: **Extensions → Apps Script**.
4. Delete everything in the code box, then paste in the whole of `booking-backend/Code.gs`. Click the save icon.
5. In the toolbar, pick **setup** from the function dropdown and click **Run**.
   - Google asks for permission. Click **Review permissions**, choose shiftmeinfo@gmail.com.
   - You'll see "Google hasn't verified this app". That's normal because it's your own script: click **Advanced → Go to ShiftMe (unsafe) → Allow**.
   - Back in the sheet you'll now have two tabs: **Bookings** and **Blocked dates**.
6. Click **Deploy → New deployment**. Click the cog next to "Select type" and choose **Web app**.
   - Description: `ShiftMe bookings`
   - Execute as: **Me**
   - Who has access: **Anyone** (this lets the website talk to it; nobody can see the sheet)
   - Click **Deploy**, then copy the **Web app URL** (it ends in `/exec`).
7. Open `config.js` and paste the URL between the quotes:
   `API_URL: "https://script.google.com/macros/s/....../exec",`

**Quick test:** paste the URL into your browser. You should see something like `{"ok":true,"max":2,"days":{},"blocked":[]}`.

> If you ever edit Code.gs later: **Deploy → Manage deployments → pencil icon → Version: New version → Deploy.** That keeps the same URL, so you don't need to change the website.

---

## Part 2: Put the site on GitHub

1. Create a free account at **github.com** (use shiftmeinfo@gmail.com).
2. Click **+ → New repository**.
   - Name: `shiftme-website`
   - Set it to **Public** (free GitHub Pages needs this; there's nothing private in these files)
   - Click **Create repository**.
3. On the new page click **uploading an existing file**. Unzip the folder I sent and drag **everything inside it** in (including the `booking-backend` folder and `CNAME`). Click **Commit changes**.
4. Go to **Settings → Pages**.
   - Source: **Deploy from a branch**. Branch: **main**, folder **/ (root)**. Click **Save**.
   - Under **Custom domain** type `shiftme.uk` and click **Save**. (GitHub says to do this *before* changing GoDaddy, so nobody else can claim your domain.)
5. Optional but recommended: in your GitHub profile **Settings → Pages → Add a domain**, verify shiftme.uk. GitHub gives you one TXT record to add in GoDaddy (Part 3).

After a minute your site is also viewable at `https://YOUR-USERNAME.github.io/shiftme-website/`. Check it there before switching the domain.

---

## Part 3: Point shiftme.uk at GitHub (GoDaddy)

1. Sign in to GoDaddy → **My Products → Domains → shiftme.uk → DNS** (or "Manage DNS").
2. If GoDaddy says the domain is connected to Website Builder, disconnect it there first (or change the records below; GoDaddy may warn you, that's fine).
3. **A records** (Name / Host = `@`): delete the existing `@` A record(s) and add these four, one each:

   | Type | Name | Value |
   |---|---|---|
   | A | @ | 185.199.108.153 |
   | A | @ | 185.199.109.153 |
   | A | @ | 185.199.110.153 |
   | A | @ | 185.199.111.153 |

4. **www**: edit the `www` CNAME so it points to `YOUR-USERNAME.github.io` (your GitHub username, no repository name).
5. Don't touch any **MX** or **TXT** records you didn't add yourself.
6. Wait. Usually 10 to 60 minutes, occasionally a few hours.
7. Back in GitHub **Settings → Pages**, once the domain check goes green, tick **Enforce HTTPS**.
8. When the new site is working on shiftme.uk, you can cancel the GoDaddy **Website Builder** plan (keep the **domain**).

---

## Part 4: Test it properly before telling customers

1. Book a test move on the live site for a date a few weeks out.
2. Check: a row appears in **Bookings**, and you get the "New booking" email and the customer email.
3. Book a second test on the same date (the other slot). Refresh the site: that date is now crossed out as **Full**.
4. In the sheet, change one test booking's **Status** to **Cancelled**. Refresh: the date opens again with 1 slot left.
5. Delete the test rows.

---

## Day to day

**Bookings sheet**
- New bookings arrive as **Pending deposit**. Send the deposit link, then change Status to **Confirmed** (and **Completed** after the job).
- **Cancelled** frees up that slot on the calendar straight away.
- Took a booking by phone or WhatsApp? Add a row yourself with the **Move date** and **Slot** (type "Morning" or "Afternoon") so the calendar knows.

**Blocked dates tab**
- Type a date (e.g. 25/12/2026) to close it. Useful for holidays or when the van's in the garage.

**Making changes to the website (live in about a minute)**
1. On GitHub, open the file (usually `config.js`) and click the **pencil** icon.
2. Make your change, then click **Commit changes**.

Common changes in `config.js`:
- **Prices**: change the `price:` number next to the package or add on.
- **Bookings per day**: change `MAX_BOOKINGS_PER_DAY` here **and** in Code.gs (then redeploy, see Part 1 note). If you go above 2, add more arrival slots in `SLOTS` too, as each slot can only be taken once a day.
- **Close a weekday every week**: `CLOSED_WEEKDAYS: [0]` closes Sundays.
- **Deposit payment**: create a Payment Link in Stripe (or SumUp/PayPal) for each package's deposit and paste it into `DEPOSIT_LINKS`. Customers then get a "Pay deposit" button straight after booking. Leave blank and they're told you'll send the link.

**Want me to make changes directly?** Once the GitHub repository exists, connect it in a Claude chat and I can edit and publish changes for you.
