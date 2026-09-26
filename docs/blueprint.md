# PokeTrade — Bot specification

**Archetype:** commerce

**Voice:** warm and concise — write every user-facing message, button label, error, and empty state in this voice.

PokeTrade is a lightweight Telegram marketplace for collectors to buy and sell physical Pokémon cards. Users create photo-based listings (1–6 images), set price and condition, browse and filter public listings, and open in-bot private negotiation threads with sellers. Admins receive notifications for new listings and user reports and can remove or mark listings as sold.

> This is the complete contract for the bot. Implement EVERY entry point, flow, feature, integration, and edge case below. The completeness review checks the bot against this document after each build pass.

## Primary audience

- individual Pokémon collectors
- casual sellers
- casual buyers
- bot owner / admins

## Success criteria

- Users can create listings with 1–6 photos and required metadata and see them published in the public marketplace
- Other users can browse, filter, paginate listings, and open private in-bot threads to contact sellers
- Conversation messages are relayed between buyer and seller within the bot and persisted with the listing
- Admins receive a notification for every new listing and every report and can remove or mark listings as sold
- Users can edit, remove, or mark their own listings as sold via /mylistings

## Entry points

Every feature must be reachable from the bot's command/button surface (button-first; only /start and /help are slash commands).

- **/start** (command, actor: user, command: /start) — Open main menu, show onboarding, rules, and primary actions
  - outputs: Main menu with buttons: Create listing, Browse listings, My listings, Help
- **Create listing** (button, actor: user, callback: listing:create:start) — Begin guided create-listing flow (photos → metadata → confirm)
  - inputs: 1–6 photos (uploaded), title text, set/grade/condition selection, price amount and currency code, location text (optional), confirmation (yes/no)
  - outputs: Draft listing preview, published listing_id, admin new-listing notification
- **Browse listings** (button, actor: user, callback: listing:browse) — Open paginated marketplace feed with thumbnail previews and basic filters
  - inputs: optional filter: price range, optional filter: condition, page / pagination callback
  - outputs: List of listing preview cards (thumbnail, price, condition, short title), buttons per card: View details, Contact seller, Report
- **/mylistings** (command, actor: user, command: /mylistings) — Show the user's active and archived listings, allow edit/remove/mark sold
  - inputs: selection of a listing to manage, edit inputs (photos, title, price, etc.)
  - outputs: Updated listing or confirmation of removal/marked sold
- **/help** (command, actor: user, command: /help) — Show short help, rules, privacy summary and contact for admin
  - outputs: Help text and quick action buttons

## Flows

### Onboarding and rules
_Trigger:_ /start

1. Show short welcome and community rules
2. Prompt user to set display name and optional contact handle (skip allowed)
3. Show primary action buttons (Create listing, Browse listings, My listings, Help)

_Data touched:_ user_profile

### Create listing (guided)
_Trigger:_ button callback listing:create:start

1. 1) Ask user to upload 1–6 photos (validate file count & types)
2. 2) Collect title (force reply) and optional description
3. 3) Ask for set, optional grade, and condition (buttons or short text)
4. 4) Ask for price and currency code (slash/force-reply for typed price)
5. 5) Ask for optional location (typed, optional)
6. 6) Show preview with thumbnails and Confirm/Cancel buttons
7. 7) On Confirm: persist listing, notify admin via ADMIN_CHAT_ID, show success to user
8. 8) On Cancel or timeout: discard draft and inform user

_Data touched:_ user_profile, listing, photo

### Browse listings and filter
_Trigger:_ button callback listing:browse or /browse

1. Show first page of listing cards (default sort: newest)
2. Present inline filter buttons (price ranges, condition) and pagination controls
3. On card View details: show full listing with all photos and action buttons (Contact seller, Report)
4. On pagination or filter change: return next/filtered page

_Data touched:_ listing, photo

### Contact seller / private thread creation
_Trigger:_ user taps Contact seller on a listing

1. If no existing thread between that buyer and listing owner, create conversation_thread linked to listing
2. Notify seller with a message that buyer X started a thread and include buyer's display name/handle
3. Relay messages typed by buyer into the thread to the seller and seller replies back; both sides see history in-bot
4. Add buttons: Close thread, Report, Mark interested

_Data touched:_ conversation_thread, listing, user_profile

### Manage listings (/mylistings)
_Trigger:_ /mylistings

1. Show user's listings grouped by status (active, sold, removed)
2. For each listing allow Edit (photos/metadata/price), Mark as sold, Remove
3. Edits follow simplified guided steps similar to create flow; confirm changes and persist

_Data touched:_ listing, photo

### Report listing & moderation
_Trigger:_ Report button on listing or in-thread /report

1. Prompt reporter for optional reason/notes
2. Persist report and increment listing's reports_count
3. Send report notification to ADMIN_CHAT_ID with listing link and reporter info
4. Admin may remove listing or message user via owner controls

_Data touched:_ report, listing, user_profile

### Admin moderation actions
_Trigger:_ admin taps controls in admin notification or uses admin-only commands

1. Admin can Remove listing (set status: removed) or Mark as sold (status: sold)
2. Admin can send a direct message to a user via bot (message relayed as admin)
3. Admin actions are logged and confirmation sent to owner and optionally to affected user

_Data touched:_ listing, user_profile, report

## Owner-supplied settings

The OWNER provides these; they are collected in chat and injected into the environment at deploy. Read each one from the environment where it is used (`ctx.env.<KEY>` / `env.<KEY>` on Cloudflare Workers; `process.env.<KEY>` only as a Node/harness fallback — never the sole read). Do NOT invent your own way of learning the value, do NOT ask for it in a bot message, and do NOT hardcode a default.

- **ADMIN_CHAT_ID** — Chat id where new listing and report notifications are sent
  - this is the OWNER's own chat id; the platform already knows it. Read `ADMIN_CHAT_ID` via `ctx.env` (prefer toolkit `adminChatId` / `requireOwner`) — never ask a user, never treat whoever writes first as the admin, never invent claim-admin or open manage for everyone.
  - may be UNSET at runtime: the bot must still start, and the feature needing ADMIN_CHAT_ID must say so plainly instead of failing.

Your behavioral specs run WITHOUT these values, so no spec may depend on one.

## Data entities

Durable data (must survive a restart) uses the toolkit's persistent store, never in-memory maps.

An entity that merely NAMES an owner-supplied setting above (an admin chat, an API account) is not something to store or discover — read it from the environment.

- **user_profile** _(retention: persistent)_ — Basic user identity and optional contact handle.
  - fields: user_id (Telegram id), display_name, contact_handle (optional), created_at, last_active_at
- **listing** _(retention: persistent)_ — A marketplace listing representing a single card or lot.
  - fields: listing_id, owner_id, photo_ids (1..6), title, description, set, grade (optional), condition, price_amount, currency_code, location (optional), created_at, status (active|sold|removed), views_count, reports_count
- **photo** _(retention: persistent)_ — Stored photo asset uploaded by users (kept with listing).
  - fields: photo_id, telegram_file_id, stored_path, uploader_id, uploaded_at
- **conversation_thread** _(retention: persistent)_ — In-bot private message thread for negotiation between buyer and seller tied to a listing.
  - fields: thread_id, listing_id, buyer_id, seller_id, messages [{sender_id, text, attachments, timestamp}], created_at, last_activity_at, status (open|closed)
- **report** _(retention: persistent)_ — User report about a listing or thread for admin review.
  - fields: report_id, reporter_id, listing_id, reason_text (optional), created_at, status (open|reviewed|dismissed), admin_notes

## Integrations

- **Telegram** (required) — Bot API messaging, file uploads (photos), callback queries for buttons and inline keyboards
Call external APIs against their real contract (correct endpoints, ids, params); credentials from env. Do not fake responses.

## Owner controls

- Receive new-listing notification in ADMIN_CHAT_ID
- Receive listing reports in ADMIN_CHAT_ID
- Remove a listing (set status: removed)
- Mark a listing as sold (set status: sold)
- Message users directly via the bot (relay admin->user)
- View report details and reporter identity
- Configure or update the onboarding rules/guidelines text shown at /start

## Notifications

- Admin: new listing posted (with listing summary and owner link)
- Admin: listing reported (with reason and reporter id)
- Seller: when a buyer starts a conversation about their listing
- Buyer: confirmation when a conversation thread is created
- Seller/Buyer: admin removal or moderation action notifications affecting their listing
- User: confirmation messages on create/edit/remove actions

## Permissions & privacy

- Photos and conversation messages are stored by the bot and accessible to the bot owner/admin for moderation
- Phone numbers or external contact details are not exposed by the bot unless the user types them explicitly
- Users may delete their listings and conversation threads; deletion removes persisted listing and associated photos (unless admin retention policy overrides)
- Reporters' IDs are included in admin reports (to enable follow-up); reporters should be informed that reporting is not anonymous
- No external image analysis, AI, or third-party APIs are used — images remain private within bot storage and admin inbox

## Edge cases

- User uploads more than 6 photos — reject with a clear error and allow resubmission
- User abandons draft mid-flow — draft expires after timeout and user is notified
- Photo exceeds Telegram file size limits or is a non-image file — show error and request proper photo
- Two buyers simultaneously attempt to buy the same item — seller should mark sold; bot cannot guarantee first-come lock without additional locking logic
- ADMIN_CHAT_ID not configured — admin notifications fail; bot should log the error and inform owner on first use
- User blocks the bot or deletes their account — listings remain unless owner removes them; admin should be able to purge
- Message delivery failures (Telegram transient errors) — implement retry with backoff and surface failures to owner logs
- Users attempt to negotiate or request payment inside the bot — clarify in rules that payments/escrow happen outside the bot and bot does not handle funds

## Required tests

- Dialog-level acceptance test: full create-listing happy path including photo uploads (1..6), metadata, confirm, and admin notification
- Dialog-level test: abort/draft timeout during create-listing and subsequent retry
- Browse pagination and filter acceptance tests (multiple pages, filter by price/condition)
- Contact-seller flow test: thread creation, message relay both directions, and persistence
- Manage listings tests: edit metadata, change photos, mark sold, remove, and verify status changes
- Report flow test: submit report, ensure admin receives report and report record persists
- Admin actions test: remove listing and mark sold and verify notifications sent to affected users
- Photo validation tests: reject >6 photos, reject unsupported file types, handle file-size errors
- Concurrency test: simulate multiple buyers opening threads and confirm message routing and status consistency

## Assumptions

- Listing visibility is public to all bot users by default
- Currency is entered by users; display defaults to USD when unspecified
- Contact flow is an in-bot private thread that relays messages without exposing phone numbers
- No payments, escrow, AI image grading, or external valuation features are included
- Single ADMIN_CHAT_ID is sufficient for notifications; multiple admins are possible later
- Platform provides persistent storage for listings, photos, and messages (no external storage keys required now)
