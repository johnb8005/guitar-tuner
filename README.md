# Guitar Tuner & Cadence

A web-based guitar tuner with pitch detection, plus **Cadence** - a Markov chain chord progression generator with melody, bass, and drums.

**Live demo:** https://deploy.nexys.io/guitar-tuner

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

## Development

```bash
# Install dependencies
bun install

# Start dev server
bun dev

# Build for production
bun run build
```

## Tech Stack

- Bun
- React 19
- Tailwind CSS 4
- Web Audio API
