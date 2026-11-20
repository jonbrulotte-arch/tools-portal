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
- **last month's orders with the item**. Each UPS tracking number contains the shipper account, so the account list above tells which warehouse shipped it.

![Mango inventory settings](images/mango-inventory.jpg)

- **Mango inventory page**: the page address without `?it=…`.
- **Mango site for each warehouse**: the site number Mango shows. Las Vegas is *Site 0: Montessouri* and Groveport is *Site 3: Ohio*. Sites not listed (Buffalo) are ignored.
- **Schedule**: daily at 2:00 AM by default. It reads every product on the Products list, 3 at a time. The Products tab shows the last read, with **Read inventory now**.
- **Save & test**: reads one item and shows what was found (stock per warehouse, shipments by warehouse).

If Mango's page layout changes, the item is recorded as **couldn't be read** (listed on the Products tab), not as zero stock. The item keeps its last good figures until a read works again. Cancelled orders and orders without a tracking number are skipped. FedEx, freight and USPS shipments can't be placed in a warehouse, so they're counted separately and not used for the split.

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
