For managers of the Shopify Discount Code Generator: people with the tool's **Manage tool settings** permission, and Super Admins. It covers connecting stores and presetting the New discount form. The everyday steps are in the *Shopify Discount Code Generator: SOP*.

## Stores

**Stores** lists the Shopify stores the tool can create discounts on.

![Connected stores](images/stores.jpg)

To connect a store:

1. Create the Shopify app, one of two ways:
   - **Dev Dashboard app** (recommended for new setups): in the Shopify Dev Dashboard, create an app with the Admin API scopes `write_discounts`, `read_discounts` and `read_products`, release a version and install it on the store. Copy its **Client ID** and **Client secret**. Tokens are fetched and refreshed automatically.
   - **Admin API access token**: if the store already has a custom app created in Shopify admin, use its access token (starts with `shpat_`), with the same scopes.
2. Click **Add store** and enter the store's name, its `*.myshopify.com` domain, and the credentials.
3. Save, then test it. The test shows the shop name and currency, and warns if a scope is missing.

Credentials are encrypted and never shown again. To rotate a secret, edit the store and type the new value; leave it blank to keep the saved one.

## Form settings

**Form settings** sets the default values of the New discount form for everyone, and can **lock** them.

![Form settings: defaults and locks](images/form-settings.jpg)

- A default pre-fills the form; people can change it.
- **Lock for regular users** makes the field read-only for people without this tool's *Manage tool settings* permission. It's also enforced on the server, so it can't be bypassed.
- Settings apply to all stores.

Typical policy: lock **one use per customer** on, and default **Limit the total number of times** to 1.

## Checking what was created

Managers (and roles with *Shopify: view all discounts*) see every discount in the **Discount log**, not just their own. The platform's **Access log** also records every discount created, failed or changed.
