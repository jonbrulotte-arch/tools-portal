For managers of the Shipping Rates Generator: people with its **Manage tool settings** permission, and Super Admins. Everything here is on the **Settings** tab. API keys and passwords are encrypted when saved and never shown again; leave a secret box blank to keep the saved value.

## Rates source

Choose **Simulated** (placeholder prices, for trying the tool) or **Live** (real UPS and Endicia rates). Every run and quote made in simulated mode is labelled *Simulated rates* everywhere.

![Rates source](images/rates-source.jpg)

Switch to **Live** only once every quoting UPS account and Endicia test successfully.

## Warehouses, UPS accounts and destinations

- **Warehouses**: the origins quotes are pulled from, and the groups history is reported by.
- **UPS accounts → warehouse**: the UPS invoice rarely shows the origin, so each package is placed by its shipper account (the 6 characters after `1Z` in the tracking number). Add each account and its warehouse. Tick **Quote with** on the account each warehouse's live quotes should use, so negotiated rates match what that warehouse pays.
- **Quote destinations**: carriers price by ZIP, not zone, so each zone is quoted to one ZIP. Leave a box empty to use the automatic choice (a ZIP in the city we ship to most in that zone).
- **USPS / UPS quotes up to (lb)**: the heaviest weight quoted per carrier.

![UPS accounts, each with its own API credentials](images/ups-accounts.jpg)

## UPS API credentials (one set per account)

UPS returns an account's rates only to that account's own API app, so **every account that quotes needs its own credentials**. Accounts used only to place invoice lines (not ticked under *Quote with*) don't need any.

For each quoting account:

1. Sign in to developer.ups.com with the UPS profile that owns the account. Create an app with the **Rating** product, and link it to that account number (its billing account number).
2. Copy the app's **Client ID** and **Client secret**.
3. In **UPS accounts → warehouse**, click **Set credentials** on the account's row, paste both, and click **Save & test this account**. A good result shows a *negotiated* price for that account.

![Entering one account's credentials](images/ups-credentials.jpg)

- Credentials are encrypted when saved and never shown again: the row shows **Saved (…a38d)**, the last 4 characters of the client ID. To replace one value, type the new one and leave the other blank. **Remove credentials** deletes both.
- The **API credentials** badge is amber (**Not set**) on a *Quote with* account without credentials. In **Live** mode a warning above the table names the accounts still missing.
- If you rename or remove an account row, its credentials are removed with it.

The **UPS API** card holds what's shared by every account: the **Environment** (production or the UPS test site) and the **Rating API version**. **Save & test every warehouse** runs one live quote per warehouse with its quoting account.

![UPS API: shared options](images/ups-api.jpg)

| Message | Fix |
| --- | --- |
| *UPS account X has no API credentials* | Set credentials on that account's row, or tick a *Quote with* account that has them. |
| *UPS token request failed for account X (401)* | The client ID or secret is wrong, or the secret was regenerated. Enter the current ones. |
| *list rate only … No negotiated rate came back* | The app isn't linked to that account number at developer.ups.com, or the account has no negotiated rates. |

## Endicia (USPS) API

- **Endicia (USPS) API**: the Label Server **Requester ID**, **Account ID**, **Pass phrase** and, for production accounts, the **Endpoint URL** Endicia support gives you.

![Endicia (USPS) API](images/endicia.jpg)

Click **Test** on the card after saving.

## Scheduled quote run

![Scheduled quote run](images/scheduled-quote-run.jpg)

Set the **Frequency**, **Day**, **Start at** time and **Time zone** (for example weekly, **Monday at 1:00 AM Pacific**) so the Analysis always has current rates, and how many scheduled runs to keep. A run is paced and retries automatically if UPS throttles it.

## Mango cost import

![Mango cost import](images/mango-import.jpg)

Enter the **Mango export URL**, the **Date range** (days back from today, for example 90) and the schedule (for example weekly, **Monday at 12:00 AM**). **Keep this many automatic imports** removes older automatic reports; uploaded reports are kept.

## Mango inventory

The blended shipping cost needs to know where each product ships from. Mango has no API, so the tool reads each product's page on Mango's inventory lookup (*current_inventory?it=<item>*), the same page you see in the browser. From it, it takes:
- **stock** per site;
- **last month's orders with the item**. Each tracking number is matched to the warehouse that shipped it: from the imported cost reports (which record every USPS and UPS package's warehouse), else, for UPS, from the shipper account in the number and the account list above. Labels shipped after the newest imported cost report aren't placed until the next import.

![Mango inventory settings](images/mango-inventory.jpg)

- **Mango inventory page**: the page address without `?it=…`.
- **Mango site for each warehouse**: the site number Mango shows. Las Vegas is *Site 0: Montessouri* and Groveport is *Site 3: Ohio*. Sites not listed (Buffalo) are ignored.
- **Schedule**: daily at 2:00 AM by default. It reads every product on the Products list, 3 at a time.
- **Read all inventory now** (in this card) or **Read inventory now** (Products tab) starts a full read straight away, without waiting for the schedule. It runs in the background; the Products tab shows its progress and any items that couldn't be read.
- **Save & test**: reads one item and shows what was found (stock per warehouse, shipments by warehouse).

If Mango's page layout changes, the item is recorded as **couldn't be read** (listed on the Products tab), not as zero stock. The item keeps its last good figures until a read works again. Cancelled orders and orders without a tracking number are skipped. FedEx and freight shipments can't be placed in a warehouse, so they're counted separately and not used for the split.

## Push blended cost to Salsify

Each product's **blended shipping cost** is written to a Salsify property on a schedule (weekly, Monday 6:00 AM Pacific by default), so it's on the product record for ROIs and channel pricing. **Push now** on the Products tab runs it on demand.

![Push blended cost to Salsify](images/salsify-push.png)

### What's written

One Salsify property gets three values per product, always in this order:

| # | Value | Example |
| --- | --- | --- |
| 1 | The blended cost, amount only | `17.12` |
| 2 | A note: `OK: …` with how the warehouse split was decided, or every issue with the price | `OK: from 13 UPS shipments last month: all Groveport, OH` |
| 3 | The date it was pushed (Pacific) | `2026-11-23` |

The note is never empty, so the cost is always the 1st value and the date the 3rd. Possible issues, joined with "; ":

| Note | Meaning |
| --- | --- |
| `Incomplete: only 62% of orders priced …` | Some zones are over a carrier's weight limit or failed to quote. The cost is still pushed, from the zones that were priced: check it. |
| `Stocked in Las Vegas, NV only; may understate` | One warehouse stocks it, so it ships everywhere from there; the estimate uses that warehouse's usual zone mix (the simple version). |
| `Stocked in both; ships from Groveport, OH (most stock); may understate` | Both warehouses stock it, and too few shipments to use its own split: the warehouse with most of the stock is assumed to ship it. |
| `No Mango data: company-wide split` | Mango couldn't be read for this item; the company-wide Las Vegas/Groveport split is used. |
| `No stock or shipments in Mango: company-wide split` | Mango shows no stock and no shipments last month. |
| `Few shipments (2)` | Fewer than 5 shipments last month and no stock in Mango: the split comes from those few shipments. |

### Set it up

1. **In Salsify**, create a **text** property that **allows multiple values**, for example *Blended Shipping Cost*.
2. **Check whose key is used.** Writes use the Salsify key chosen under **Settings → Products (Salsify list) → Scheduled runs use the Salsify key of**. A manual push or test uses your own key if you have one. That person needs **edit rights** on products in Salsify.
3. **In Settings → Push blended cost to Salsify**, enter the property's ID exactly as Salsify shows it, and a part number from the Products list. Then click **Save & test**. It checks:
   - the property exists, is text and allows multiple values;
   - the three values that part would get.

   Under the buttons it then says **Ready to write**, or **Can't write yet:** with the reason.
4. **Click Write this one product.** It writes that part for real, reads it back from Salsify and confirms the values match. Look at the product in Salsify to see them. You can click it without testing first; if something isn't right, it says exactly what.
5. **Turn on Push automatically** and Save. The schedule fields set when it runs.

**Push all to Salsify now** (in the Settings card) or **Push now** (Products tab) runs a full push straight away, without waiting for the schedule. Only changed values are written. It runs in the background; the Products tab shows its progress and results.

### Each push

- **Which products:** every product in the **newest completed live Products run**. Cancelled and failed runs only hold the products they got through, so they're skipped: the push uses the last run that finished.
- **Only changed values are written.** A product is written when its cost (to the cent) or its note changed since the last push; otherwise it's left alone, date included. To re-write one product anyway, use **Write this one product**.
- **Never simulated prices.** It won't run while the tool is in simulated mode, and simulated Products runs are never used.
- **The Products tab shows the last push:**
  - **written**: the value changed and was saved to Salsify;
  - **unchanged**: same cost and note as last time, so nothing was sent;
  - **skipped**: not quoted (missing weight or size in Salsify), or no zone could be priced;
  - **failed**: Salsify refused it.

  Open *products not written* for each reason.

![Salsify push on the Products tab](images/salsify-push-card.png)

### Troubleshooting

| Message | Cause | Fix |
| --- | --- | --- |
| Salsify has no property "…" | The ID doesn't match a Salsify property | Copy the property ID from Salsify exactly (it's case-sensitive). |
| "…" is a number property … use a text property | The property is numeric, but the note and date are text | Use a text property that allows multiple values. |
| Check it: it holds a single value … | The property only keeps one value | Allow multiple values on the property in Salsify. |
| The tool is in simulated mode … | Rates source is Simulated | Switch to Live once UPS and Endicia test successfully. |
| … isn't in the Products run of …, the newest completed live run | The part isn't on the Salsify list, or was added after that run finished | Check the part is on the list; run Products again and let it finish. |
| There's no completed Products run … | Every Products run so far was cancelled or failed (or simulated) | Run Products in live mode and let it finish. |
| … wasn't quoted: … | Missing weight or size in Salsify | Fill in the weight and box size in Salsify; run Products again. |
| No zone could be priced, so there's no cost | Every quote failed (e.g. over every carrier's limit) | Check the product's weight and size; see its quotes on the Products tab. |
| The Salsify key can't edit product … | That user's key has read-only rights | Give the user edit rights in Salsify, or choose another user's key under Products. A push stops after a few of these. |
| Product … isn't in Salsify | The part number doesn't match a Salsify product ID | Check the product ID in Salsify. |
| Written, but Salsify now shows … | Salsify changed the values on save (e.g. a single-value or numeric property) | Fix the property as above. |

Salsify throttling and temporary errors are retried automatically; a product that still fails is listed with the reason and tried again next push.

## Salsify (product lookup) and the Products list

![Salsify](images/salsify.jpg)

- **Salsify (product lookup)**: the **Organization ID** and the property names for shipping weight and box size, plus the **UPC** properties used as a fallback when the shipping ones are missing.
- Each person uses **their own** Salsify API key (My Profile) for Product quote lookups.

![Products (Salsify list)](images/products-list.jpg)

- **Products (Salsify list)**: the list whose products are quoted on the Products tab. Paste the list's address or its ID (`s-…`). Choose whose Salsify key **scheduled runs use**, the schedule, and how many runs to keep.
- Each product gets 42 quotes (2 warehouses × 7 zones × 3 services), so a big list takes a while; progress shows on the Products tab.

## API Report

The **API Report** tab (managers only) shows how many requests the tool sends to UPS and Endicia, for each account. Use it to check usage against the carriers' limits, and to spot an account that's being throttled or failing.

![API Report: totals and requests per day by account](images/api-report.jpg)

- **Period**: last 7, 30 or 90 days, or your own dates. Days run midnight to midnight, Pacific time.
- **Rate requests**: every rate request sent. **Retries count**, because the carriers count every request they receive. **Token requests** (UPS sign-ins) are counted separately.
- **Average daily volume**: rate requests ÷ every day in the period, including days with no requests. **Per active day** divides only by the days that had requests. Quote runs are weekly, so per active day is closer to what a single run asks of an account in one day. Compare the **Peak day** with the carrier's daily limit.
- **Errors & throttled**: requests the carrier refused or failed. *Throttled* means the carrier asked us to slow down (429 or "busy"), or didn't answer in time.

![By account](images/api-report-accounts.jpg)

The **By account** table has one row per UPS account and one for the Endicia account. Each row shows:
- **Quotes** marks the account each warehouse quotes with. A quoting account is listed even when it made no requests.
- The line under each account splits its requests by what asked for them: quote runs, Products runs, Product quotes or Settings tests.
- **Export CSV** saves the table for the period.

> Note: Usage has been recorded since the API Report was added. Earlier days are **estimated** from the live quote runs and Products runs still stored: one request per saved quote, for the account that quotes for that warehouse today. They don't include retries, token requests, Product quotes or tests. Estimated days are faded in the chart. Nothing is counted in simulated mode, because no carrier is called.

## Checklist after a change

- [ ] **Save & test this account** succeeds for each changed UPS account, and **Test** on each other changed card
- [ ] **Run quotes now** completes, without a *Simulated* badge if you're live
- [ ] The Analysis shows the new run, and the quote-vs-actual difference looks reasonable
