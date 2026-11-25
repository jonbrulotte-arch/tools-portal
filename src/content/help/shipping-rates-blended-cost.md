The blended shipping cost is **one expected shipping cost per unit** for a product, averaged over where its orders actually come from and go to, and over the carriers we actually use. It's built for ROI and pricing decisions, and it's written to each product in Salsify. This page walks through every step, with the rule the tool applies and why. The full reference is *Shipping Rates Generator: methodology & calculations*.

## Summary

For every product, the tool gets a live UPS and USPS quote from each warehouse (Las Vegas, Groveport) to each zone (2 to 8), using the product's real weight and box size. It then weights those prices four ways, all taken from our own shipping history:
- which warehouse ships this product;
- which zones that warehouse's orders go to;
- how many go to homes versus businesses;
- how often we use USPS versus UPS at this weight.

UPS quotes are raised for surcharges a quote can't see (delivery area, size-based handling). The weighted average is the blended cost.

The method is checked every week against what we actually paid: the reality check compares the method's prediction with the real cost of every package in the latest cost report, by weight band. Within 10% on average is the bar for ROI use.

**Blended cost = Σ over warehouses ( warehouse share × Σ over zones 2–8 ( zone share × cell price ) )**

![How the blended cost is built: 4 sources, 7 inputs](images/how-it-works.png)

Prices come from the carriers; every weight applied to them comes from our own shipments. The numbers in the boxes are the steps below.

## Where the data comes from

Five sources feed the blended cost. Prices come from the carriers; everything that weights those prices comes from our own shipping history, not assumptions.

| Source | What it provides | Refreshed |
| --- | --- | --- |
| Salsify (product list) | Each product's shipping weight and box size (length, width, height) | Weekly, with the Products run |
| UPS Rating API and Endicia (USPS) | Live prices per product, from each warehouse to each zone, for USPS Ground Advantage, UPS Ground commercial and UPS Ground residential. UPS prices are each warehouse's negotiated rates, quoted on its own account. | Weekly (Products run) |
| Quote runs (the rate chart) | Prices for every warehouse × zone × weight × service (about 4,500), used where a product quote is missing and by the reality check | Weekly |
| Mango cost reports (Ship Cost History) | What we actually paid for every package: UPS invoice lines and USPS labels, with warehouse, zone, weight, home or business, and who paid | Weekly import of the last 90 days |
| Mango inventory page | Each product's stock per warehouse and its orders last month with tracking numbers | Daily |

**What counts as "our shipping".** From the cost reports the tool keeps only packages **we paid for**, shipped UPS Ground or USPS Ground Advantage to zones 2–8. It leaves out third-party and collect shipments (the customer chose the carrier and paid), other UPS services, Alaska, Hawaii and territories, voided labels, and packages it can't place in a warehouse.

**Simulated prices.** If the tool is in simulated mode (no live carrier access), every figure is labelled Simulated and nothing is pushed to Salsify.

## Step 1: the weight each carrier bills

Carriers bill the **greater of the actual weight and the dimensional (DIM) weight**, and each carrier has its own rule. So a product has two billable weights, one per carrier.

| Carrier | DIM weight | When DIM applies | Weight tiers |
| --- | --- | --- | --- |
| UPS Ground | L × W × H ÷ 139 (each side rounded to the inch), rounded up to the pound | Always | Whole pounds, rounded up, minimum 1 lb, up to 150 lb |
| USPS Ground Advantage | L × W × H ÷ 166, rounded up to the pound | Only over 1 cubic foot (1,728 in³) | 4, 8, 12 and 15.99 oz, then whole pounds; up to 70 lb |

**Example:** a 6 lb product in an 18 × 14 × 12 in. box is 3,024 in³. UPS bills 3,024 ÷ 139 = 21.8, so **22 lb**. USPS bills 3,024 ÷ 166 = 18.2, so **19 lb**.

**Why it matters for light parts:** a 0.28 lb part in a 9.5 × 6.5 × 1.6 in. mailer bills **2 lb at UPS** (rounded sides, whole pounds) but **0.28 lb (the 8 oz tier) at USPS**. The tool keeps both, because the carrier choice and the surcharges in later steps depend on which weight each carrier actually charges.

The weight and box size come from Salsify. A product missing either can't be quoted, and is listed as such on the Products tab.

## Step 2: a price for every warehouse, zone and service

Each product gets **42 live quotes**: 2 warehouses × 7 zones (2–8) × 3 services (USPS Ground Advantage, UPS Ground commercial, UPS Ground residential). The product is quoted with its real weight and box size, so the carrier applies its own DIM rules.

- **One ZIP per zone.** Carriers price by ZIP, not zone. Each zone is quoted to a ZIP in the city we ship to most in that zone from that warehouse, taken from the latest cost report (or a ZIP set by hand in Settings).
- **Negotiated UPS rates.** Each warehouse is quoted on its own UPS account, so the price includes our discounts and the fuel surcharge.
- **Fallback.** If a product quote is missing (a failed call), the tool uses the rate chart's price at the product's billable weight tier.
- **Over a carrier's limit** (USPS 70 lb, UPS 150 lb): no quote; the other carrier takes that cell (Step 5).

Each (warehouse, zone) pair is a **cell**. Steps 3 to 6 decide how the three prices in a cell are combined into one cell price, and how much weight each cell gets.

## Step 3: which warehouse ships the orders

The warehouse share says how a product's orders divide between Las Vegas and Groveport. The tool applies the **first rule that fits**:

| # | Rule | Share used | Shown as |
| --- | --- | --- | --- |
| 1 | 5 or more shipments last month (UPS and USPS) | Their split, e.g. 11 Groveport and 3 Las Vegas → 79% / 21% | Own shipments |
| 2 | Stocked in one warehouse only | 100% from there | One warehouse (may understate) |
| 3 | Stocked in both | 100% from the warehouse with most of the stock (equal stock → company split) | Most stock (may understate) |
| 4 | Not stocked, 1–4 shipments | Their split | Few shipments |
| 5 | No Mango data, or no stock and no shipments | Company-wide split: each warehouse's share of all our prepaid packages | Company split |

**How a shipment is placed in a warehouse.** Each order on the product's Mango page has a tracking number. If it's in an imported cost report, the report says which warehouse shipped it (works for USPS and UPS). Otherwise a UPS number contains our shipper account, which maps to a warehouse. FedEx, freight and labels not yet in a cost report can't be placed and aren't counted.

**Collect shipments count here.** A Home Depot order billed to Home Depot's UPS account still leaves from our warehouse, so it counts toward the warehouse split (but not toward the carrier choice in Step 5).

**Why "may understate":** rules 2 and 3 send every order from one warehouse, including customers the other warehouse normally serves. The tool uses that warehouse's usual zone mix, which leans toward its nearby zones, so the cost can be low. These products are flagged.

## Step 4: where the orders go

Two shares, both per warehouse, both from the latest cost report:

- **Zone mix:** the share of that warehouse's prepaid shipments that went to each zone. For example Groveport: zone 2 8%, zone 3 12%, zone 4 36%, zone 5 16%, zone 6 8%, zone 7 8%, zone 8 12%. Las Vegas is weighted toward the far zones (7 and 8), because most of the country is far from Nevada.
- **Residential share:** the share of that warehouse's UPS shipments that went to homes rather than businesses. It decides how the UPS residential and commercial quotes are mixed, because UPS charges more to deliver to a home. With fewer than 50 UPS shipments, the company-wide share is used.

These are the warehouse's overall patterns, not the product's own: a month of one product's orders is too few to give a reliable split across seven zones.

**How USPS zones are known.** USPS labels in the cost report don't carry a zone. The tool takes it from our UPS packages to the same city from the same warehouse; otherwise it estimates it by distance, using zone boundaries learned from that warehouse's UPS invoices.

## Step 5: which carrier

By default the tool prices each cell at **the carrier mix we actually use**, not at whichever carrier is cheapest. Many light packages go UPS even when USPS is cheaper (retailer routing rules, for example), and pricing every package on the cheapest carrier understated what we pay by 15–26% for packages under 10 lb.

Within a cell:

- **UPS = residential share × UPS residential + (1 − residential share) × UPS commercial**
- **Cell price = USPS share × USPS + (1 − USPS share) × UPS**

The **USPS share** comes from the first of these that applies:

1. **The product's own split**, if it had at least 5 shipments **we paid for** last month. For example 3 USPS and 7 UPS gives 30% USPS.
    - **Collect and third-party UPS shipments are left out.** The customer chose UPS and paid for it, so they say nothing about our choice. Who paid comes from the UPS invoice lines in the cost report.
    - UPS shipments not yet on an imported invoice (invoices lag a few weeks) can't be checked, so they count as ours.
2. **The warehouse's split at this weight:** the share of that warehouse's packages in the product's weight band that went USPS. Bands: under 1 lb, 1–5, 5–10, 10–20, 20–50, 50–150 lb, by the product's **USPS** billable weight (its real weight class). A warehouse needs 20 packages in the band; otherwise the company's split for the band is used.
3. **No shipments in the band at all:** the cheaper carrier.

If one carrier has no price in a cell (over its limit, or a failed quote), the other carrier takes the whole cell.

**The alternative setting, "cheapest carrier"**, prices every package on the cheaper carrier for each kind of address. It shows what shipping *could* cost; the default shows what it *does* cost. Managers can switch in Settings, and the reality check (below) always shows both.

**Real case, part 06103.** Its Mango page showed 21 shipments last month, 20 of them UPS. The cost report shows 18 of those were Home Depot orders billed to Home Depot's own UPS account ($0 to us). Only 2 were ours (1 USPS, 1 UPS), fewer than 5, so the tool uses Las Vegas's split for packages under 1 lb, which is mostly USPS. Counting the Home Depot orders would have priced 95% of orders on UPS.

## Step 6: UPS surcharges a quote can't see

A quote is priced by weight to a typical ZIP, so it misses charges that depend on the exact address or the box: delivery-area surcharges, size-based additional handling, large-package surcharges, address corrections. About a third of our UPS spend is charges other than freight. So each UPS price in a cell is raised by the warehouse's **surcharge ratio** for the product's weight band:

- **UPS price = UPS quote × (1 + surcharge ratio)**
- **Surcharge ratio = other charges ÷ (freight + residential + handling by weight + fuel)**

The ratio comes from what we actually paid in the cost report, with every UPS invoice line sorted into five buckets:

| Bucket | What's in it | Already in the quote? |
| --- | --- | --- |
| Freight | The UPS Ground line | Yes |
| Fuel | Fuel surcharge (not the fuel on an address correction) | Yes: UPS's quotes include fuel |
| Residential | The residential surcharge | Yes: we quote home and business separately |
| Handling by weight | Additional handling for weight; on packages over 50 lb, all additional handling | Yes: a quote at that weight includes it |
| Other | Delivery area, size-based handling up to 50 lb, large package, demand surcharges, address corrections, charge corrections | **No**: this is what the ratio adds |

Rules around it:

- **Per warehouse and weight band**, because the charges differ: delivery-area charges weigh most on light packages, size-based handling on big boxes. A band with fewer than 20 UPS packages uses the warehouse's overall ratio.
- **No surcharge from 50 lb up.** The 50–150 lb band matched what we paid with no surcharge (+2.6%) and overshot with one (+16.5% to +29.5%), because a quote at a billed weight over 50 lb already includes handling UPS doesn't always charge.
- **Capped at 60%**, so one odd report can't run away with the cost.
- **USPS gets no ratio:** USPS extras (such as non-standard length) count only if the live quote includes them. This is a known limit.

The band for the ratio is the product's **UPS** billable weight, the weight UPS actually charges at.

## Step 7: putting it together

The tool computes one price per cell (Steps 2, 4, 5 and 6), weights each cell by warehouse share × zone share (Steps 3 and 4), and adds them up.

**A. One cell, worked in full.** A 3 lb product, Groveport, zone 4, default settings (actual carrier mix, surcharges on):

| Input | Value | From |
| --- | --- | --- |
| USPS quote | $8.39 | Step 2 |
| UPS commercial quote | $9.10 | Step 2 |
| UPS residential quote | $12.40 | Step 2 |
| Groveport residential share | 25% | Step 4 |
| Groveport surcharge ratio, 1–5 lb | 8% | Step 6 |
| Groveport USPS share, 1–5 lb | 60% | Step 5 (warehouse split at this weight) |

1. UPS price = 0.25 × $12.40 × 1.08 + 0.75 × $9.10 × 1.08 = $3.35 + $7.37 = **$10.72**
2. Cell price = 0.60 × $8.39 + 0.40 × $10.72 = $5.03 + $4.29 = **$9.32**

The cheapest-carrier setting would say $8.39 here (USPS for everything). The $0.93 difference is what our real carrier mix costs on this cell.

**B. Weighting the cells.** A product stocked in both warehouses (Groveport 1,283 units, Las Vegas 480) with no shipments last month:

1. Warehouse share (Step 3, rule 3): Groveport holds 73% of the stock, so **Groveport 100%**.
2. Zone mix (Step 4): Groveport's own.
3. Multiply each cell price by its zone share and add up:

| Zone | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Zone share | 8% | 12% | 36% | 16% | 8% | 8% | 12% |
| Cell price | $7.85 | $8.23 | $8.39 | $9.04 | $9.04 | $10.08 | $10.08 |
| Share × price | $0.63 | $0.99 | $3.02 | $1.45 | $0.72 | $0.81 | $1.21 |

**Blended cost = $8.82** (the sum of the last row, before rounding each entry). **Range: $7.85 – $10.08**, the nearest and furthest zone. These seven cell prices come from the tool's documented example with the cheapest-carrier setting; the weighting works the same way whichever setting produced them.

With two warehouses, each warehouse's seven cells are weighted by its own zone mix and then by its warehouse share, e.g. 79% × Groveport's total + 21% × Las Vegas's.

**Gaps.** A cell with no price at all is left out and the remaining weights are scaled back to 100%. If less than 80% of the weighting had a price, the cost is flagged **Incomplete**.

## How we know it's right: the reality check

The reality check tests the **method** against what we actually paid, using every package in the latest cost report. It's on the Products tab and refreshes with each cost report and quote run.

For each weight band (under 1 lb, 1–5, 5–10, 10–20, 20–50, 50–150 lb) it shows:

| Column | Meaning |
| --- | --- |
| Paid | Average actually paid per package in the band |
| At our carrier mix | What the method predicts for those same packages: chart prices blended with the company warehouse split, each warehouse's zone mix, residential share, carrier mix and surcharges |
| If cheapest carrier | The same, but every package on the cheaper carrier |
| Carrier choice cost | (carrier mix − cheapest) × the band's packages: what our carrier mix cost over always taking the cheaper carrier, at quoted prices |

**The bar:** the difference between the method and what we paid, averaged across bands (weighted by packages), must be **within 10%** for ROI use. Bands with fewer than 20 packages aren't judged. When the actual-mix method was introduced it landed **within 4%**; the cheapest-carrier method was 15–26% under on packages below 10 lb.

**Reading it:** if both columns are low, the quotes are missing charges (check surcharges). If "carrier mix" matches but "cheapest" is well below, prices are right and the gap is carrier choice. One band off points to something specific to that weight, like additional handling on heavy boxes.

**The Carrier choice report** (its own tab) lists the packages behind the carrier choice cost, with their PO, SO and channel, priced on both carriers. Its total differs a little from the reality check's because it prices each package at its own zone and weight rather than at band averages. Some of that cost can't be avoided: retailer routing rules that require UPS, and boxes too large for USPS.

## What goes to Salsify

Each product's blended cost is written weekly to one Salsify property as four values, always in this order:

| # | Value | Example |
| --- | --- | --- |
| 1 | Blended cost, to the cent | `17.12` |
| 2 | A note: `OK: …` with how the warehouse split was decided, or every issue with the price | `OK: from 13 UPS shipments last month: all Groveport, OH` |
| 3 | Cheapest carrier for the product, on average over its orders (`USPS`, `UPS`, or `Unknown`) | `USPS` |
| 4 | Date pushed (Pacific time) | `2026-11-23` |

**When it writes:** only from the newest completed live Products run (never simulated prices), and only for products whose cost, note or carrier changed since the last push.

**The notes to watch** (several are joined with "; "):

| Note | What it means for the number |
| --- | --- |
| `Incomplete: only 62% of orders priced` | Some zones are over a carrier limit or failed to quote; the cost comes from the zones that priced. Check it. |
| `Stocked in Las Vegas, NV only; may understate` | Every order is assumed to ship from one warehouse, with that warehouse's usual zone mix. Likely low. |
| `Stocked in both; ships from Groveport, OH (most stock); may understate` | Too few shipments, so the warehouse with most stock is assumed to ship everything. Likely low. |
| `No Mango data: company-wide split` | Mango couldn't be read; the company's overall warehouse split is used. |
| `No stock or shipments in Mango: company-wide split` | Nothing to go on for this product; the company split is used. |
| `Few shipments (2)` | The split comes from very few orders. |

The cheapest carrier (value 3) compares USPS with UPS (home/business blend plus surcharges), each averaged over the same orders as the blended cost. A product can still be cheaper on the other carrier to some zones.

## Known limits and method changes

The blended cost is an expected average, not a quote for one order. These are its known blind spots:

- **One-warehouse products may be low.** When every order is assumed to ship from one warehouse, the tool still uses that warehouse's usual zone mix, which leans to its nearby zones. Flagged "may understate".
- **A month of orders is thin** for slow movers; they fall back to stock or the company split.
- **Surcharges are one ratio per warehouse and weight band.** Within a band, a big box pays more handling than a small one, and a delivery-area address more than a city one.
- **The warehouse carrier mix is a habit at a weight**, not the product's. A product sold mostly through a retailer that requires UPS, with fewer than 5 of our own shipments a month, will cost more than shown.
- **Recent UPS shipments** aren't on an invoice yet, so the tool can't yet tell if they were collect; they count as ours until the next cost report.
- **USPS cubic pricing** and USPS extras a quote doesn't include aren't modelled.
- **Quotes go to one ZIP per zone**, so a zone's price is that ZIP's price.

| Date | Change | Why |
| --- | --- | --- |
| Nov 25, 2026 | A product's own carrier split leaves out collect and third-party UPS shipments | Customers who ship on their own UPS account choose the carrier; counting them made products look UPS-heavy (06103: 18 of 20 were Home Depot's) |
| Nov 24, 2026 | Salsify gets the cheapest carrier as a 3rd value; Carrier choice report added | Requested by the shipping team |
| Nov 23, 2026 | Default carrier method = our actual carrier mix | Cheapest carrier was 15–26% under what we paid below 10 lb; the actual mix landed within 4% |
| Nov 23, 2026 | UPS quotes raised by each warehouse's surcharge ratio per weight band | About a third of UPS spend is charges a quote can't see |
| Nov 23, 2026 | All additional handling over 50 lb counts as quoted; no surcharge on 50–150 lb | That band matched what we paid without surcharges (+2.6%) and overshot with them (+16.5% to +29.5%) |
| Nov 23, 2026 | Carrier split band from the USPS billable weight | A 0.28 lb part that UPS bills at 2 lb was treated as a 1–5 lb package (43% USPS) instead of under 1 lb (88% USPS) |
| Nov 23, 2026 | A product with 5+ shipments uses its own carrier split | Its own history beats the warehouse's habit at its weight |
