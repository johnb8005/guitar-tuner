# Cadence Studio

A browser music composer that writes and performs complete pieces with Markov chains guided by music theory, plus a guitar tuner, chord library and the original Cadence progression generator.

## Composer (home page)

- **Harmony** — an order-2 Markov chain with back-off, trained per style on a corpus of idiomatic progressions (roman-numeral tokens, including borrowed chords and secondary dominants). Phrases start on the tonic, look ahead so sections land on half or authentic cadences, and several candidates are scored by the chain's likelihood before one is chosen.
- **Melody** — a rhythm chain over beat-cells plus an interval chain learned from public-domain folk tunes, reshaped by theory: chord tones on strong beats, range gravity, gap-fill after leaps, tendency tones, cadence targets, motif repetition and sequences.
- **Form & arrangement** — A / A′ / B sections with an energy curve; voice-led keys and pads, style-specific bass (walking, Alberti, octave, lo-fi), arpeggios and drums with fills, swing and humanisation.
- **Six styles** — Pop, Lo-fi, Jazz, Cinematic, Classical, Synthwave; any key, nine scales/modes, 8/16/32 bars, triads/7ths/9ths, a creativity (temperature) control.
- **Sound** — 20+ synth voices (FM electric piano and bells, Karplus–Strong strings, supersaw and tape pads, analog basses, bowed strings…), five synthesised drum kits, and sampled instruments streamed on first play (Salamander Grand Piano, FluidR3 GM vibraphone, upright and finger bass, strings, flute, violin, harp, marimba, choir, trumpet) with synth fallback. Mixer with mute/solo, reverb, ping-pong echo, glue compression and limiting.
- **Interaction** — click a chord to see and pick Markov alternatives, re-roll any part, watch the chain's transition matrix light up while playing, click the score to play from a bar, share a link that reproduces the piece, export MIDI or WAV.

Composer code lives in `src/composer/` (`theory.ts`, `markov.ts`, `generate.ts`, `styles.ts`, `audio/`, `ui/`). Run `bun test` for the theory/generation tests.

Also included: a guitar tuner with pitch detection, a chord library, and **Cadence**, the original Markov chord progression generator.

[![Deploy to GitHub Pages](https://github.com/johnb8005/guitar-tuner/actions/workflows/deploy.yml/badge.svg)](https://github.com/johnb8005/guitar-tuner/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**Live demo:** https://johnb8005.github.io/guitar-tuner/

## Features

### Guitar Tuner

- **Realistic string sounds** - Karplus-Strong algorithm for authentic plucked string synthesis
- **Pitch detection** - Autocorrelation-based tuning with microphone input
- **Analog-style meter** - Circular gauge showing cents deviation
- **Waveform visualizer** - Real-time audio visualization
- **Multiple tunings:** Standard, Drop D, Open G, Ukulele, Bass, 5-String Bass

### Cadence - Chord Progression Generator

- **Markov chain progressions** - Genre-specific transition matrices for authentic chord sequences
- **7 modes** - Ionian, Dorian, Phrygian, Lydian, Mixolydian, Aeolian, Locrian
- **5 genres** - Pop, Jazz, Blues, Rock, Classical (each with unique harmonic tendencies)
- **Melody generation** - Markov-based melodies with stepwise motion and voice leading
- **Bass lines** - Pattern-based bass with walking bass, shuffle, and arpeggiated styles
- **Drum patterns** - Genre-appropriate beats (swing, shuffle, rock, etc.)
- **Multi-instrument playback** - Guitar, Piano, Strings, Hammond organ
- **Embellishments** - Automatic 7th chords and chord splits at phrase endings
- **Editable progressions** - Click any chord to swap it, split bars, add/remove bars

## Getting started

You need [Bun](https://bun.sh) 1.4.4 or newer.

```bash
bun install      # install dependencies
bun dev          # start the dev server with hot reloading
bun run build    # build the static site into dist/
bun check        # type check (replaces tsc)
bun fmt          # format the code (bun fmt --check to verify only)
```

The dev server runs at http://localhost:3000 (set `PORT` to change it). Microphone access for the tuner needs `localhost` or HTTPS.

To build for a sub-path, set `BASE_PATH`, for example `BASE_PATH=/guitar-tuner/ bun run build`. Without it the site is built for the domain root.

## Project structure

```
src/
  index.html          HTML entry point
  main.tsx            React entry: router and routes
  server.ts           Bun dev server (not used in production)
  index.css           Tailwind and global styles
  composer/           Markov composer: theory, chains, generation, audio engine, UI
  pages/              One component per route: Tuner, Chords, Cadence
  components/         Shared UI: Layout, Visualizer, BassTab
  lib/audio.ts        Web Audio synthesis (Karplus-Strong, piano, strings, organ, drums)
  data/               Chord shapes and the Markov models for progressions, melody and bass
build.ts              Production build (static site + 404.html SPA fallback)
```

## Deployment

Every push to `main` builds the site and publishes it to GitHub Pages with the workflow in [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml). Pull requests run `bun check`, `bun fmt --check` and the build, without deploying.

To enable it on a fork, open **Settings → Pages** and set **Source** to **GitHub Actions**. The workflow sets `BASE_PATH` to the repository name, so the site works at `https://<owner>.github.io/<repo>/`.

## Tech stack

- [Bun](https://bun.sh) for the dev server, bundler and package manager
- React 19 and React Router
- Tailwind CSS 4
- Web Audio API
- three.js for the visualizer

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
