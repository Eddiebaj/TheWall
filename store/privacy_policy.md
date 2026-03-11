# RouteO Privacy Policy

**Effective Date:** March 11, 2026
**Last Updated:** March 11, 2026
**Developer:** Eddie Bajovic
**Contact:** routeoapp@gmail.com

---

## Overview

RouteO is a transit routing app for Ottawa and Gatineau. This policy explains what data we collect, how we use it, and your rights.

## Data We Collect

### Location Data
- **GPS location** is used to show nearby stops, plan trips from your current position, and provide live navigation. Location is accessed only when you grant permission and is never transmitted to our servers or stored remotely.

### Locally Stored Preferences
All of the following are stored **on your device only** using AsyncStorage:
- Saved bus stops and favourite routes
- Saved trips (origin, destination, itinerary details)
- My Board card layout and order
- Saved sports teams
- Notification preferences
- Theme and language settings
- Onboarding completion status

### Crowdsourced Data (Optional)
- If you submit a **gas price report**, the station name, price, and timestamp are stored in our Supabase database. No personally identifiable information is attached to the report.
- If you submit **social feedback** (e.g., bus crowding), the route and feedback type are stored anonymously.

## Data We Do NOT Collect

- We do **not** collect names, email addresses, phone numbers, or account credentials.
- We do **not** use advertising SDKs or ad tracking of any kind.
- We do **not** sell, rent, or share your data with third parties.
- We do **not** use analytics or telemetry frameworks that track user behaviour.
- We do **not** create user profiles or track you across apps or websites.

## Third-Party Services

RouteO communicates with the following external services solely to provide transit functionality:

| Service | Purpose | Data Sent |
|---------|---------|-----------|
| OC Transpo API | Real-time bus arrivals, service alerts | Stop numbers, route numbers |
| OpenTripPlanner (OTP) | Trip routing for OC Transpo + STO | Origin/destination coordinates |
| Google Places API | Address autocomplete in trip planner | Search text (partial address) |
| Ticketmaster API | Local event listings on map | Ottawa region query |
| Ottawa Open Data (ArcGIS) | Parks, road closures, bike share | Geographic queries |
| NHL / ESPN APIs | Sports scores for saved teams | Team identifiers |
| Supabase | Anonymous gas price + social reports | See "Crowdsourced Data" above |

No personal identifiers are included in any API request.

## Notifications

RouteO uses Expo Notifications to send **local, on-device notifications** for:
- Transit departure reminders (scheduled by you)
- Service alert updates (if enabled)

Notifications are scheduled locally. We do not operate a push notification server and cannot send you unsolicited messages.

## Data Retention

- All preference data is stored locally and persists until you clear the app's data or uninstall it.
- Crowdsourced gas price reports are retained in our database indefinitely but contain no personal information.
- No server-side user accounts exist. There is nothing to delete on our end.

## Children's Privacy

RouteO does not knowingly collect data from children under 13. The app does not require an account and collects no personal information from any user.

## Your Rights

### Under GDPR (EU/EEA residents)
Since we do not collect personal data or maintain user accounts, there is no personal data to access, rectify, or delete. Your locally stored preferences can be cleared by uninstalling the app or clearing app data in your device settings.

### Under CCPA (California residents)
We do not sell personal information. We do not collect personal information as defined by the CCPA. You may contact us at the email below for any questions.

### Under PIPEDA (Canadian residents)
RouteO complies with Canada's Personal Information Protection and Electronic Documents Act. We do not collect, use, or disclose personal information.

## Changes to This Policy

We may update this policy from time to time. Changes will be reflected in the "Last Updated" date above. Continued use of RouteO after changes constitutes acceptance.

## Contact

For questions about this privacy policy:
**Email:** routeoapp@gmail.com
