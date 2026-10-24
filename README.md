# Affirmations bot

Personal Russian affirmations on Telegram Serverless: https://t.me/talking_brain_bot

The starter collection in [`data/common.txt`](data/common.txt) contains 380
original Russian reminders about calm, emotional steadiness, self-kindness,
boundaries, rest, and everyday support. Each line is a separate card. Keep the
language gentle and specific; avoid money, achievement, forced positivity,
promises of safety or recovery, and pressure to suppress feelings.

Editorial references: the [Self-Compassion Institute's practice collection](https://self-compassion.org/self-compassion-practices/)
and [York and Scarborough Teaching Hospitals' feelings and emotion resources](https://www.yorkhospitals.nhs.uk/our-services/organdonation/a-z-of-services/psychological-medicine1/psychological-medicine-self-help-resources/psychological-medicine-self-help-feelings-and-emotion/).
These informed the themes of self-kindness, grounding, and allowing difficult
feelings; the cards are original wording, not quotations or a treatment programme.

Requires Node.js 22.15+ (tests use module hooks), npm, and optionally `just`.
Create `.env` with `BOT_TOKEN`, `TGCLOUD_TOKEN`, and `OPERATOR_ID`.
The Serverless token comes from BotFather → Serverless → CLI Access.
Runtime uses Telegram's SDK; the bot API token is not embedded in deployed code.

```sh
just install
just test
just deploy
just status
just webhook
just export-data
just list-users
just seed              # uses OPERATOR_ID
just seed 123456789    # explicit Telegram user ID
just docs
just docs-deploy
```

`just deploy` builds, tests, uploads modules, applies safe migrations, synchronizes
the webhook, and registers commands. The deploy script recovers from the CLI
0.2.0 snapshot-writing bug by fetching the server snapshot after upload.

`just list-users` prints an aligned console table with ID, first name, last name,
username, email, last activity and collection status. It uses the same activity
markers (🟢 under 60m, 🟡 under 24h) and collection indicators as `/users`,
sorted by most recent activity with unknown activity last. Missing fields are
blank. Names are refreshed with `getChat`; unavailable profiles fall back to
saved fields. Collection indicators compare against `data/common.txt`. Email
and phone numbers are not normally exposed in bot user profiles. Activity
timestamps begin when profile recording was added; historical visits cannot
be reconstructed. Listing does not send messages, change activity timestamps,
or print personal affirmations. Terminal escape sequences are stripped.

The hidden `/users` command sends the same user fields to `OPERATOR_ID` in the
bot's private chat, one line per user, sorted by latest activity (unknown last),
split into Telegram-sized messages with a total count. Activity under 60 minutes
is marked 🟢; activity from 1 to 24 hours is marked 🟡; older activity is plain.
Missing fields (including unknown activity) and their separators are omitted.
Rows omit ID, email and activity labels and use no bold formatting. It
refreshes names through `getChat` and falls back to saved profile fields when a
lookup fails. It does not change activity timestamps or pending chat input.
Other users' `/users` messages are silently ignored, including during editing
or support input. The command is deliberately absent from the public command
menu and user guide. No affirmation texts or support questions are included.
Each row also shows the current collection: 📦 matches the starter texts,
✍️ N counts personal texts (including extra duplicate copies), ✂️ contains only
a reduced starter set (including an empty collection), and 🌱 is awaiting Start
(including after reset or import). Comparison ignores order and favourites and
uses the current common seed; it does not reconstruct editing history or
distinguish edits from additions. Imported texts count as personal after Start.

`just export-data` saves a version-2 recovery snapshot to
`exports/snapshot-*.json`. It includes:

- Every complete user database row (`id`, `revision`, `data`), including texts,
  favourites, permanent text IDs, conversation state and captured timestamps.
- A `user` object on each row containing available Telegram User fields and the
  full fresh `getChat` result under `user.chat`. Lookup failures are recorded
  in `user.chat_lookup_error`; the saved profile is still retained.
- All support-routing and reply-deduplication records, the deployed database
  schema, deployment revision, public app ID, and export start/end times.

The snapshot preserves raw database rows for recovery, with profile enrichment
kept outside `data`. It contains private data and is git-ignored; directory mode
is 0700 and file mode is 0600. The export is a paginated live read, not an atomic
point-in-time snapshot: concurrent writes can span different moments. Source
code, credentials and Telegram chat history are not included. A restore command
is not implemented yet. `profile_first_seen_at` (stored as `profileFirstSeenAt`)
is when profile recording began, not a historical registration date.

Administrative modules run through the CLI's authenticated management API and
are never deployed as public endpoints. The CLI version is pinned because
these routines use its internal API client.

Edit UI strings in `lang.json`, with Russian as the fallback. Each nonempty line
in `data/common.txt` is one initial affirmation. Every new user and every reset
uses this common seed. Personal files are never bundled or deployed.

`just seed ID` explicitly replaces that user's collection with
`data/user_ID.txt`. Omit ID to use `OPERATOR_ID` from `.env`. The input must be a
nonempty file containing one text per line, up to 4000 characters each. It is
validated before any remote changes. Order and duplicate lines are preserved.
The command saves the previous database row in a private, git-ignored backup,
clears favourites and pending input, invalidates old text buttons, and returns
the account to welcome. Profile fields and update deduplication are preserved.
The user sends `/start` and taps «Начать» to use the imported texts. A later
`/reset` restores common texts, not the imported file. Seeding also supports a
previously unregistered ID; it does not send any Telegram messages. Concurrent
account changes abort the replacement rather than overwriting newer data.
Personal files remain git-ignored. Normal builds do not read them.

Use «♡» to save a text and «❤️» to remove it.
`/favorites` browses only personal favourites; «Все тексты» or `/start` returns
to the full collection. Editing preserves a favourite; reset/manual seeding clears it.
Existing users acquire an empty favourites list without losing their texts.
Favourites are included in the user data export. The last button on the second
row, «🗑», asks for confirmation before deleting the current text from the
personal collection and favourites. Deleting the last text leaves an empty
collection with a «➕» button; it does not automatically restore seeds.

The welcome message includes the logo hosted at `docs/assets/bot-logo.png`,
with its caption and Start button. It appears while `new=true`, including after
reset. If photo delivery fails, the same welcome is sent as text. Publish the
asset with GitHub Pages before deploying a change to its URL.

Users own independent copies. Welcome → Start → main; main → edit/create →
text → main. Help → question → Continue → main. Reset requires confirmation,
clears texts and state, and restores the common seed only after Start.
`/start` exits an input mode. Text buttons carry permanent per-user IDs, so
buttons on older messages still target their original texts after edits and
deletions elsewhere in the collection. Reset/manual seeding invalidates those IDs.
Legacy callback formats and missing text IDs are refused; send `/start` to
get current buttons. Delete confirmations target the text
ID; reset confirmations remain tied to the current revision. Conditional
database updates prevent concurrent changes from overwriting one another. Duplicate update IDs are ignored. Failed operator delivery restores
help input mode. State writes and Telegram message delivery are not one atomic
transaction: if sending a response fails after saving, `/start` recovers the
view. Support questions arrive as distinct notifications in the operator’s private
chat. Use Telegram Reply on a new notification to send a text answer privately
to its sender. Replies leave affirmation state unchanged. Old notifications
created before this feature cannot be answered. Failed delivery is reported to
the operator; send a new reply to retry. Notification routing and reply
deduplication are stored in separate database tables.

`docs/` is the source for the Russian guide at https://demin.ws/affirmations/.
GitHub Pages serves `docs/` from `main` in this public repository,
`begoon/affirmations`. `just docs` previews it at http://localhost:8080.
Commit guide changes on `main`, then run `just docs-deploy` to push them and
trigger GitHub Pages. This pushes all pending commits on `main`.
No separate publishing repository, `gh-pages` branch, or redirect is needed.

## Mini App

`/view` sends a Mini App launch button and preserves pending chat input. The
welcome message describes both chat and Mini App modes. `miniapp/` is deployed
as static files by Telegram Serverless alongside `endpoints/affirmations`.
The build derives the public app URL from the app ID in `TGCLOUD_TOKEN`; no token
is included in the front-end or generated runtime content.

The Russian UI shows one random flashcard from all texts or favourites. Next
chooses another text without an immediate repeat when alternatives exist.
Favourite changes and edits keep the current card; deletion or removing a card
from the favourites filter selects another eligible card. Editing and confirmed
deletion remain available on each card. Telegram supplies themes and verified init data
through `Telegram.WebApp.Serverless.call`; the endpoint only uses the verified
caller ID. On supported iOS/Android Telegram clients, users can add a home-screen
icon. New/reset users must tap Start in chat first; creation remains in chat.

Both interfaces share permanent text IDs and revision-conditional writes. Stale
Mini App writes fail with a refresh prompt. Deletion adjusts chat selection and
favourite indexes; deleting or editing the text awaiting a chat edit cancels that
pending edit. Other pending chat input is preserved. Opening the app does not
send chat messages. Existing chat messages are not rewritten after app changes.
The endpoint returns only text IDs, texts, favourite flags, onboarding status
and revision, never support or profile data.

Run `just test`, then `just deploy` to publish the bot, Mini App, and `/view`
command. Publish the updated `docs/index.html` through the existing GitHub Pages
workflow (`just docs-deploy` after committing the guide on main).

## Database structure

The Telegram Serverless database schema is defined in
[`tgcloud/schema.js`](tgcloud/schema.js). It has three tables. Affirmations,
favourites and conversation state are stored together in each user's JSON
record; there is no separate affirmations table. Chat and Mini App operations
use the same records.

### `users`

| Column | SDK type | Constraints | Purpose |
| --- | --- | --- | --- |
| `id` | `integer` | Primary key | Telegram user ID; also the user's private chat ID. |
| `revision` | `integer` | Not null, default `0` | Version used for conditional updates to prevent concurrent writes from overwriting each other. |
| `data` | `json` | Not null | User's collection, chat state and saved Telegram profile. |

The `data` object has the following application-managed fields. JSON field
names use camelCase and are not separate database columns.

| Field | Type | Meaning |
| --- | --- | --- |
| `language` | string | UI language, initially `ru`; unsupported values fall back to Russian. |
| `new` | boolean | Awaiting the Start button, including after reset or manual import. |
| `mode` | string | Chat state: `welcome`, `main`, `edit`, `create`, `delete`, `reset`, `help` or `helpSent`. |
| `texts` | string array | Ordered personal collection. Duplicate texts are allowed. Input must be nonempty and at most 4000 JavaScript UTF-16 code units per text. |
| `textIds` | string array, optional until initialised | Permanent per-user IDs parallel to `texts`, used by chat buttons and Mini App mutations. |
| `current` | integer | Zero-based index of the chat's selected text, or `-1` when none is selected. The Mini App's current card is browser state. |
| `favorites` | integer array | Zero-based indexes into `texts`, not text IDs. Defaults to an empty array for older records. |
| `view` | string | Chat filter: `all` or `favorites`; defaults to `all` for older records. |
| `lastUpdate` | integer | Last claimed Telegram update ID for normal chat processing; initially `-1`. |
| `telegramUser` | object, optional | Latest Telegram `User` object captured from a processed chat update, including available identity fields. |
| `profileFirstSeenAt` | ISO timestamp string, optional | First time profile recording observed the user, not necessarily their registration date. |
| `profileLastSeenAt` | ISO timestamp string, optional | Last recorded chat interaction or successful Mini App mutation. |

`textIds[i]` identifies `texts[i]`. IDs are derived from database revisions and
survive edits and index shifts. Deletion removes both array entries and adjusts
favourite indexes and chat selection. Reset and manual import invalidate old
IDs; new IDs are allocated when needed. Updating a collection increments
`revision` and requires the previously read revision to still match.

The JSON record stores current state, not an edit/add/delete history. The
📦 / ✍️ / ✂️ / 🌱 collection indicators are computed when listing users by
comparing `texts` with the common seed; they are not stored fields. Read-only
Mini App browsing and administrative user listings do not update activity.
The full `getChat` results used by listings and exports are not persisted back
to `data`; export enrichment is stored separately under the exported `user` key.

### `support_messages`

| Column | SDK property | SDK type | Constraints | Purpose |
| --- | --- | --- | --- | --- |
| `id` | `id` | `integer` | Primary key | Message ID of a support notification sent to the operator. |
| `operator_id` | `operatorId` | `integer` | Not null | Telegram ID of the operator who received it. |
| `user_id` | `userId` | `integer` | Not null | Telegram ID of the user to whom an operator reply should be delivered. |

This is a routing table, not a transcript. Each notification chunk has its own
row. A Telegram reply to that notification is looked up using its message ID
and the configured operator ID. `user_id` logically refers to `users.id`, but
no database foreign key is declared.

### `support_replies`

| Column | SDK type | Constraints | Purpose |
| --- | --- | --- | --- |
| `id` | `integer` | Primary key | Incoming operator reply's Telegram message ID, used to deduplicate delivery attempts. |

The reply ID is inserted before sending the answer. A recorded ID means the
attempt was claimed, not that delivery succeeded. Failed delivery requires a
new reply message to retry. Support message IDs are scoped to the configured
operator's private chat; these tables assume a single operator and do not
store question or answer bodies.

There are no declared foreign keys or secondary indexes. Application code
maintains relationships and JSON invariants. Deploying code and applying
schema migrations are separate operations; `just deploy` applies safe migrations.
`just export-data` includes all three tables and the deployed schema for recovery.

## Callback and reply IDs

Inline buttons are encoded and resolved in
[`tgcloud/lib/buttons.js`](tgcloud/lib/buttons.js), then processed by
[`tgcloud/lib/bot.js`](tgcloud/lib/bot.js). Several different IDs are involved:

| Value | Purpose |
| --- | --- |
| Button `callback_data` | Application payload describing the action, target text and browsing filter. |
| `data.textIds[i]` | Stable identifier of `data.texts[i]` within one user's collection. |
| Callback query `id` | Telegram's ID for a particular button press; passed to `answerCallbackQuery` to acknowledge it. It is not a text ID or database key. |
| Telegram `update_id` | Compared with `data.lastUpdate` to ignore duplicate or older updates. |
| Telegram `message_id` | Identifies a message within its chat. Used for support reply routing, not for locating an affirmation. |
| `users.revision` | Database version used for conditional writes and reset-confirmation expiry. |

### Button payloads

Ordinary buttons use `a:<action>:<textId>:<view>`, where `view` is `a` for all
texts or `f` for favourites. Buttons that do not target a specific text use `-`
instead of a text ID.

| Example | Meaning |
| --- | --- |
| `a:favorite:a.0:a` | Toggle the favourite status of text `a.0`, from an all-texts message. |
| `a:edit:a.0:f` | Edit text `a.0`, from a favourites message. |
| `a:delete:a.0:a` | Ask for confirmation to delete text `a.0`. |
| `a:confirmDelete:a.0:a` | Confirm deletion of that same text. |
| `a:more:-:f` | Pick another text from favourites. |
| `a:create:-:a` | Enter new-text input mode. |
| `r:12` | Confirm reset only while the stored revision is `12` and chat mode is `reset`. |

Targeted actions are `favorite`, `unfavorite`, `edit`, `delete` and
`confirmDelete`. Navigation actions are `more`, `create`, `all`, `continue`,
`cancel` and `start`. Both heart actions toggle the current saved status, so a
heart button on an old message still works even if its displayed icon is stale.

Text IDs are strings, not array indexes. Initial allocation uses
`<revision in base 36>.<index in base 36>`: revision 10 and index 0 produce
`a.0`. A newly created text uses `<revision in base 36>.n`; for example, `b.n`
at revision 11. The ID stays unchanged when the text is edited or when another
text's deletion shifts its array index.

On a press, the handler loads the pressing user's record and resolves the text
ID against the **current** `textIds` array. For example, if `a.1` moves from
index 1 to index 0 after deletion, an old button containing `a.1` still targets
that text. If the ID no longer exists, the bot acknowledges the callback with
an unavailable-text message and does not apply the action. Unknown actions and
legacy payload formats are also rejected. Callbacks are accepted only from a
user in their own private bot chat.

Reset and manual seeding invalidate old text IDs. Reset confirmation is also
bound to an exact revision, so a later state change expires it. Delete
confirmation is bound to the text ID instead: it can still delete that text
after navigation or editing, provided the ID remains valid. It does not compare
the text's current contents with the original confirmation message.

After resolving a valid press, the handler acknowledges the callback, computes
the next state and saves it only if the database revision still matches the
one it read. The saved state advances `revision` and records `lastUpdate`.
If another operation wins the write, this handler stops without overwriting it.
Acknowledging a callback therefore does not itself mean the state was saved.
The bot sends a new response message after a successful write; it does not
rewrite the old message containing the pressed button.

### Support replies use message IDs

An operator's Telegram Reply is a message, not a callback query. Its
`reply_to_message.message_id` identifies the original support notification in
`support_messages`. That row supplies the destination `user_id`, and its
`operator_id` must match the configured operator. The incoming reply's own
`message_id` is claimed in `support_replies` before delivery to prevent another
attempt for the same reply. These IDs are scoped to the operator's chat and
are independent of affirmation IDs, callback payloads and user revisions.
