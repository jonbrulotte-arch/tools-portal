This page explains how the Shipping Rates Generator arrives at every number it shows: where the data comes from, each formula, and the assumptions and limits behind them. The day-to-day guide is *Shipping Rates Generator: guide*.

## 1. Data sources

| Source | What it provides | When it's refreshed |
| --- | --- | --- |
| **Cost reports**: Mango's Ship Cost History (UPS invoice lines and USPS labels) | What we actually paid per package; which warehouse shipped it; destination city and state; zone; billed weight | Weekly from Mango, the last 90 days (Settings → Mango cost import), or uploaded by hand |
| **Quote runs**: UPS Rating API and Endicia (USPS) | Current prices for every warehouse × zone × weight × service (the "rate chart") | Weekly (Settings → Scheduled quote run) |
| **Products runs**: Salsify list, then live quotes | Each product's shipping weight and box size, quoted from each warehouse to each zone | Weekly (Settings → Products (Salsify list)) |
| **Mango inventory page** | Each product's stock per warehouse, and its orders last month with tracking numbers | Daily (Settings → Mango inventory) |
| **Settings** | Warehouses and their ZIPs, the UPS account → warehouse list, destination ZIPs per zone | When changed |

Simulated mode replaces carrier prices with placeholder formulas. Every number based on them is labelled **Simulated** and is never pushed to Salsify.

## 2. Weights and billable weight

**Weight tiers.** Prices and history are grouped into the same tiers so they line up exactly:
- **USPS Ground Advantage**: 4 oz, 8 oz, 12 oz, 15.99 oz, then whole pounds (rounded up), up to 20 lb by default (70 lb limit).
- **UPS Ground**: whole pounds, rounded up, at least 1 lb, up to 150 lb.

**Dimensional (billable) weight.** Carriers charge the greater of the actual weight and the dimensional weight:

| Carrier | Dimensional weight | Applies when |
| --- | --- | --- |
| UPS Ground | L × W × H ÷ 139, each side rounded to the nearest inch, then rounded up to the next pound | Always |
| USPS Ground Advantage | L × W × H ÷ 166, rounded up to the next pound | Only parcels over 1 cubic foot (1,728 in³) |

*Example:* a 6 lb box of 18 × 14 × 12 in is 3,024 in³:
- **UPS:** 3,024 ÷ 139 = 21.8, so it bills at **22 lb**.
- **USPS:** 3,024 ÷ 166 = 18.2, so it bills at **19 lb**.

The rate chart is read at these billable weights.

## 3. What we paid (cost reports)

Each cost report is turned into one cost per package:
- **UPS:** every invoice line with the same tracking number is **added up**, including freight, fuel, residential, delivery-area and other surcharges. The package's weight, zone and residential/commercial service come from its UPS Ground freight line.
- **USPS:** one label is one package; its amount is the cost.
- **Which warehouse:**
  - UPS: the shipper account in the tracking number (`1Z` + 6 characters), using the account list in Settings, else the origin ZIP.
  - USPS: the label's origin ZIP.
- **Which zone:**
  - UPS: the zone on the invoice.
  - USPS: labels don't carry a zone, so it's taken from our UPS packages to the same city from the same warehouse. Otherwise it's estimated by distance, using zone boundaries learned from that warehouse's UPS invoices.
- **Left out of "our prepaid shipping"** (counted on the report under *skipped*):
  - shipments billed to a third party or collect;
  - non-Ground UPS services;
  - Alaska, Hawaii, territories and military;
  - voided labels;
  - packages from unknown accounts or ZIPs.

The packages are then totalled by carrier × service × warehouse × zone × weight tier. These totals feed the **zone mix**, the **residential share**, the **company-wide warehouse split**, the **historical cutoff** and the **reality check**. Names and street addresses are read only to place each package and are never stored. Each package's tracking number and warehouse are kept for 120 days, so a product's USPS shipments can be traced back to the warehouse that sent them.

## 4. Quote runs (the rate chart)

A quote run asks the carriers for a price at every combination of:
- **warehouse** (Las Vegas, Groveport);
- **zone** 2–8;
- **weight tier** (section 2);
- **service**: USPS Ground Advantage, UPS Ground commercial, UPS Ground residential.

That's about 4,500 prices. Carriers price by ZIP, not by zone, so each zone is quoted to **one destination ZIP**: the ZIP you set, or automatically a ZIP in the city we ship to most in that zone (from the latest cost report). UPS prices are each warehouse's **negotiated** rate, quoted with that warehouse's own account and API credentials.

## 5. Analysis: cutoff and accuracy

**When UPS becomes cheaper than USPS.** For each warehouse, zone and UPS service, the cutoff is the **lightest whole-pound weight from which UPS is cheaper at every heavier weight up to 20 lb**. If USPS is cheaper even once above a weight, the cutoff moves past it. If USPS is always cheaper, there's no cutoff. Sub-pound USPS tiers are compared with UPS's 1 lb price.
- *From the quotes:* using the chart.
- *From our costs:* the same test on the average actually paid, only at weights with at least 3 shipments of each carrier.

**Quote vs actual.** For each cost-report group (carrier, service, warehouse, zone, weight), the quote is compared with the average actually paid:
- **difference %** = (quote − average paid) ÷ average paid;
- **average difference** = the mean of the absolute differences, weighted by the number of shipments.

Differences come mostly from surcharges (delivery area, additional handling) and from fuel surcharge changes since the packages shipped.

## 6. Product quotes

A product is quoted from each warehouse to each zone's destination ZIP, for all three services, with its real weight and box size, so the carrier applies dimensional weight. **Chart** is the rate chart's price at the product's billable weight tier, and **Diff** = (quote − chart) ÷ chart. Quotes over a carrier's limit (USPS 70 lb, UPS 150 lb) aren't requested.

## 7. Blended shipping cost per unit

One expected shipping cost per unit across both warehouses and every zone, for ROIs:

**Blended cost = Σ over warehouses ( warehouse share × Σ over zones ( zone share × cell price ) )**

**Zone share (zone mix):** each warehouse's share of its prepaid shipments per zone, from the latest cost report. For example, Groveport: zone 4 36%, zone 5 16%, …

**Cell price:** for each warehouse and zone, using the product's quotes (the chart price if a quote is missing):

cell = residential share × min(USPS, UPS residential) + (1 − residential share) × min(USPS, UPS commercial)

- **Residential share:** the share of that warehouse's UPS shipments that went to homes, from the cost report. With fewer than 50 UPS shipments it uses the company-wide share.
- **min(…):** the cheaper carrier for that kind of address, because that's what we'd choose.
- **Missing prices:** if a cell has no price (over a carrier's limit, or a failed quote), it's left out and the remaining weights are scaled back up to 100%. If less than **80%** of the weighting had a price, the cost is flagged **Incomplete**.

**Range:** the cheapest and most expensive cell among the warehouses used (*nearest zone – furthest zone*).

### Warehouse share

How a product's orders divide between the warehouses, from the first rule that applies:

| # | Rule | Basis shown |
| --- | --- | --- |
| 1 | **5 or more shipments last month**, UPS and USPS: their split. | *Own shipments* |
| 2 | **Stocked in one warehouse only**: 100% from there. | *One warehouse* (may understate) |
| 3 | **Stocked in both**: 100% from the warehouse with **most of the stock**, as that's the one that usually ships it. Equal stock uses the company-wide split. | *Most stock* (may understate) |
| 4 | **Not stocked, but 1–4 shipments**: their split. | *Few shipments* |
| 5 | **No Mango data, or nothing stocked and no shipments**: the company-wide split, each warehouse's share of all prepaid packages in the cost report. | *Company split* |

**Placing a shipment in a warehouse.** Each order on the product's Mango page has a tracking number:
1. If the number is in an imported cost report, that report says which warehouse shipped it. This works for **USPS** and UPS.
2. Otherwise, a UPS number contains the shipper account (`1Z` + 6 characters), and the account list in Settings gives the warehouse.
3. Anything else can't be placed: FedEx, freight, or a label not yet in an imported cost report.

Cancelled orders and orders without tracking are skipped. Mango's page covers about the last month.

**Stock** is on-hand quantity from Mango: Site 0 is Las Vegas, Site 3 is Groveport, and other sites (Buffalo) are ignored.

### Worked example

A product stocked in both warehouses (Groveport 1,283, Las Vegas 480) with no shipments last month:
1. **Warehouse share:** Groveport has 73% of the stock, so **Groveport 100%**.
2. **Zone mix:** Groveport's own, for example zone 2 8%, zone 3 12%, zone 4 36%, zone 5 16%, zone 6 8%, zone 7 8%, zone 8 12%.
3. **Cell prices** (cheaper carrier, home/business weighted): $7.85, $8.23, $8.39, $9.04, $9.04, $10.08, $10.08.
4. **Blended cost:** 0.08×7.85 + 0.12×8.23 + 0.36×8.39 + 0.16×9.04 + 0.08×9.04 + 0.08×10.08 + 0.12×10.08 = **$8.82**.
5. **Range:** $7.85 – $10.08.

### Known limits

- **Products that ship from one warehouse** (rules 2 and 3) ship every order from there, including customers the other warehouse would normally serve. The estimate uses that warehouse's usual zone mix, which leans toward its nearby zones, so the cost **may be low**. These are flagged *may understate*.
- **A month of orders** is thin for slow movers; they fall back to stock.
- **Surcharges** that depend on box size (UPS additional handling or large package, USPS non-standard length) are only included if the live quote includes them. The chart doesn't.
- **USPS cubic pricing** for small, dense parcels isn't modelled.

## 8. Reality check

This checks the **method**, not each product. For each billed-weight band (under 1 lb, 1–5, 5–10, 10–20, 20–50, 50–150 lb) it compares two figures for the cost report's own shipments:
- **Paid:** the average actually paid per package.
- **Blended method:** for each shipment's billed weight, the chart from the latest quote run (live preferred), blended with the company-wide warehouse split, each warehouse's zone mix and residential share. Then averaged over the band's shipments.

**Difference %** = (method − paid) ÷ paid. The overall figure is the shipment-weighted average of the absolute differences. **Within 10%** means the simple version is reliable enough for ROI decisions. Bands with fewer than 20 shipments aren't judged.

## 9. API Report

- **Counting:** every request sent to UPS or Endicia is counted, including retries and failed attempts, because that's what the carriers count. The counts are per day (Pacific time), per account, per source (quote runs, Products runs, Product quotes, Settings tests) and per outcome:
  - *ok*;
  - *throttled*: HTTP 429/503, or no answer in time;
  - *error*.
- **Average daily volume** = rate requests ÷ calendar days in the period.
- **Per active day** = rate requests ÷ days that had at least one request.
- **Peak day:** the day with the most rate requests.
- **Estimated days:** before recording started, days are estimated from the live quote runs and Products runs still stored, at one request per saved quote.

## 10. Salsify push

Each product's blended cost is written to the chosen Salsify property as three values: **[cost to the cent, note, date pushed]**.
- **The note:** `OK: <basis>`, or every issue with the price, such as incomplete, may understate, or a fallback split.
- **Which run:** values come from the newest **completed live** Products run.
- **When it writes:** only when the cost or the note changed since the last push.

## 11. Rounding and dates

- **Prices:** calculations use full precision; results are rounded to the cent when shown, stored or pushed. Percentages are shown to one decimal.
- **Days:** midnight to midnight, Pacific time (America/Los_Angeles), for schedules, the API Report and push dates.
