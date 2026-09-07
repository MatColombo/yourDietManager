# Phase 4 Production Review — rc.24 Browser Context Hotfix Report

## Finding
The rc.24 browser harness assumed every recipe detail exposes a visible `Edit` link. Production-review detail intentionally suppresses that link for the exact frozen base RecipeVersion and exposes the Human Review panel instead. The editor route itself remains valid and saving it creates a new user-owned version rather than mutating the frozen review version.

## Fix
The browser acceptance is now channel-aware:

- normal catalog detail must expose and click `Edit`;
- frozen production-review detail must expose the Human Review panel and review dashboard link and must not expose a visible `Edit` action;
- both paths still exercise `/recipes/:id/edit` and require the route-independent recipe editor to render;
- no production corpus, publication data, or human-review decisions are modified.

This reconciles Pass D edit/versioning coverage with the frozen review contract instead of weakening either invariant.
