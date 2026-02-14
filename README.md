# Guitar Tuner

A web-based guitar tuner with realistic string sounds and real-time pitch detection.

**Live demo:** https://deploy.nexys.io/guitar-tuner

## Features

- **Realistic string sounds** - Karplus-Strong algorithm for authentic plucked string synthesis
- **Pitch detection** - Autocorrelation-based tuning with microphone input
- **Analog-style meter** - Circular gauge showing cents deviation
- **Waveform visualizer** - Real-time audio visualization
- **Multiple tunings:**
  - Guitar (Standard)
  - Guitar (Drop D)
  - Guitar (Open G)
  - Ukulele (Standard)
  - Bass (Standard)
  - Bass (5-String)

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
