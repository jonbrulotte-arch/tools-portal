Setting up and running the Packaging Configurator: packaging, shipping methods and rate cards, the Salsify list, the fit rules, and the sync, report and push.

## Who can do what

| Permission | Lets someone |
| --- | --- |
| Access to the tool | Use the Configurator and Bulk, see Products, Packaging, Shipping methods and the Report, and download exports. |
| **Packaging Configurator: run the sync & report** | On the Report tab (and in Settings), **Sync from Salsify**, stop a sync, and **Run now** to re-run the report. Scheduled syncs run regardless. |
| **Packaging Configurator: manage packaging** | On the Packaging tab, add, edit, import and delete packaging. |
| **Packaging Configurator: manage shipping methods & rate cards** | On the Shipping methods tab, add, edit and delete methods, and edit and import rate cards. |
| **Packaging Configurator: push a chosen packaging to Salsify** | In the Configurator, choose one packaging option for a product and push its shipping size and weight to Salsify, or return a product to automatic. |
| **Packaging Configurator: manage tool settings** | The Settings tab: fit rules, Salsify, and running a sync, the report or a push. |

Give these in **Admin → Roles**. When the permissions were split, roles that could manage packaging & shipping methods got both new ones, and roles that manage settings got **run the sync & report**, so nothing changed until you remove them. Anyone who starts a sync or push uses their own Salsify key (**My Profile → Salsify API key**) when they have one.

## Packaging

**Packaging** lists every option. **Add packaging** (or the pencil) opens the form:
- **Type:** Box, Bubble mailer, Poly mailer or Other.
- **Length, Width, Height:** inside measurements in inches. For a mailer, *Height* is the **material thickness** (about 0.25 in. for bubble, 0.1 in. for poly).
- **Max height:** how thick the contents can be. **Required for mailers.** For a box it's optional: set it for flat-pack boxes, so products stack flat and the package is measured at their real thickness.
- **Mailers shrink as they fill:** enter a mailer's **flat** size. The thicker the contents, the less length and width are left (a 13 × 10 in. mailer around 3 in. of product holds a 9.5 × 6.5 in. footprint). See [How mailers work](/help/packaging-configurator-methodology#how-mailers-work).
- **Max weight** and **Packaging weight** (its own weight, added to the actual weight).
- **Active:** turn an option off to stop offering it without deleting it.

![Packaging](images/packaging.jpg)

![Editing a mailer](images/packaging-dialog.jpg)

**Import** adds or updates packaging by **name** from a spreadsheet; download the **Template** for the columns (the stand-alone app's export imports as is). **Export** saves them all.

## Shipping methods and rate cards

A shipping method is one carrier service, such as *USPS Ground Advantage*, *UPS Ground* or an LTL carrier:
- **Min / Max billed weight:** the weights it takes.
- **DIM divisor:** blank uses the global one (139); USPS uses 166.
- **DIM threshold:** DIM applies only above this volume. USPS: 1,728 (one cubic foot). Blank: always.
- **LTL freight:** no DIM, and it's offered only for shipments at or over the LTL threshold.
- **Sort order** and **Active.**

![Shipping methods](images/methods.jpg)

The **$** button opens the **rate card**: one price per weight break, each covering billed weights up to its weight. Without a rate card the method still shows billed weights, with "no rate".

![A rate card](images/rates.jpg)

**Import rates** replaces the whole rate card of every method named in the sheet (*Method Name*, *Up To Weight (lbs)*, *Rate ($)*; the method must already exist). **Export rates** saves them all.

Changes to packaging, methods or rates re-run the report a few seconds later.

## Settings

### Fit rules

- **DIM divisor:** cubic inches per pound.
- **Pack efficiency:** how much of a box several items can fill (gaps between them). 70% by default.
- **Fit clearance:** room added to each side of a product.
- **LTL threshold:** shipments this heavy or more go LTL.

Saving a change re-runs the report.

![Fit rules](images/fit-rules.jpg)

### Salsify

- **Organization ID:** blank uses the one set in the Shipping Rates Generator.
- **Product list:** paste the list's Salsify address or its ID. This tool has its own list, separate from Shipping Rates.
- **Whose key scheduled jobs use:** a person with a saved Salsify key. Pushing needs edit rights in Salsify.
- **Fields:** the Salsify property names (exactly as in Salsify) for name, length, width, height, weight, and optionally UPC, Foldable and Ships in own packaging. The flags read *Yes/True/1* as yes.
- **How products ship today (optional):** the packaged length, width, height and weight (by default the *Shipping … (Inches/Pounds)* fields, the same ones the Shipping Rates Generator reads). They're compared with our recommendation on the **Report** tab. A product needs all four to be compared. **Don't use the four properties the push writes** here (by default *Calculated Shipping …*): the Report would then compare our calculation with itself, and every product would show as configured correctly. Settings and the Report warn when they're the same.

**Test the list** reads the first five products with the fields as typed (before saving) and shows how they come out. It warns if a required field isn't on any of them, which usually means a typo.

![Salsify settings and the list test](images/salsify.jpg)

### Sync products from Salsify

The sync reads the whole list, adds new products, updates changed ones, and **removes products no longer on the list**, but only when it read the list to the end; a sync that fails part-way removes nothing. The report runs as soon as it finishes. Set a schedule (daily at 3 AM by default) or press **Sync now**. **Stop** ends it after the current page of products. **Run the report now** re-runs the report on its own. Pressing these needs **run the sync & report** as well (people with only that permission have the same buttons on the Report tab); **Push all now** needs only the settings permission, because it writes to Salsify.

![The sync](images/sync.jpg)

### Push to Salsify

The push writes each product's **calculated shipping length, width, height and weight** (its best packaging's sealed size, and its actual shipping weight: the product plus the packaging's own weight, from the newest report) to four Salsify properties. Products with no fitting packaging are skipped, and **only changed values are written**, so a weekly push touches just what moved.

1. Enter the four **properties** (number or text properties).
2. **Try one product:** **Show values** shows what would be written; **Write this one** writes it and reads it back from Salsify.
3. Choose when it runs:
   - **Push right after each scheduled sync:** one schedule does everything. The scheduled sync reads Salsify, the report finds each product's best fit, then the push writes it back. Recommended.
   - **Push on its own schedule** (weekly on Monday at 7 AM by default), from the newest report.
   - Or press **Push all now**.

   Using both is fine: the second run finds nothing changed. A sync started by hand (Sync now) doesn't push.

The last push shows how many products were written, unchanged, skipped and failed, with the reasons.

**Packaging chosen by hand:** a product whose packaging someone chose and pushed from the Configurator is **kept**. The push doesn't overwrite it, and counts it as "kept at a packaging chosen by hand". The Products tab shows it as *Salsify: (packaging)*. To hand it back to the push, look it up in the Configurator and press **Return to automatic**.

![The push](images/push.jpg)

## Troubleshooting

| Message | What to do |
| --- | --- |
| *Set the Salsify list in Settings → Salsify first.* | Paste the list and save. |
| *No user is chosen for scheduled Salsify jobs.* | Choose whose key scheduled jobs use. |
| *Salsify rejected your API key* / *doesn't have access to this organization* | Re-save the key in My Profile, or check the organization ID. |
| *Salsify couldn't read list …* | Check the list ID, and that the key's owner can see the list. |
| Many products *missing size or weight* | Check the field names with **Test the list**; otherwise fill the values in Salsify. |
| *The Salsify key can't edit product …* (push) | The key's owner needs edit rights in Salsify; the push stops after five such failures. |
| *There's no finished packaging analysis yet.* | Sync, or press **Run the report now**. |
| *Stopped when the portal restarted* | A job was running during an update. Start it again. |
