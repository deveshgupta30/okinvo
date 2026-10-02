---
version: alpha
name: Linear-design-analysis-light
description: "Inverse light theme for okinvo. Same token names as DESIGN.md; only colour values differ. White canvas, grey surface ladder that gets darker as it lifts, pure-black ink, pastel accents slightly deepened for white, status colours darkened to pass WCAG AA on white."

colors:
  primary: "#6cc994"
  on-primary: "#17191e"
  primary-hover: "#5fbf87"
  primary-focus: "#6cc994"
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
  brand-dot: "#87d9a8"
  accent-mint-primary: "#6cc994"
  accent-mint-on-primary: "#17191e"
  accent-mint-primary-hover: "#5fbf87"
  accent-mint-primary-focus: "#6cc994"
  accent-lavender-primary: "#a19ee8"
  accent-lavender-on-primary: "#17191e"
  accent-lavender-primary-hover: "#918de3"
  accent-lavender-primary-focus: "#a19ee8"
  accent-sky-primary: "#74b4ea"
  accent-sky-on-primary: "#17191e"
  accent-sky-primary-hover: "#62a8e4"
  accent-sky-primary-focus: "#74b4ea"
  accent-peach-primary: "#eea581"
  accent-peach-on-primary: "#17191e"
  accent-peach-primary-hover: "#e9956c"
  accent-peach-primary-focus: "#eea581"
  accent-butter-primary: "#e8d06a"
  accent-butter-on-primary: "#17191e"
  accent-butter-primary-hover: "#e0c552"
  accent-butter-primary-focus: "#e8d06a"
  accent-rose-primary: "#ea8ea3"
  accent-rose-on-primary: "#17191e"
  accent-rose-primary-hover: "#e37b93"
  accent-rose-primary-focus: "#ea8ea3"
  accent-sage-primary: "#a3c48a"
  accent-sage-on-primary: "#17191e"
  accent-sage-primary-hover: "#93b878"
  accent-sage-primary-focus: "#a3c48a"
  accent-lilac-primary: "#c9a0e8"
  accent-lilac-on-primary: "#17191e"
  accent-lilac-primary-hover: "#bd8ee2"
  accent-lilac-primary-focus: "#c9a0e8"
---

## Overview

Light counterpart of `DESIGN.md`. Only `colors` are declared; typography, rounding and spacing are inherited from the dark file by the token generator. Surfaces lift by getting *darker* (`surface-2 #eeeff0` for hovered rows), popovers (`surface-3`) float on white with a `hairline-strong` border instead of a shadow.

## Colors

- **Ink** (#000000) on canvas is 21:1; **Ink Subtle** moves to #62666d (5.77:1) because the dark file's #8a8f98 is only 3.25:1 on white.
- **Primary** stays #5e6ad2 (4.70:1 — buttons, focus, indicators); body-size links use **Link** #4a55bd (6.32:1).
- **Success / Warning / Danger** are #1a7f37 / #c2410c / #b91c1c — the dark values fail AA on white (3.17 / 2.23 / 3.48).
