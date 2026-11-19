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
- **Export CSV** saves the whole run for Excel.

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
