# App Store Connect Notes

iOS first release settings:

- Bundle ID: `com.kalendulu.app`
- Tablet support is disabled for v1 because the UI has not been audited as iPad-ready.
- `ITSAppUsesNonExemptEncryption` is `false`; revisit if custom encryption beyond standard HTTPS is added.

Ads and tracking:

- Google Mobile Ads and rewarded ads are disabled for v1.
- Do not declare ads in App Store privacy answers unless a future build reintroduces an ad SDK.
- If IDFA/tracking is introduced, add `NSUserTrackingUsageDescription` and an ATT prompt.

Privacy answers should mention:

- account data
- user-generated goals, plans, todos, habits, calendar items
- uploaded study files are processed temporarily
- purchases/subscriptions through Apple/RevenueCat

Legal URLs configured in the app:

- privacy
- support
- imprint
- delete-account information
