# iOS Release Checklist

Before TestFlight or App Store submission:

1. Set all production EAS environment variables from `docs/env.production.md`.
2. Deploy Supabase migrations.
3. Deploy `delete-account` Edge Function.
4. Deploy Cloudflare Worker.
5. Confirm RevenueCat products, entitlements, and current Offering.
6. Confirm App Store Connect subscriptions.
7. Run:

```bash
npm run validate:publish
```

8. Build and submit:

```bash
eas build --platform ios --profile production
eas submit --platform ios --profile production
```

Manual verification:

- email signup/login/logout
- account deletion from Settings
- RevenueCat purchase and restore in sandbox
- free study preview for large document
- premium study plan after purchase
- legal/support links open
- app starts cold on iPhone 11 or similar older device
