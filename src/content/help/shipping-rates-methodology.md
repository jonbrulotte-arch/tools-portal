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

The packages are then totalled by carrier × service × warehouse × zone × weight tier. These totals feed the **zone mix**, the **residential share**, the **company-wide warehouse split**, the **carrier mix**, the **historical cutoff** and the **reality check**.

Each warehouse's **UPS charges** on those packages are also kept, overall and per weight band, in five buckets, for the UPS surcharge ratio (section 7):
- **Freight:** the UPS Ground freight line.
- **Fuel:** fuel surcharge lines (but not the fuel charged on an address correction).
- **Residential:** the residential surcharge.
- **Handling by weight:** additional handling charged for weight alone (over 50 lb).
- **Other:** everything else: additional handling for size, large package, demand surcharges, delivery area (extended, remote), address corrections and their fuel, shipping charge corrections, and so on.

Reports processed before this was added don't have the buckets; the next import or upload does. Names and street addresses are read only to place each package and are never stored. Each package's tracking number and warehouse are kept for 120 days, so a product's USPS shipments can be traced back to the warehouse that sent them.

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

**Cell price:** for each warehouse and zone, using the product's quotes (the chart price if a quote is missing). Two settings (Settings → **Blended cost method**) decide how:

**1. UPS surcharges (on by default).** Quotes are priced by weight to a typical ZIP, so they don't include surcharges that depend on the box size or the exact address, such as size-based additional handling or delivery area. So each UPS quote is raised by the warehouse's **UPS surcharge ratio** for the product's weight band, from the cost report:

UPS price = UPS quote × (1 + surcharge ratio)

surcharge ratio = other ÷ (freight + residential + handling by weight + fuel)

- It's worked out **per warehouse and weight band** (the reality check's bands), because the charges differ: delivery-area charges weigh most on light packages, size-based handling on big boxes. A band with fewer than 20 UPS packages uses the warehouse's overall ratio, and so does a product with no weight.
- Residential isn't added: the residential quotes already include it. Nor is handling by weight: a quote over 50 lb already includes it.
- **UPS quotes already include the fuel surcharge** (on by default). UPS's rating API returns totals with fuel, and the 50–150 lb band, which is nearly all UPS, matching what we paid confirms it. If it's turned off, fuel moves to the top line: ratio = (other + fuel) ÷ (freight + residential).
- The ratio is capped at 60%, so a report with odd adjustments can't run away with the cost.

**2. Carrier choice.**

- **Our actual carrier mix** (the default):

  UPS = residential share × UPS residential + (1 − residential share) × UPS commercial

  cell = USPS share × USPS + (1 − USPS share) × UPS

  The **USPS share** is how many of that warehouse's packages in the product's **weight band** went USPS in the cost report. The bands are the reality check's: under 1 lb, 1–5, 5–10, 10–20, 20–50 and 50–150 lb, by UPS billable weight. A warehouse needs **20 shipments** in the band for its own split; otherwise the company's split for the band is used. With no shipments in the band at all, the cheaper carrier is used.
- **Cheapest carrier:**

  cell = residential share × min(USPS, UPS residential) + (1 − residential share) × min(USPS, UPS commercial)

  Every package goes on the cheaper carrier for that kind of address. This is what shipping *could* cost; the actual mix is what it *does* cost.

The other inputs:
- **Residential share:** the share of that warehouse's UPS shipments that went to homes, from the cost report. With fewer than 50 UPS shipments it uses the company-wide share.
- **A carrier without a price** (over its weight limit, or a failed quote): the other carrier takes all of the cell.
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
3. **Cell prices** (here with the cheapest-carrier method and no surcharges, home/business weighted): $7.85, $8.23, $8.39, $9.04, $9.04, $10.08, $10.08.
4. **Blended cost:** 0.08×7.85 + 0.12×8.23 + 0.36×8.39 + 0.16×9.04 + 0.08×9.04 + 0.08×10.08 + 0.12×10.08 = **$8.82**.
5. **Range:** $7.85 – $10.08.

**With the actual carrier mix and surcharges**, one cell, Groveport zone 4, for a 3 lb product:
- Quotes: USPS $8.39, UPS commercial $9.10, UPS residential $12.40. Groveport's residential share 25%, its 1–5 lb surcharge ratio 8%, and 60% of its 1–5 lb packages went USPS.
- UPS = 0.25 × 12.40 × 1.08 + 0.75 × 9.10 × 1.08 = 3.35 + 7.37 = $10.72.
- Cell = 0.60 × 8.39 + 0.40 × 10.72 = 5.03 + 4.29 = **$9.32** (cheapest carrier would say $8.39).

### Known limits

- **Products that ship from one warehouse** (rules 2 and 3) ship every order from there, including customers the other warehouse would normally serve. The estimate uses that warehouse's usual zone mix, which leans toward its nearby zones, so the cost **may be low**. These are flagged *may understate*.
- **A month of orders** is thin for slow movers; they fall back to stock.
- **UPS surcharges** are added as one ratio per warehouse and weight band. Within a band, a big box pays more handling than a small one, and an address in a delivery area pays more than one in a city. USPS surcharges (non-standard length) are only included if the live quote includes them.
- **The carrier mix** is a warehouse's habit at a weight, not this product's. A product sold mostly through a retailer that requires UPS will cost more than shown.
- **USPS cubic pricing** for small, dense parcels isn't modelled.

## 8. Reality check

This checks the **method**, not each product. It uses the newest processed cost report and the newest finished quote run (live preferred; a run still going, cancelled or failed is skipped). For each billed-weight band (under 1 lb, 1–5, 5–10, 10–20, 20–50, 50–150 lb) it compares, for the cost report's own shipments:
- **Paid:** the average actually paid per package.
- **At our carrier mix:** for each shipment's billed weight, the chart price blended with the company-wide warehouse split, each warehouse's zone mix, residential share and **carrier mix** at that weight, plus UPS surcharges when they're on. Then averaged over the band's shipments.
- **If cheapest carrier:** the same, but every package on the cheaper carrier.
- **Carrier choice cost:** (at our carrier mix − if cheapest carrier) × the band's shipments: what shipping the way we did cost over always taking the cheaper carrier, at quoted prices. The card adds the bands up and scales it to a month (× 30 ÷ the report's days). Some of it can't be avoided: retailer routing guides that require UPS, and packages too large for USPS.

**Difference %** = (method − paid) ÷ paid. The overall figure, shown in the badge, is the shipment-weighted average of the absolute differences **for the method chosen in Settings** (marked *used*). The footer row gives it for both methods. **Within 10%** means the method is reliable enough for ROI decisions. Bands with fewer than 20 shipments aren't judged.

**Reading it:**
- Both columns low: the quotes miss charges. Check that UPS surcharges are on and the note under the table shows each warehouse's ratios.
- *At our carrier mix* close to *Paid* but *If cheapest carrier* well below: the prices are right, and the gap is carrier choice.
- One band off: look at what's special about it, for example additional handling on 50 lb+ boxes or retailer drop-ships under 3 lb.

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
