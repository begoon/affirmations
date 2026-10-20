# Show available routines.
default:
    @just --list

install:
    npm ci

build:
    npm run build

test:
    npm test

status:
    npm run cloud -- status

diff: build
    npm run cloud -- diff

deploy: test
    npm run deploy

webhook:
    npm run cloud -- webhook

# Save a recovery snapshot with all tables and available Telegram user details.
export-data: build
    npm run export-data

# Print a readable user table with relative last-active times.
list-users:
    node scripts/admin.mjs list-users

# Publish committed main changes; GitHub Pages serves docs/ from main.
docs-deploy:
    git push origin main

# Preview the GitHub Pages introduction.
docs:
    python3 -m http.server 8080 --directory docs

# Replace an account's texts from data/user_ID.txt; defaults to OPERATOR_ID.
[positional-arguments]
seed id='':
    node scripts/admin.mjs seed "$1"
