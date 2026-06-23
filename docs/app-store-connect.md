# App Store Connect Notes

iOS first release settings:

- Bundle ID: `com.kalendulu.app`
- Tablet support is disabled for v1 because the UI has not been audited as iPad-ready.
- `ITSAppUsesNonExemptEncryption` is `false`; revisit if custom encryption beyond standard HTTPS is added.

Ads and tracking:

- Rewarded ads are configured with `requestNonPersonalizedAdsOnly: true`.
- The app should be declared as using non-personalized ads unless personalized ad requests or IDFA tracking are added.
- If IDFA/tracking is introduced, add `NSUserTrackingUsageDescription` and an ATT prompt.

Privacy answers should mention:

- account data
- user-generated goals, plans, todos, habits, calendar items
- uploaded study files are processed temporarily
- purchases/subscriptions through Apple/RevenueCat
- non-personalized ads if enabled

Legal URLs configured in the app:

- privacy
- support
- imprint
- delete-account information
