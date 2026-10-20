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
just data-export
just docs
```

`just deploy` builds, tests, uploads modules, applies safe migrations, synchronizes
the webhook, and registers commands. The deploy script recovers from the CLI
0.2.0 snapshot-writing bug by fetching the server snapshot after upload.

`just data-export` saves every user record (ID, revision, language, onboarding
flag, mode, current text index, complete personal collection, last update ID)
to timestamped `exports/users-*.json`. Exports are git-ignored, with directory
mode 0700 and file mode 0600. Pagination uses user IDs; an export taken while
users are interacting is not a single point-in-time database snapshot.
Administrative modules run through the CLI's authenticated management API and
are never deployed as public endpoints. The CLI version is pinned because
these routines use its internal API client.

Edit UI strings in `lang.json`, with Russian as the fallback. Each nonempty line
in `data/common.txt` is one initial affirmation. User `<USER_ID>` gets
`data/user_<USER_ID>.txt` instead. Build converts these inputs to an ignored JS
module because Serverless supports JavaScript modules only.

Users own independent copies. Welcome → Start → main; main → edit/create →
text → main. Help → question → Continue → main. Reset requires confirmation,
clears texts and state, and restores the applicable seed only after Start.
`/start` exits an input mode. Old buttons carry a revision and are rejected;
conditional database updates prevent concurrent changes from overwriting one
another. Duplicate update IDs are ignored. Failed operator delivery restores
help input mode. State writes and Telegram message delivery are not one atomic
transaction: if sending a response fails after saving, `/start` recovers the
view. Operator replies are outside the current feature set.

`docs/index.html` is the Russian introduction served by GitHub Pages from
`main:/docs`. `just docs` previews it at http://localhost:8080.
