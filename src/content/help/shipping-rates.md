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

- Choose a **Run**. A new run starts on the schedule set in Settings, or with **Run now** (managers).
- **Search** by part number or name; **Show** filters the list (for example products whose sizes came from UPC data).
- **Blended costs CSV** saves one row per product with its blended shipping cost; **All quotes CSV** saves every quote in the run.

## Blended shipping cost (for ROIs)

Many products ship from either Las Vegas or Groveport, and the cost depends on where the customer is. The **Blended cost** column on the Products tab gives one expected shipping cost per unit:

- **Warehouse share**: how this product's orders split between the warehouses. It's read from Mango every night:
  - **Own shipments**: if the product had at least 5 UPS shipments last month, its own split is used (the UPS tracking number shows which warehouse shipped it).
  - **One warehouse**: if it's stocked in only one warehouse, 100% is from there.
  - **Both stocked**: if it's stocked in both (with few shipments), or Mango has no data, the company-wide split from the cost report is used.
- **Zone mix**: for each warehouse, its usual share of shipments per zone, from the latest cost report.
- **Cell price**: for each warehouse and zone, the cheaper carrier for a home address and for a business address, weighted by how many of that warehouse's UPS shipments go to homes.

The cell shows the warehouse split (for example *LV 21% · GV 79%*) and a badge for how it was decided. Hover for the **range**: the nearest zone (cheapest) to the furthest (dearest).

Click a product to see the details: the cost, the range, how the split was decided, stock and shipments per warehouse, and the price and share of orders for each warehouse and zone.

![Blended cost details for one product](images/blended-detail.jpg)

**Blended costs CSV** (above the table) saves one row per product with its blended cost, range, warehouse split, basis, stock and shipments, ready for an ROI sheet. **All quotes CSV** is the full list of quotes as before.

> Note: This is the simple version. A product stocked in only one warehouse ships every order from there, including customers the other warehouse normally serves, but its estimate uses that warehouse's usual zone mix. Its cost may be **low**, and it's marked *One warehouse* with a warning in the details.

**Product quote** shows the same blended cost for any part you look up. While quoting, it reads that part's stock and shipments from Mango. Quote both warehouses for a complete blend. If you type the dimensions without a part number, the company-wide split is used.

![Blended cost on Product quote](images/blended-quote.jpg)

### Blended cost in Salsify

If your managers have set it up, each product's blended cost is also written to Salsify every week, so you can use it there. It's one property with three values: the **cost**, a **note** (`OK: …` or the issue with the price, the same as the badges here), and the **date** it was pushed. The **Salsify push** card on the Products tab shows when it last ran and what was written. Only managers can push.

### Reality check

At the bottom of the Products tab, the **Reality check** compares the blended method with what we actually paid. For each weight band, it takes the shipments in the latest cost report and compares:
- the average actually paid per package, with
- what the blended method gives from the latest quote run.

**Within 10% on average** means the simple version is reliable enough for ROI decisions. If it's further off, the bands that are off show where to look: surcharges on heavy or large packages, or products that ship from one warehouse only.

![Reality check](images/reality-check.jpg)

## Cost reports

A cost report is the ship cost history (UPS invoice lines and USPS labels) that the Analysis uses as "what we paid".

![Cost reports](images/cost-reports.jpg)

- **Import from Mango**: pick a date range and import it directly. Managers can also schedule a weekly import in Settings.
- **Upload a file**: upload the Excel (.xlsx) export instead.
- Only our own prepaid shipments are used; third-party and collect shipments are left out. Names and addresses are read only to place each package, and aren't stored.
- UPS invoices reach Mango a few weeks after shipping, so the newest weeks contain mostly USPS.

## Quotes

A quote run pulls a rate for every warehouse, zone (2–8) and weight: USPS Ground Advantage up to 20 lb and UPS Ground up to 150 lb, commercial and residential. That's thousands of quotes, so a run takes a while. It's paced so UPS doesn't throttle us.

![Quotes](images/quotes.jpg)

- **Run quotes now** starts a run (managers can schedule a weekly one in Settings).
- **View** shows a run's rate table by warehouse and service. The download icon exports it to Excel.
- Use the latest run for decisions; older runs are kept for comparison.
