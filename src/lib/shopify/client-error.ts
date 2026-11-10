export class ShopifyError extends Error {
  constructor(message: string, public details?: unknown) {
    super(message);
  }
}

/** Add plain-language guidance to Shopify's known OAuth errors. */
export function explainTokenError(raw: string): string {
  if (/shop_not_permitted|cannot be performed on this shop/i.test(raw)) {
    return `${raw} The Client ID & secret method only works for stores listed under Stores in your Dev Dashboard organization. Edit this store and switch to "Connect with Shopify" instead.`;
  }
  if (/not installed on this shop/i.test(raw)) {
    return `${raw} Install the app on this store from the Dev Dashboard (app → Install), then test again.`;
  }
  if (/invalid_client|client authentication failed/i.test(raw)) {
    return `${raw} Check that the Client ID and secret are copied from the same app.`;
  }
  return raw;
}
