For every product, the Packaging Configurator picks **the packaging it should ship in** and works out **the shipping size and weight** that go to Salsify. It also prices that package on each of our shipping methods. This page walks through every step, with the rule the tool applies and why. The full reference is *Packaging Configurator: methodology & calculations*.

## Summary

The product's size and weight come from Salsify. The tool tries the product in every active box and mailer, keeps those it fits with half an inch of clearance, and ranks them by how full they are (fullest first). For the best fit it works out:
- the sealed package size (a mailer shrinks around its contents);
- the actual weight (product plus packaging) and the dimensional (DIM) weight;
- what each shipping method would bill and charge.

The sealed size and the actual weight are pushed to Salsify; the billed weight and price show what shipping it will cost.

The tool checks itself against reality: its report compares each product's recommended packaging with how the product ships today (its packaged size in Salsify), and flags products that could be packed cheaper or that still carry a retired packaging.

![How a product gets its packaging: 4 steps, 2 outputs, 1 check](images/how-it-works.png)

Each box is one or two of the steps below; the Report closes the loop by comparing the best fit with today's packaging.

## Where the data comes from

Products come from Salsify; packaging, shipping methods and their prices are maintained in the tool itself.

| Source | What it provides | Refreshed |
| --- | --- | --- |
| Salsify (the tool's own product list) | Each product's length, width, height and weight (its own size, by default the UPC fields), plus the Foldable and Ships in own packaging flags | Daily sync (3 AM by default) |
| Salsify, "how it ships today" fields | Each product's current packaged length, width, height and weight, for the report's comparison | Same sync |
| Packaging list (in the tool) | Every box and mailer: inside size, max height for mailers, max weight, the packaging's own weight, active or not | When someone with the permission edits it |
| Shipping methods and rate cards (in the tool) | Each carrier service: weight range, DIM divisor and threshold, and a price per weight break | When edited |

**The fit rules** are settings, with these defaults:

| Rule | Default | What it does |
| --- | --- | --- |
| Fit clearance | 0.5 in. | Room added to each side of a product |
| Pack efficiency | 70% | How much of a box several items can fill (the gaps between them) |
| DIM divisor | 139 in³ per lb | Global; a shipping method can use its own (USPS 166) |
| LTL threshold | 150 lb | Shipments this heavy or more go LTL freight |

The report re-runs after each Salsify sync, and a few seconds after anyone changes packaging, shipping methods or these rules.

## Step 1: the product

Each product needs four values from Salsify: **length, width, height (inches) and weight (pounds)**. These are the product's own size, not its current shipping box. A product missing any of them isn't packed or checked; the Products tab lists these so they can be fixed in Salsify.

Two optional flags change how it packs:

- **Foldable:** the item can be folded in half: its longest side is halved and its thinnest doubled, so the volume stays the same. A 20 × 10 × 1 in. item packs as 10 × 10 × 2. Every packaging option is tried **both flat and folded**, and the fuller fit wins (folding can make an item too thick for a box it fits flat).
- **Ships in own packaging:** the product's own carton is the shipping box. It isn't put in packaging; it's priced on its own size and weight, one carton per unit.

Sides are always compared largest to largest, so a product can turn any way in a box.

## Step 2: does it fit?

Each active packaging option is tested. The rule depends on the kind of packaging:

| Packaging | Fits when | Example |
| --- | --- | --- |
| Box | Each product side + 0.5 in. clearance fits the matching inside side (largest to largest) | A 9 × 7 × 5 in. product needs 9.5 × 7.5 × 5.5 in. inside |
| Bubble or poly mailer | The product's two largest sides **plus its thickness** plus clearance fit the mailer's flat size, and its thickness plus clearance is within the mailer's max height | A 9.5 × 8 × 3 in. product needs at least 13 × 11.5 in. flat (9.5 + 3 + 0.5 and 8 + 3 + 0.5), so a 13 × 10 in. mailer doesn't fit |
| Flat-pack box (with a max height) | The max height stands in for the box's height; items lie flat | |

**Several units or products** (the Configurator and Bulk tabs):

- With a **max height** (mailers, flat-pack boxes): items lie flat and stack; their thinnest sides add up, and the stack plus clearance must be within the max height.
- Otherwise, by **volume**: all the items' volume must be within the box's inside volume × 70% pack efficiency. A 480 in³ box takes 336 in³ of products.

The Report and the Salsify push always use **one unit** of each product.

## Step 3: how well it fits, and which option wins

**Volume used** = the products' volume ÷ the packaging's volume. For a mailer, the packaging's volume is its sealed size (Step 4), so a well-filled mailer reads close to 100% and never over it.

| Volume used | Fit badge |
| --- | --- |
| 90% or more | Exact fit |
| 60–90% | Good fit |
| 35–60% | Loose fit |
| Under 35% | Oversized |

**Ranking:** options are ranked by volume used, **fullest first**; the top one is the **best fit**. An option the shipment would be **over the weight limit** for always ranks last, whatever its fit, so an overweight mailer is never the best fit.

**Why fullest first:** the fullest packaging that fits is the smallest one. A smaller package means less void fill, a lower DIM weight, and usually a lower price.

## Step 4: the sealed package size

The package's size is what carriers measure and what goes to Salsify:

- **Box:** the box's own size.
- **Flat-pack box with a max height:** length × width × the stacked products' thickness.
- **Mailer:** a mailer wraps around its contents, so the more it holds in thickness, the less is left for length and width:
    - sealed thickness = the contents' thickness + the mailer material (about 0.25 in. bubble, 0.1 in. poly);
    - sealed length and width = the mailer's flat size minus the contents' thickness.

**Example:** a 13 × 10 in. poly mailer (0.1 in. material, max height 3.5 in.), 0.5 in. clearance, DIM divisor 139:

| Contents thick | Sealed size (L × W × H) | Largest footprint it holds | Sealed volume | DIM weight |
| --- | --- | --- | --- | --- |
| 0.5 in. | 12.5 × 9.5 × 0.6 in. | 12 × 9 in. | 71 in³ | 0.513 lb |
| 1 in. | 12 × 9 × 1.1 in. | 11.5 × 8.5 in. | 119 in³ | 0.855 lb |
| 2 in. | 11 × 8 × 2.1 in. | 10.5 × 7.5 in. | 185 in³ | 2 lb |
| 3 in. | 10 × 7 × 3.1 in. | 9.5 × 6.5 in. | 217 in³ | 2 lb |

What that means: **a mailer holds less than its flat size suggests.** At 3 in. thick, this 13 × 10 mailer takes only a 9.5 × 6.5 in. footprint. And going from 1 to 3 in. thick triples the thickness but less than doubles the volume, because length and width shrink.

The old stand-alone app checked only the flat size, so a thick product could "fit" a mailer whose sealed size was smaller than the product (over 100% used). The tool fixed that.

## Step 5: three weights

| Weight | How it's worked out | Used for |
| --- | --- | --- |
| Actual weight | The products' weight + the packaging's own weight | Pushed to Salsify |
| DIM weight | The sealed package's volume ÷ the DIM divisor (139 by default) | Showing when size, not weight, drives the price |
| Billed weight | The **lowest** billed weight among the shipping methods that take the package (Step 6) | The Report, the cards and Bulk |

**Rounding:** 1 lb and over rounds **up** to a whole pound; under 1 lb keeps three decimals. 3.45 lb bills as 4 lb; 0.2524 lb stays 0.252 lb.

**Why billed weight is the lowest among methods:** each carrier applies its own DIM rule. An 11.5 × 8.5 × 1.6 in. mailer holding 0.29 lb is 2 lb by DIM at 139, but USPS applies DIM only over one cubic foot, so it bills **0.29 lb**. Showing 2 lb would overstate what we pay for a package we'd send USPS. Without any shipping method, billed weight is the larger of actual and DIM weight.

**Why Salsify gets the actual weight, not the billed weight:** the billed weight is a pricing outcome that depends on the carrier. Writing it to Salsify once sent a 0.28 lb item as 2 lb. The product record keeps the true weight; carriers apply their own DIM rules to it.

## Step 6: what each shipping method bills and charges

For each active shipping method (LTL aside), in order:

1. **DIM weight** at the method's own divisor, else the global 139.
2. **Does DIM apply?** Yes, unless the method has a DIM threshold and the package is at or under it (USPS: 1,728 in³).
3. **Billed weight** = the larger of actual and DIM weight when DIM applies, else the actual weight, rounded as in Step 5. Tagged **DIM** when DIM is the larger.
4. The method is offered only if the billed weight is within its **min and max weight**.
5. **Price** = the first rate-card break at or above the billed weight ("up to 5 lb: $13.40"). Heavier than the last break: no rate.

The lowest price is marked **Cheapest**. A package is flagged **DIM on every method** only if every offered method bills it by DIM; otherwise DIM can be avoided by choosing another method.

**Example:** a 10 × 8 × 6 in. box (480 in³) with 2.5 lb inside:

| Method | Divisor | DIM weight | Billed |
| --- | --- | --- | --- |
| UPS Ground | 139, always | 480 ÷ 139 = 3.45 → 4 lb | **4 lb (DIM)** |
| USPS Ground Advantage | 166, only over 1,728 in³ | Doesn't apply (480 in³) | **3 lb** (actual, rounded up) |

**LTL freight:** a shipment whose products weigh the LTL threshold or more (150 lb, without packaging) is flagged LTL. LTL methods are matched by actual weight only (no DIM) and priced from their rate card.

The rate cards are maintained in the tool by whoever has the permission; they're the prices the tool uses here, separate from the Shipping Rates Generator's live quotes.

## Step 7: a worked example

An illustrative product, **9 × 7 × 1 in., 0.6 lb**, not foldable, checked against two options (the packaging weights are assumed for the example): a 13 × 10 in. poly mailer (0.1 in. material, max height 3.5 in., weighs 0.05 lb) and a 10 × 8 × 6 in. box (weighs 0.4 lb). Product volume: 9 × 7 × 1 = 63 in³.

| Step | Poly mailer 13 × 10 | Box 10 × 8 × 6 |
| --- | --- | --- |
| 2. Fits? | 9 + 1 + 0.5 = 10.5 ≤ 13 and 7 + 1 + 0.5 = 8.5 ≤ 10; thickness 1.5 ≤ 3.5. **Yes** | 9.5 × 7.5 × 1.5 inside 10 × 8 × 6. **Yes** |
| 4. Package size | 13 − 1 = 12 by 10 − 1 = 9 by 1 + 0.1 = 1.1 → **12 × 9 × 1.1 in.** (118.8 in³) | 10 × 8 × 6 in. (480 in³) |
| 3. Volume used | 63 ÷ 118.8 = **53%**, loose fit | 63 ÷ 480 = 13%, oversized |
| 3. Rank | **Best fit** (fuller) | Second |

For the best fit, the mailer:

1. **Actual weight** = 0.6 + 0.05 = **0.65 lb**.
2. **DIM weight** = 118.8 ÷ 139 = **0.855 lb**.
3. **UPS Ground** (DIM always): billed = the larger, **0.855 lb (DIM)**.
4. **USPS Ground Advantage** (118.8 in³ is under 1,728, so no DIM): billed = **0.65 lb**.
5. **Billed weight** shown = the lowest of the two = **0.65 lb**; each method is priced from its rate card at its own billed weight, and the cheaper is marked Cheapest.
6. **To Salsify:** length 12, width 9, height 1.1 (in.) and weight 0.65 (lb).

In the box, UPS would bill the same 0.6 lb part at 4 lb by DIM (480 ÷ 139 = 3.45, rounded up): that is the cost the ranking avoids.

## What goes to Salsify

For each product with a best fit, the push writes **four values** to four Salsify properties (by default *Calculated Shipping Length / Width / Height / Weight*):

| Value | What it is | Rounding |
| --- | --- | --- |
| Length, width, height | The best fit's sealed package size (Step 4) | 0.01 in. |
| Weight | The actual shipping weight: product + packaging (Step 5), not the billed or DIM weight | 0.01 lb |

- **Ships in own packaging:** its own size and weight are sent.
- **No packaging fits:** skipped (listed on the Report).
- **Only changes are written:** a product is written only when one of its four values changed since it was last written.
- **When:** right after each scheduled sync (recommended), on its own schedule, or on demand.

**Packaging chosen by hand.** Someone with the permission can pick any option that fits a product in the Configurator and push it. The four values are worked out again on the server and written at once. That product is then marked as chosen by hand, and the scheduled push **leaves it alone** until someone returns it to automatic.

## How it's checked: the report against how products ship today

The Report runs every product (one unit) through Steps 2 to 6 and compares the recommendation with **how it ships today**: its packaged length, width, height and weight in Salsify (by default the *Shipping … (Inches/Pounds)* fields, never the fields the push writes).

1. **Today's package** is priced as a box of that size and weight (that weight already includes its packaging): DIM weight, each method's billed weight and price. The cheapest priced method is kept.
2. **The recommendation** is priced the same way from its sealed size and actual weight.
3. **Saving per shipment** = today's cheapest price − the recommendation's cheapest price. Without rates on both sides, it's compared on billed weight instead.
4. **Verdict**, first that applies:

| Verdict | When | Action |
| --- | --- | --- |
| Packaged size smaller than the product | Today's package is smaller than the product on any side (0.05 in. allowed) | Fix the size in Salsify |
| No packaging of ours fits | No recommendation | Consider new packaging |
| Configured correctly | Today's package matches the recommendation (every side within 0.5 in.), or the saving is under half a cent | None |
| Could be packaged better | The saving is positive | Repack in the recommendation, push it to Salsify |
| Expired packaging option | The saving is negative: today's package bills less than anything we ship in, so Salsify still has a retired packaging. Products that ship in their own packaging are never put here. | Update Salsify to a current option |

The Report's total saving adds up the *could be packaged better* products at one shipment each; multiply by how often each ships for the real figure.

The Report also shows how each packaging option is used: how many products it fits, how often it's the best fit, and how full on average. An option that's nobody's best fit is a candidate to drop.

## Known limits and method changes

The tool is only as good as its inputs. Its known blind spots:

- **Salsify sizes drive everything.** A wrong product size or weight gives a wrong recommendation; the Report flags packaged sizes smaller than the product, but not a product size that's simply wrong.
- **Prices come from the tool's own rate cards**, maintained by hand. If a card is out of date, prices and savings are too (billed weights are still right).
- **The Report and the push use one unit.** A product that usually ships several to an order may be better in a bigger option.
- **Several items in a box use a volume rule** (70% pack efficiency), not a 3D packing model, so a tight multi-item fit can be judged wrong either way.
- **Folding is a simple model:** longest side halved, thinnest doubled.
- **Fullest-first is a proxy for cheapest.** It usually is, but the price comparison on each card is what to check when two options are close.

| Date | Change | Why |
| --- | --- | --- |
| Nov 24, 2026 | Billed weight is the lowest among the shipping methods (each with its own divisor and DIM threshold), not the global DIM weight | Small, light packages showed DIM weights no method would bill |
| Nov 24, 2026 | The push writes the actual shipping weight (product + packaging), not the billed weight | A 0.28 lb item in a mailer went to Salsify as 2 lb |
| Nov 24, 2026 | The Packaging review became part of the Report | One place for the analysis |
| Nov 24, 2026 | "Current packaging beats our options" became Expired packaging option | Our options are what we ship in; a cheaper package in Salsify is a retired one |
| At launch | Overweight options rank last; mailers must fit after wrapping their contents; foldable items tried flat and folded | The stand-alone app could pick an overweight mailer, "fit" a product in a mailer smaller than it (over 100% used), and always folded |
