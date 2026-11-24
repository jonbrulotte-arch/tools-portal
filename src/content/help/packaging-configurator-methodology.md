How the Packaging Configurator decides what fits and what each shipping method bills. The defaults below are the fit rules in Settings and can be changed there.

| Rule | Default |
| --- | --- |
| DIM divisor | 139 cubic inches per pound (a shipping method can use its own) |
| Pack efficiency | 70% |
| Fit clearance | 0.5 in. |
| LTL threshold | 150 lb |

## 1. The products

Each product's **length, width, height (inches) and weight (pounds)** come from the Salsify fields set in Settings: by default the *UPC* (retail package) fields, which are the product's own size. Two optional flags change how it packs:
- **Foldable:** it can be folded in half. Its longest side is halved and its thinnest doubled (the volume stays the same). Example: a 20 × 10 × 1 in. item packs as 10 × 10 × 2.
- **Ships in own packaging:** its carton is the shipping box. It isn't put in packaging; it's priced on its own size, one carton per unit.

A product missing any of the four values isn't packed or checked. The Products tab lists these.

## 2. Does it fit?

Sides are compared largest to largest, so a product can turn any way.

- **Boxes:** each product side plus the clearance must fit the matching inside side. Example: a 9 × 7 × 5 in. product needs 9.5 × 7.5 × 5.5 in. inside.
- **Max height:** for mailers and flat-pack boxes, the max height (how thick the contents can be) stands in for the box's height.
- **Bubble and poly mailers** (with a max height): the product's two largest sides plus clearance must fit the mailer's flat size, and its thinnest side plus clearance must be within the max height.
- **Several units or products:**
  - With a **max height**, items lie flat and stack: the thinnest sides add up, and the stack plus clearance must be within the max height.
  - Otherwise, by **volume**: all the items' volume must be within the box's inside volume × the pack efficiency. Example: a 480 in³ box at 70% takes 336 in³ of products.

## 3. How well it fits

**Volume used** = products' volume ÷ the packaging's volume. With a max height, the packaging's volume is its sealed size (section 4).

| Volume used | Fit |
| --- | --- |
| 90% or more | Exact fit |
| 60–90% | Good fit |
| 35–60% | Loose fit |
| Under 35% | Oversized |

**Best first:** options are ranked by volume used, fullest first. Options the shipment would be **over the weight limit** for come last, whatever their fit, so an overweight mailer is never the best fit.

## 4. The package's size

- **Boxes:** the box's own size.
- **Flat-pack boxes with a max height:** length × width × (the stacked products' thickness).
- **Mailers:** the mailer wraps around the contents, so the sealed package is:
  - thickness = the stacked products' thickness + the mailer material (the mailer's "height");
  - length and width = the mailer's flat size minus the products' thickness.

  Example: a 9 × 6 in. bubble mailer (0.25 in. material) with a 0.5 in. product seals at 8.5 × 5.5 × 0.75 in.

This **shipping size** is what the push writes to Salsify and the Bulk export shows.

## 5. Weights

- **Actual weight** = the products' weight + the packaging's own weight.
- **DIM weight** = the package's volume ÷ the DIM divisor.
- **Rounding:** 1 lb and over rounds **up** to a whole pound; under 1 lb keeps three decimals. Example: 3.45 → 4 lb; 0.2524 → 0.252 lb.
- **Billed weight** on the card = the larger of actual and DIM weight, rounded, at the global divisor.

## 6. Shipping methods

For each active method (LTL methods aside):
1. **DIM weight** at the method's own divisor, else the global one.
2. **Does DIM apply?** Yes, unless the method has a **DIM threshold** and the package's volume is at or under it (USPS: 1,728 in³, one cubic foot).
3. **Billed weight** = the larger of actual and DIM weight when DIM applies, else the actual weight; rounded as above. **DIM** is tagged when the DIM weight is the larger.
4. The method is offered only if the billed weight is within its **min and max weight**.
5. **Price:** the first rate-card break at or above the billed weight ("up to 5 lb: $13.40"). Heavier than the last break: *no rate*.

**Cheapest** marks the lowest price. A package is flagged **DIM on every method** only if every offered method bills it by DIM, because otherwise DIM can be avoided by choosing another method.

Example: a 10 × 8 × 6 in. box (480 in³) with 2.5 lb inside:
- UPS Ground (divisor 139, no threshold): DIM 3.45 → 4 lb, billed **4 lb (DIM)**;
- USPS Ground Advantage (166, threshold 1,728): 480 in³ is under the threshold, so billed at the actual weight, **3 lb**.

## 7. LTL freight

A shipment whose products weigh the LTL threshold or more (actual weight, without packaging) is flagged **LTL freight**. LTL methods are matched by actual weight only (no DIM) and priced from their rate card. Parcel options are still listed if any fit.

## 8. The report

The report runs each product **alone (one unit)** through sections 2–6:
- **With packaging:** fits at least one active option, or ships in its own packaging.
- **No packaging fits** and **Only loose fits** (its best option is under 60% full).
- **Billed by DIM:** its best option is billed by DIM on at least one method. *DIM by method* counts it under each such method.
- **Packaging use:** for each option, the products it fits, those it's the best fit for, those it's the *only* option for, the fit quality mix and the average volume used.

## 9. Pushing to Salsify

For each product with a best option, the push writes four values: its **shipping size** (section 4) as length, width and height, rounded to 0.01 in., and its **billed weight** (section 5). Products that ship in their own packaging send their own size and billed weight. Products with no fitting packaging are skipped. A product is written only when one of its four values changed since it was last written.

## Changes from the stand-alone app

- Packaging over its weight limit is ranked after the rest (it was flagged but could still be the best fit).
- Products, with their size, weight, UPC and flags, come only from Salsify; they aren't edited in the tool.
- Weights a hair over a whole pound from rounding (for example 3.0000001 lb) no longer round up to the next pound.
