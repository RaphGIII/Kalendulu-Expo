# RevenueCat Release Checklist

Entitlements expected by the app:

- `starter`
- `plus`
- `premium`

Product IDs expected by the app:

- `kalendulu_starter_monthly`
- `kalendulu_plus_monthly`
- `kalendulu_premium_monthly`
- `kalendulu_premium_yearly`
- `kalendulu_extra_ai_project`
- `kalendulu_extra_plus_credits`

Offering:

- current Offering identifier: `default`
- Paywall prices should come from RevenueCat packages whenever offerings load.

App behavior:

- RevenueCat uses only the iOS public SDK key in iOS builds.
- `BillingBootstrapper` refreshes RevenueCat after Supabase auth is ready.
- RevenueCat identity is tied to the Supabase user ID via `logIn`.
- On logout, the app calls RevenueCat `logOut`.
- Purchases use `Purchases.purchasePackage()` when RevenueCat packages are available.
- After purchase, the returned `CustomerInfo` is resolved immediately and `getCustomerInfo()` is retried once if the plan still resolves to `free`.
- Restore uses `Purchases.restorePurchases()`.

Plan resolution priority:

1. active entitlement `premium`, `plus`, `starter`
2. `activeSubscriptions` product IDs
3. purchased product identifiers if present

Manual dashboard checks:

- App Store Connect subscriptions are approved or ready for sandbox testing.
- RevenueCat products are attached to the iOS app.
- RevenueCat entitlements map to the correct products.
- Offering `default` is set as Current Offering.
