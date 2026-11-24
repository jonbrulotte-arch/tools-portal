The Shipping Rates Generator compares **UPS Ground** and **USPS Ground Advantage** rates from our Las Vegas, NV and Groveport, OH warehouses, and checks them against what we actually paid. Use it to decide which carrier to use by weight and zone, and to quote a single product.

> Note: A yellow **Simulated rates (not real prices)** badge means the tool isn't connected to UPS and Endicia yet, or the run was made in simulated mode. Those prices are placeholders: don't use them for decisions.

## Analysis

**Analysis** brings together a **cost report** (what we paid) and a **quote run** (current published rates). Choose both at the top.

![Analysis: headline figures and shipments by zone](images/analysis.jpg)

- **Headline figures**: shipments analysed, actual spend in zones 2–8, the most-used zone, and how far quotes are from what we paid.
- **Where we ship**: shipments by zone for each warehouse, UPS vs USPS, with the share of each zone.
- **When UPS becomes cheaper than USPS**: for each warehouse and zone, the lightest weight from which UPS Ground beats USPS Ground Advantage at every weight up to 20 lb. It's shown for commercial and residential addresses, plus *From our costs*, the same test run on what we actually paid.
- **Rate by weight**: pick a warehouse and zone to see both carriers' prices by weight, with the crossover marked.

![The UPS vs USPS cutoff by zone](images/analysis-cutoff.jpg)

## Product quote

Quote one product from both warehouses to every zone.

![Product quote](images/product-quote.jpg)

1. Type the **Part number** and click **Look up in Salsify**. This fills in the shipping weight and box size. If the shipping dimensions are missing, the UPC dimensions are used and marked **UPC**. You need your own Salsify API key in **My Profile** for the lookup; without it, type the weight and size yourself.
2. Check the **billable weight** line: UPS and USPS charge by dimensional weight for large, light boxes.
3. Choose the warehouses and a rate chart (quote run) to compare with, then click **Get quotes**.
4. The result shows each zone's live quote, the chart price and the difference. **Export CSV** saves it.

## Products

**Products** lists every product on the company's Salsify product list with its rates: USPS Ground Advantage and UPS Ground (home and business) from each warehouse to each zone, with the cheaper carrier marked.

![Products](images/products.jpg)

- Choose a **Run**. A new run starts on the schedule set in Settings, or with **Run now** (needs the *run reports & pull data* permission).
- **Search** by part number or name; **Show** filters the list (for example products whose sizes came from UPC data).
- **Blended costs CSV** saves one row per product with its blended shipping cost; **All quotes CSV** saves every quote in the run.

## Blended shipping cost (for ROIs)

Many products ship from either Las Vegas or Groveport, and the cost depends on where the customer is. The **Blended cost** column on the Products tab gives one expected shipping cost per unit:

- **Warehouse share**: how this product's orders split between the warehouses. It's read from Mango every night:
  - **Own shipments**: if the product had at least 5 shipments last month (UPS and USPS), its own split is used. Each tracking number is matched to the warehouse that shipped it.
  - **One warehouse**: if it's stocked in only one warehouse, 100% is from there.
  - **Most stock**: if it's stocked in both, 100% is from the warehouse holding most of the stock, which is the one that usually ships it.
  - **Company split**: if Mango has no data, the company-wide split from the cost report is used.
- **Zone mix**: for each warehouse, its usual share of shipments per zone, from the latest cost report.
- **Cell price**: for each warehouse and zone, the product's UPS and USPS prices combined the way your managers chose in Settings:
  - **Our actual carrier mix** (the default): the product's own UPS/USPS split if it had at least 5 shipments last month; otherwise the share of that warehouse's packages at this weight that really went USPS, from the cost report.
  - **Cheapest carrier**: the cheaper carrier for a home address and for a business address.

  Either way, UPS home and business prices are weighted by how many of that warehouse's UPS shipments go to homes. UPS prices also include the warehouse's usual surcharges (additional handling, delivery area and so on) when that's turned on.

The cell shows the warehouse split (for example *LV 21% · GV 79%*) and a badge for how it was decided. Hover for the **range**: the nearest zone (cheapest) to the furthest (dearest).

Click a product to see the details: the cost, the range, how the split was decided, which carrier mix and UPS surcharges were used, stock and shipments per warehouse, and the price and share of orders for each warehouse and zone.

![Blended cost details for one product](images/blended-detail.jpg)

**Blended costs CSV** (above the table) saves one row per product with its blended cost, range, warehouse split, basis, stock and shipments, ready for an ROI sheet. **All quotes CSV** is the full list of quotes as before.

> Note: This is the simple version. A product that ships from one warehouse (*One warehouse* or *Most stock*) ships every order from there, including customers the other warehouse normally serves, but its estimate uses that warehouse's usual zone mix. Its cost may be **low**, and the details show a warning.

The full formulas and a worked example are in *Shipping Rates Generator: methodology & calculations*.

**Product quote** shows the same blended cost for any part you look up. While quoting, it reads that part's stock and shipments from Mango. Quote both warehouses for a complete blend. If you type the dimensions without a part number, the company-wide split is used.

![Blended cost on Product quote](images/blended-quote.jpg)

### Blended cost in Salsify

If your managers have set it up, each product's blended cost is also written to Salsify every week, so you can use it there. It's one property with four values: the **cost**, a **note** (`OK: …` or the issue with the price, the same as the badges here), the **cheapest carrier** (USPS or UPS) and the **date** it was pushed. The **Salsify push** card on the Products tab shows when it last ran and what was written. Only managers can push.

### Reality check

At the bottom of the Products tab, the **Reality check** compares the blended method with what we actually paid. For each weight band, it takes the shipments in the latest cost report and compares the average actually paid per package with what the blended method gives from the latest quote run, two ways:
- **At our carrier mix:** with each warehouse's real UPS/USPS split at that weight.
- **If cheapest carrier:** with every package on the cheaper carrier.

The column marked **used** is the one the blended costs and the Salsify push use (managers choose it in Settings). **Carrier choice cost** is the difference between the two, in dollars: roughly what shipping the way we do cost over always taking the cheaper carrier. The card also gives it per month, and **See the packages and their orders** opens the [Carrier choice](#carrier-choice) report behind it.

**Within 10% on average** means the method is reliable enough for ROI decisions. If it's further off, the bands that are off show where to look: surcharges on heavy or large packages, or products that ship from one warehouse only.

To refresh it, the newest cost report and the newest **finished** live quote run must both be current. A quote run that's still going isn't used until it finishes.

![Reality check](images/reality-check.jpg)

## Carrier choice

**Carrier choice** lists the packages behind the reality check's carrier choice cost: each package we paid for in the newest cost report that went on the carrier with the **higher quote**, with its order:
- **Customer PO, SO, channel** (UPS package reference 5, such as LOWES-SMP) or **marketplace**, the destination **state** and, for business deliveries, the **company**, the tracking number and ship date;
- the warehouse, zone, actual and billed weight, the carrier and what we **paid**;
- the **UPS quote** and **USPS quote** for that package (the cheaper one in green), and the **Extra**: how much more the carrier used is quoted than the other one.

Use the filters (warehouse, carrier used, weight band, channel or marketplace, order link, billed weight) or click a name in the **By channel**, **By weight band**, **By warehouse** and **By carrier used** tables. Search finds a PO, SO, tracking number, reference or company. **Show every package** includes the packages that went on the cheaper carrier too.

**Presets:**
- **Everything on the more expensive carrier.**
- **Light UPS, no order link:** UPS packages billed at 3 lb or less with no customer PO or marketplace order (often manual, replacement or return labels). This is the light-UPS report.
- **UPS under 5 lb** and **USPS that UPS beats.**

The page lists the 500 packages with the most extra; **Export to Excel** saves all the packages that match the filters, with a Summary, a By channel sheet and Notes.

**Why its total differs from the reality check:** the reality check works from weight-band and zone averages, while this report prices each package at its own zone and weight, so the totals are close but not the same. Both compare **quotes**, not what was paid. Not every package could have gone the other way: retailer routing guides may require UPS, and USPS bills large boxes by size.

Packages are kept from cost reports imported or uploaded after this report was added. If the page asks for it, upload the newest cost report again (or wait for the next scheduled import).

## Cost reports

A cost report is the ship cost history (UPS invoice lines and USPS labels) that the Analysis uses as "what we paid".

![Cost reports](images/cost-reports.jpg)

- **Import from Mango**: pick a date range and import it directly. Managers can also schedule a weekly import in Settings. Importing, uploading and deleting need the *run reports & pull data* permission.
- **Upload a file**: upload the Excel (.xlsx) export instead.
- Only our own prepaid shipments are used; third-party and collect shipments are left out. Names and street addresses are read only to place each package, and aren't stored. Each package's order references (PO, SO, marketplace, channel), destination state and, for UPS business deliveries, the destination company are kept for the [Carrier choice](#carrier-choice) report. The company is never kept for home deliveries or USPS labels, where it's usually the person's name.
- UPS invoices reach Mango a few weeks after shipping, so the newest weeks contain mostly USPS.

## Quotes

A quote run pulls a rate for every warehouse, zone (2–8) and weight: USPS Ground Advantage up to 20 lb and UPS Ground up to 150 lb, commercial and residential. That's thousands of quotes, so a run takes a while. It's paced so UPS doesn't throttle us.

![Quotes](images/quotes.jpg)

- **Run quotes now** starts a run, and **Retry failed** re-quotes a run's failures (both need the *run reports & pull data* permission; managers can schedule a weekly run in Settings).
- **View** shows a run's rate table by warehouse and service. The download icon exports it to Excel.
- Use the latest run for decisions; older runs are kept for comparison.
