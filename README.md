# Chordscope

Drop a MIDI part exported from your DAW (Logic, Ableton and the like) and Chordscope names its chords and estimates thenkey. It shows the key and a table with each chord's notes and how it reads in each candidate key. Hover the key to see how sure the estimate is.

## Ableton Live

An Ableton Live extension reads a clip's notes directly, no export needed. Download [Chordscope.ablx](https://github.com/joshuathompsonlindley/chordscope/releases/latest/download/Chordscope.ablx) from the latest release and install it in Live (Developer Mode on, Settings → Extensions).

## Run it

```sh
npm install
npm run dev           # dev server
npm test              # unit, page and clip tests
npm run check         # type-check, lint, formatting and tests: run before committing
npm run build         # type-check, then build to dist/
npm run format        # rewrite files with Prettier
```
