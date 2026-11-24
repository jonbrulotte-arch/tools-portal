The Packaging Configurator finds the best box or mailer for a product or an order, and shows what each shipping method bills for it: the actual weight, the dimensional (DIM) weight, the billed weight and the price.

Products, with their own size and weight, come from Salsify. Packaging and shipping methods are set up in the tool (see *Packaging Configurator: settings*). How every number is worked out is in *Packaging Configurator: methodology & calculations*.

## Configurator

Open **Configurator** and enter what's shipping.

**Part number or UPC**
1. Type a part number, or click in the box and **scan the barcode**. A scanner presses Enter after the code, which starts a new line, so you can keep scanning.
2. Set the **Qty** for each line. The same part on two lines is added together.
3. Press **Find packaging**.

![Entering parts and scanned UPCs](images/lookup.jpg)

To paste a long list, use **Import from Excel** with a sheet that has *Part Number* and *Quantity* columns (download the **Template**).

**Enter a size** is for anything that isn't in Salsify, such as a sample or a competitor's product. Type the length, width, height (inches), weight (pounds) and quantity. Tick **Foldable** for flat, flexible items, and **Ships in its own packaging** if its own carton goes out as is.

![Entering a size by hand](images/manual.jpg)

### Reading the results

- **Shipment:** the products as they are in Salsify, the units and the total weight. Badges show *Foldable* and *Ships in own packaging*.
- **LTL freight** (red box): the shipment is at or over the LTL weight (150 lb by default) and should go by freight. The LTL methods that cover it are listed.
- **Ships in own packaging:** these products go out in their own carton, one per unit, and are priced on their own.
- **Packaging options**, best first. Each card shows:
  - **Best fit** (green) on the top card, the packaging's type and a **fit badge**: *Exact fit* (90% or more of the space used), *Good fit* (60–90%), *Loose fit* (35–60%) or *Oversized* (under 35%).
  - **Volume used:** how full it is.
  - **Ships at:** for mailers, the sealed size (a mailer shrinks around what's in it).
  - **Products, Packaging, Actual weight, DIM weight, Billed weight.** DIM weight is amber when it's more than the actual weight.
  - **Shipping methods:** each method that takes this billed weight, with the weight it bills, a **DIM** tag when it bills by dimensional weight, and its price from the rate card. The cheapest is marked **Cheapest**.
  - Warnings for a loose fit, for DIM on every method, and for going **over the packaging's weight limit**. Options over their limit are always listed last.

The top three options are shown; **Show all** lists the rest.

![The best fit and its shipping methods](images/best-fit.jpg)

**Export to Excel** saves the products and every option in a workbook.

### Pushing a packaging to Salsify

If you have the permission, you can choose the packaging a product ships in and write it to Salsify:
1. Look up **one part number with quantity 1** (a single unit, as Salsify describes it).
2. Under the packaging options, pick **Choose for Salsify** on the one you want. You can choose one at a time.
3. Press **Push to Salsify** on that card. Its shipping size (as sealed) and billed weight are written to the product's four Salsify properties, and read back so you can see what Salsify now has.

A product pushed this way **keeps its chosen packaging**: the scheduled push leaves it alone even if another option is the best fit. A blue note above the options shows the choice, who made it and when. **Return to automatic** clears it; the next push then writes the best fit again.

## Bulk

**Bulk** packs many shipments at once, for example a day's orders.

1. Download the **template**, or use any sheet with these columns:
   - **Grouping ID**: an order or shipment number. Lines with the same ID are packed together. (*Order ID* and *Shipment ID* also work.)
   - **Part Number**: the part number or UPC.
   - **Quantity**.
2. Press **Upload shipments**. The results appear in a few seconds.
3. The tiles filter the list: *Worth a look* (a loose fit, DIM on every method, or over the weight limit), *No packaging fits*, *LTL freight* and *Unknown products* (a part that isn't on the Salsify list, or is missing its size or weight).
4. **Export results** saves every shipment with its packaging, shipping size (height, width, length), weights, fit and cheapest method.

![Bulk results](images/bulk.jpg)

## Products

**Products** lists everything read from the Salsify list, with each product's size, weight, UPC, flags, and its best packaging and billed weight from the latest report. Search by part number, name or UPC, or filter by:
- **Missing size or weight:** these can't be packed until they're filled in **in Salsify**. The next sync picks up the fix.
- **No packaging fits**, **Foldable**, **Ships in own packaging**.

**Pack it** opens the product in the Configurator.

![Products from Salsify](images/products.jpg)

## Report

**Report** checks every product (one unit each) against every active packaging option. It runs after each Salsify sync, and a few seconds after anyone changes packaging, shipping methods or the fit rules.

- **Tiles:** the share of products with packaging, how many fit nothing, how many fit only loosely, and how many are billed by DIM on at least one method.
- **Products needing attention:** the lists behind those tiles, each with a **Pack it** link.
- **Packaging use:** how many products each option fits, how often it's the best fit, and how full it is on average. An option that's nobody's best fit is a candidate to drop; a product whose *only* option is one box tells you not to drop that box.
- **Billed by DIM, per shipping method** and **By packaging type.**

![The packaging report](images/report.jpg)

**Export to Excel** saves the summary, packaging use, DIM by method, the coverage gaps and every product with its best packaging and shipping size.

## Packaging review

**Packaging review** shows where products are already packaged right and where they could be packaged better. For every product with a **packaged size and weight** in Salsify (how it ships today), it compares that package with our best packaging for the product, priced the same way: billed weight and the cheapest shipping method, for one unit.

Each product gets one verdict; the tiles count them and pick the list below:

| Verdict | Meaning |
| --- | --- |
| **Could be packaged better** | Our recommendation bills less than today's package. Sorted by the saving per shipment. |
| **Configured correctly** | Today's package bills the same as the recommendation (usually it *is* that packaging). |
| **Current packaging beats our options** | Today's package bills less than anything we have set up: worth adding it as a packaging option. |
| **Packaged size smaller than the product** | One of the two sizes in Salsify is wrong. |
| **No packaging of ours fits** | Nothing to compare with. |
| **No packaged size in Salsify** | Fill in the packaged size and weight to include it. |

"Looks like" names the packaging option today's package matches (every side within half an inch). The saving is per shipment of one unit, from the rate cards; multiply by how often a product ships for the real saving. **Pack it** opens the product in the Configurator, where you can push the packaging you choose to Salsify. The Products tab also shows each product's packaged size and verdict.

![The packaging review](images/review.jpg)

## Common questions

- **"Not on the Salsify product list".** The part isn't on the list this tool reads, or it was added since the last sync. Ask whoever manages the tool to add it to the list or run a sync.
- **"Can't be packed: Salsify has no …".** Fill in the product's size or weight in Salsify. It updates after the next sync.
- **A box I expected isn't offered.** It may be turned off, too small once the clearance is added (half an inch on each side by default), or too full with several units. See the methodology.
- **No price on a method.** Its rate card stops below this weight, or it has none.
