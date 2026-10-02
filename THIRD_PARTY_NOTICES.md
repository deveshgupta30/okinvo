# Third-party notices

okinvo bundles the following works whose licences ask for attribution. Package dependencies and
their licences are listed by `pnpm licenses list` and in `docs/licenses.md`.

## EFF Short Wordlist #1

`src/lib/security/eff-short-wordlist.ts` is the Electronic Frontier Foundation's "EFF Short
Wordlist #1" (1 296 words), used for generated passphrases.

- Source: https://www.eff.org/files/2016/09/08/eff_short_wordlist_1.txt (see
  https://www.eff.org/dice)
- Copyright © Electronic Frontier Foundation
- Licence: Creative Commons Attribution 3.0 Unported (CC BY 3.0),
  https://creativecommons.org/licenses/by/3.0/
- Changes: the dice numbers were dropped; the words are unchanged.

## Google Fonts (document font catalogue)

`public/fonts/` holds the latin subsets of 100 families vendored from their Fontsource packages
(`src/lib/documents/fonts/catalog.ts` lists each family, package and licence). All are under the
SIL Open Font License 1.1 except Roboto Slab (Apache License 2.0). Licence texts ship with each
`@fontsource/<family>` package.
