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

# Download all users, their texts and conversation state into exports/.
data-export: build
    npm run data-export

# Publish committed main changes; GitHub Pages serves docs/ from main.
docs-deploy:
    git push origin main

# Preview the GitHub Pages introduction.
docs:
    python3 -m http.server 8080 --directory docs
