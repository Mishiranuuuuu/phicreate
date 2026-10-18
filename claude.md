This file contains instructions for coding agents. Unless otherwise specified by the user, consider them default behavior.

## Project Overview

PhiCreate is a browser-based fan-made chart (level) maker for Phigros, the mobile rhythm game.

## Structure

```
src/
  components/ui/   Reusable, feature-agnostic primitives (Button, Modal, ...)
  features/        Self-contained feature modules (types, repo, store, components)
  pages/           Route-level screens that compose features
  lib/             Shared helpers (db, ids, files, time)
  styles/          Design tokens + global styles
```

## Code Style

When writing code:
- Keep code comments minimal, short, and brief.
- Keep the codebase organized, reusable, and intuitive.
- UI primitives never import features; features never import pages.
- Only `*Repo.ts` files touch `lib/db.ts`. Schema changes go through the `upgrade` callback in `lib/db.ts` (bump `DB_VERSION`).
- Style with CSS Modules and the variables in `styles/tokens.css` — no hard-coded colors.
- Import from `src` via the `@/` alias.

## Response Style

When responding to the user:
- Be concise and clear.
- Go step by step for instructions or step-wise tasks.
- Ask for clarification whenever an instruction is not clear.

## Verification

Run a build. Nothing more.

## Version Control

Do not automatically create a commit or pull request in the repository. Do not remind the user that the code is uncommitted.