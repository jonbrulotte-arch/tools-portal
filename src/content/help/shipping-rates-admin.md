For managers of the Shipping Rates Generator: people with its **Manage tool settings** permission, and Super Admins. Everything here is on the **Settings** tab. API keys and passwords are encrypted when saved and never shown again; leave a secret box blank to keep the saved value.

## Rates source

Choose **Simulated** (placeholder prices, for trying the tool) or **Live** (real UPS and Endicia rates). Every run and quote made in simulated mode is labelled *Simulated rates* everywhere.

![Rates source](images/rates-source.jpg)

Switch to **Live** only once the UPS and Endicia connections below test successfully.

## Warehouses, UPS accounts and destinations

- **Warehouses**: the origins quotes are pulled from, and the groups history is reported by.
- **UPS accounts → warehouse**: the UPS invoice rarely shows the origin, so each package is placed by its shipper account (the 6 characters after `1Z` in the tracking number). Add each account and its warehouse. Tick **Quote with** on the account each warehouse's live quotes should use, so negotiated rates match what that warehouse pays.
- **Quote destinations**: carriers price by ZIP, not zone, so each zone is quoted to one ZIP. Leave a box empty to use the automatic choice (a ZIP in the city we ship to most in that zone).
- **USPS / UPS quotes up to (lb)**: the heaviest weight quoted per carrier.

![UPS accounts by warehouse](images/ups-accounts.jpg)

## UPS API and Endicia (USPS)

![UPS API](images/ups-api.jpg)

- **UPS API**: the **Client ID** and **Client secret** of an app at developer.ups.com with the Rating product, plus the environment. Rates are requested with our negotiated (account) pricing.
- **Endicia (USPS) API**: the Label Server **Requester ID**, **Account ID**, **Pass phrase** and, for production accounts, the **Endpoint URL** Endicia support gives you.

![Endicia (USPS) API](images/endicia.jpg)

Click **Test** on each card after saving.

## Scheduled quote run

![Scheduled quote run](images/scheduled-quote-run.jpg)

Set the **Frequency**, **Day**, **Start at** time and **Time zone** (for example weekly, **Monday at 1:00 AM Pacific**) so the Analysis always has current rates, and how many scheduled runs to keep. A run is paced and retries automatically if UPS throttles it.

## Mango cost import

![Mango cost import](images/mango-import.jpg)

Enter the **Mango export URL**, the **Date range** (days back from today, for example 90) and the schedule (for example weekly, **Monday at 12:00 AM**). **Keep this many automatic imports** removes older automatic reports; uploaded reports are kept.

## Salsify (product lookup) and the Products list

![Salsify](images/salsify.jpg)

- **Salsify (product lookup)**: the **Organization ID** and the property names for shipping weight and box size, plus the **UPC** properties used as a fallback when the shipping ones are missing.
- Each person uses **their own** Salsify API key (My Profile) for Product quote lookups.

![Products (Salsify list)](images/products-list.jpg)

- **Products (Salsify list)**: the list whose products are quoted on the Products tab. Paste the list's address or its ID (`s-…`). Choose whose Salsify key **scheduled runs use**, the schedule, and how many runs to keep.
- Each product gets 42 quotes (2 warehouses × 7 zones × 3 services), so a big list takes a while; progress shows on the Products tab.

## Checklist after a change

- [ ] **Test** on each changed card succeeds
- [ ] **Run quotes now** completes, without a *Simulated* badge if you're live
- [ ] The Analysis shows the new run, and the quote-vs-actual difference looks reasonable
