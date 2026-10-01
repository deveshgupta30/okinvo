---
version: alpha
name: Linear-design-analysis-light
description: "Inverse light theme for okinvo. Same token names as DESIGN.md; only colour values differ. White canvas, grey surface ladder that gets darker as it lifts, pure-black ink, lavender accent unchanged, status colours darkened to pass WCAG AA on white."

colors:
  primary: "#5e6ad2"
  on-primary: "#ffffff"
  primary-hover: "#4f5bc4"
  primary-focus: "#5e69d1"
  ink: "#000000"
  ink-muted: "#3c3f44"
  ink-subtle: "#62666d"
  ink-tertiary: "#8a8f98"
  canvas: "#ffffff"
  surface-1: "#f5f6f6"
  surface-2: "#eeeff0"
  surface-3: "#ffffff"
  surface-4: "#e8e9eb"
  hairline: "#e6e7e9"
  hairline-strong: "#d5d7db"
  hairline-tertiary: "#c4c7cc"
  inverse-canvas: "#010102"
  inverse-surface-1: "#0f1011"
  inverse-surface-2: "#141516"
  inverse-ink: "#f7f8f8"
  brand-secure: "#7a7fad"
  semantic-success: "#1a7f37"
  semantic-overlay: "#000000"
  semantic-warning: "#c2410c"
  semantic-danger: "#b91c1c"
  semantic-danger-fill: "#c83a3a"
  link: "#4a55bd"
---

## Overview

Light counterpart of `DESIGN.md`. Only `colors` are declared; typography, rounding and spacing are inherited from the dark file by the token generator. Surfaces lift by getting *darker* (`surface-2 #eeeff0` for hovered rows), popovers (`surface-3`) float on white with a `hairline-strong` border instead of a shadow.

## Colors

- **Ink** (#000000) on canvas is 21:1; **Ink Subtle** moves to #62666d (5.77:1) because the dark file's #8a8f98 is only 3.25:1 on white.
- **Primary** stays #5e6ad2 (4.70:1 — buttons, focus, indicators); body-size links use **Link** #4a55bd (6.32:1).
- **Success / Warning / Danger** are #1a7f37 / #c2410c / #b91c1c — the dark values fail AA on white (3.17 / 2.23 / 3.48).
