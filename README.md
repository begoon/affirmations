# Affirmations bot

Personal Russian affirmations on Telegram Serverless: https://t.me/talking_brain_bot

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

`just list-users` prints a console table: ID, first name, last name, nick, email,
and last active (for example `1m`, `2h`, `3d`). Names are refreshed with `getChat`;
other saved profile fields come from processed Telegram updates. `-` means the
field or activity time is unavailable. Email and phone numbers are not normally
exposed in bot user profiles. Activity timestamps begin when profile recording
was added; historical visits cannot be reconstructed. Listing does not send
messages, change activity timestamps, or print personal affirmations.

The hidden `/users` command sends the same user fields to `OPERATOR_ID` in the
bot's private chat, split into Telegram-sized messages with a total count. It
refreshes names through `getChat` and falls back to saved profile fields when a
lookup fails. It does not change activity timestamps or pending chat input.
Other users' `/users` messages are silently ignored, including during editing
or support input. The command is deliberately absent from the public command
menu and user guide. No affirmation texts or support questions are included.

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
Pre-upgrade messages are matched to an unambiguous text during migration;
ambiguous or missing matches are refused. Delete confirmations target the text
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
