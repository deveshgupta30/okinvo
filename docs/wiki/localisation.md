---
title: Localisation
path: localisation
order: 17
description: 115 UI languages, document language, non-Latin scripts and right-to-left documents
---

# Localisation

## The UI

The app speaks 115 languages. Choose yours under Settings > Account > Language (grouped by
region, each named in itself); the choice follows your account, then a cookie, then the
browser's language, then English. `<html lang dir>` follows it, so right-to-left languages lay
the whole app out right to left.

English (US and UK) catalogues are hand-written; the others were machine-translated in batches
and say so in the picker. To improve one, edit `messages/<tag>.json` in the repository, keep the
placeholders intact, run `pnpm i18n:check` and open a pull request.

## Document language

Every invoice and credit note carries a **document language**, chosen in the builder. Its fixed
strings (labels, title, page footer, verification caption, watermarks) print from that
language's catalogue, template label overrides still winning; dates and amounts format in that
language, except that an issuer whose own locale is a regional variant keeps it (an `en-IN`
issuer printing in English keeps lakh grouping). The default comes from the client's preferred
document language, else the issuer profile's locale. A credit note copies its invoice's
language. Like everything else on an issued document it never changes afterwards.

## Scripts and fonts

Text in a non-Latin script prints from the matching Noto Sans family (Devanagari, Bengali,
Gurmukhi, Gujarati, Oriya, Tamil, Telugu, Kannada, Malayalam, Sinhala, Thai, Lao, Myanmar, Khmer,
Arabic, Hebrew, Syriac, Georgian, Armenian, Ethiopic, Greek, Cyrillic; Han, kana and hangul
from Noto Sans SC, TC, JP or KR chosen by the document language), run by run, so a Latin
template font and Devanagari labels share a page. Known limits: CJK prints in the regular
weight only, the amount in words stays English, and right-to-left documents right-align the
text columns and mirror the items table while mixed-direction lines keep logical order.

## Input

Every text field accepts standard keyboard characters only (letters, digits, common
punctuation, space, tab and newline); other characters are dropped as typed and rejected at
every server boundary. Non-Latin text on a document therefore comes from the document
language's catalogue (labels, titles, footers, watermarks), never from typed names.

Related: [Templates and fonts](templates-and-fonts.md), [Settings](settings.md#account).
