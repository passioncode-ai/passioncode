Contract: brand-contract v1

# Scoped launcher copy pack

Sources:
  ui: bin/passioncode.js lib/launcher.js plugin/passioncode/hooks/session-start.js plugin/passioncode/hooks/update-check.js

This draft records command diagnostics and update notifications, extending the
status correction in issue #19. It does not claim approval of a wider brand.
The existing English CLI is the source for the inferred voice. See
[voice](voice.md), [terms](terminology.md), [facts](facts.md),
[channel](channels.md), and [strings](strings.md).

Validation uses super-ux's `scripts/brand_lint.py docs/brand`; the validator is an
external contributor tool, not a launcher runtime dependency.
