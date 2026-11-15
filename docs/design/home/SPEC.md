# Home: the app grid (2026-11-15)

The owner's words: "make each one good, why does Pages have colour and the others not, make it good".

## Rule zero: Mobbin, 2026-11-15

| Reference | What we take |
|---|---|
| [Lloyds, home cards](https://mobbin.com/screens/0d8ab5d2-658a-4da9-9b23-799e01cc9e63?utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp) | light cards, each with a tinted round icon badge in its own colour |
| [Brainly, home grid](https://mobbin.com/screens/07e5079c-e9f0-4996-8365-06b9d39e93a6?utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp) | two columns of soft cards, one colourful mark each, all at the same loudness |
| [Swiggy, service tiles](https://mobbin.com/screens/c3a89805-8f6e-450d-a06d-4f8e557d7e51?utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp) | two-column tiles with a small badge |
| [CapCut, tool grid](https://mobbin.com/screens/a95afadd-6f31-47fc-8d5b-107ac2b265fa?utm_source=claude-code&utm_medium=ai-assistant&utm_source_platform=mcp) | more columns on a wider screen |

## Decisions

- **One colour per app**, from the MultiMagic icon's own squares (`src/theme/appColors.ts`; IDENTITY §1: an app is the category here):

  | App | Colour |
  |---|---|
  | Pages | teal |
  | Notes | yellow (Keep's) |
  | Assistant | coral, its badge a coral → pink gradient |
  | Chats | pink |
  | Notifications | orange |
  | Calendar | blue |
  | Contacts | green |
  | SafeZone | purple |
  | Conversations | indigo |

  Indigo is the one colour not in the icon: nine apps, eight squares. Notes' and SafeZone's "+" buttons wear their app's colour.
- **Tile:** the colour faintly over the page (16 % in dark, 11 % in light) with a solid round badge and a dark glyph. Title and line stay in the page's ink. `appColors.test.ts` checks 4.5:1 for the text and 3:1 for the glyph in both schemes; the light tint was lowered from 16 % to 11 % when Chats' line measured 4.33:1.
- **Loudness:** no tile is filled louder than the others. Pages is no longer a filled teal card. The last app opened from Home gets a thin 2 dp ring in its colour (remembered on this phone only).
- **Grid:** 2 columns on a phone, 3 from 600 dp, 4 from 900 dp. The tiles all have the same width, so Conversations is a normal tile, not a lonely full-width card.
- **Motion:** each tile fades in, staggered by 40 ms. A press scales it to 0.97 with a light haptic.
