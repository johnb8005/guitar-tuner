import { useState, useRef, useCallback, useEffect } from "react";
import "./index.css";

type StringNote = {
  note: string;
  frequency: number;
  octave: number;
};

type Tuning = {
  name: string;
  icon: string;
  strings: StringNote[];
};

// Karplus-Strong algorithm for realistic plucked string synthesis
function createPluckedString(
  ctx: AudioContext,
  frequency: number,
  duration: number = 4
): { source: AudioBufferSourceNode; gainNode: GainNode } {
  const sampleRate = ctx.sampleRate;
  const bufferSize = Math.round(sampleRate / frequency);
  const outputSamples = Math.round(sampleRate * duration);

  const buffer = ctx.createBuffer(1, outputSamples, sampleRate);
  const output = buffer.getChannelData(0);

  const delayLine = new Float32Array(bufferSize);
  for (let i = 0; i < bufferSize; i++) {
    const noise = Math.random() * 2 - 1;
    const triangle = 1 - Math.abs((i / bufferSize) * 2 - 1);
    delayLine[i] = noise * 0.7 + triangle * 0.3;
  }

  let index = 0;
  const damping = 0.996;
  const smoothing = 0.5;

  for (let i = 0; i < outputSamples; i++) {
    output[i] = delayLine[index];
    const nextIndex = (index + 1) % bufferSize;
    const averaged = smoothing * delayLine[index] + (1 - smoothing) * delayLine[nextIndex];
    delayLine[index] = averaged * damping;
    index = nextIndex;
  }

  for (let i = 0; i < outputSamples; i++) {
    const t = i / sampleRate;
    const envelope = Math.exp(-t * 1.5);
    output[i] *= envelope;
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const bodyFilter = ctx.createBiquadFilter();
  bodyFilter.type = "peaking";
  bodyFilter.frequency.value = 200;
  bodyFilter.Q.value = 1;
  bodyFilter.gain.value = 3;

  const highShelf = ctx.createBiquadFilter();
  highShelf.type = "highshelf";
  highShelf.frequency.value = 4000;
  highShelf.gain.value = -3;

  const gainNode = ctx.createGain();
  gainNode.gain.value = 0.6;

  source.connect(bodyFilter);
  bodyFilter.connect(highShelf);
  highShelf.connect(gainNode);

  return { source, gainNode };
}

// Autocorrelation pitch detection algorithm
function detectPitch(buffer: Float32Array, sampleRate: number): number | null {
  const SIZE = buffer.length;
  const MAX_SAMPLES = Math.floor(SIZE / 2);

  let rms = 0;
  for (let i = 0; i < SIZE; i++) {
    rms += buffer[i] * buffer[i];
  }
  rms = Math.sqrt(rms / SIZE);
  if (rms < 0.01) return null;

  const correlations = new Float32Array(MAX_SAMPLES);
  for (let lag = 0; lag < MAX_SAMPLES; lag++) {
    let sum = 0;
    for (let i = 0; i < MAX_SAMPLES; i++) {
      sum += buffer[i] * buffer[i + lag];
    }
    correlations[lag] = sum;
  }

  let foundPeak = false;
  let peakLag = 0;
  let peakValue = 0;
  let lastCorr = correlations[0];
  let rising = false;

  for (let lag = 1; lag < MAX_SAMPLES; lag++) {
    const corr = correlations[lag];
    if (!rising && corr > lastCorr) rising = true;
    if (rising && corr > peakValue) {
      peakValue = corr;
      peakLag = lag;
      foundPeak = true;
    }
    if (rising && foundPeak && corr < peakValue * 0.9) break;
    lastCorr = corr;
  }

  if (!foundPeak || peakLag === 0) return null;

  const y1 = correlations[peakLag - 1] || 0;
  const y2 = correlations[peakLag];
  const y3 = correlations[peakLag + 1] || 0;
  const a = (y1 + y3 - 2 * y2) / 2;
  const b = (y3 - y1) / 2;
  let refinedLag = peakLag;
  if (a !== 0) refinedLag = peakLag - b / (2 * a);

  const frequency = sampleRate / refinedLag;
  if (frequency < 60 || frequency > 1500) return null;
  return frequency;
}

function frequencyToCents(detected: number, target: number): number {
  return 1200 * Math.log2(detected / target);
}

function findClosestString(
  frequency: number,
  strings: StringNote[]
): { string: StringNote; index: number; cents: number } | null {
  let closest: { string: StringNote; index: number; cents: number } | null = null;
  let minCents = Infinity;

  for (let i = 0; i < strings.length; i++) {
    const string = strings[i];
    const cents = Math.abs(frequencyToCents(frequency, string.frequency));
    if (cents < minCents) {
      minCents = cents;
      closest = { string, index: i, cents: frequencyToCents(frequency, string.frequency) };
    }
  }

  if (closest && Math.abs(closest.cents) < 5000) return closest;
  return null;
}

const tunings: Record<string, Tuning> = {
  guitar: {
    name: "Guitar (Standard)",
    icon: "🎸",
    strings: [
      { note: "E", frequency: 329.63, octave: 4 },
      { note: "B", frequency: 246.94, octave: 3 },
      { note: "G", frequency: 196.0, octave: 3 },
      { note: "D", frequency: 146.83, octave: 3 },
      { note: "A", frequency: 110.0, octave: 2 },
      { note: "E", frequency: 82.41, octave: 2 },
    ],
  },
  dropD: {
    name: "Guitar (Drop D)",
    icon: "🎸",
    strings: [
      { note: "E", frequency: 329.63, octave: 4 },
      { note: "B", frequency: 246.94, octave: 3 },
      { note: "G", frequency: 196.0, octave: 3 },
      { note: "D", frequency: 146.83, octave: 3 },
      { note: "A", frequency: 110.0, octave: 2 },
      { note: "D", frequency: 73.42, octave: 2 },
    ],
  },
  ukulele: {
    name: "Ukulele (Standard)",
    icon: "🪕",
    strings: [
      { note: "A", frequency: 440.0, octave: 4 },
      { note: "E", frequency: 329.63, octave: 4 },
      { note: "C", frequency: 261.63, octave: 4 },
      { note: "G", frequency: 392.0, octave: 4 },
    ],
  },
  bass: {
    name: "Bass (Standard)",
    icon: "🎸",
    strings: [
      { note: "G", frequency: 98.0, octave: 2 },
      { note: "D", frequency: 73.42, octave: 2 },
      { note: "A", frequency: 55.0, octave: 1 },
      { note: "E", frequency: 41.2, octave: 1 },
    ],
  },
  bass5: {
    name: "Bass (5-String)",
    icon: "🎸",
    strings: [
      { note: "G", frequency: 98.0, octave: 2 },
      { note: "D", frequency: 73.42, octave: 2 },
      { note: "A", frequency: 55.0, octave: 1 },
      { note: "E", frequency: 41.2, octave: 1 },
      { note: "B", frequency: 30.87, octave: 0 },
    ],
  },
  openG: {
    name: "Guitar (Open G)",
    icon: "🎸",
    strings: [
      { note: "D", frequency: 293.66, octave: 4 },
      { note: "B", frequency: 246.94, octave: 3 },
      { note: "G", frequency: 196.0, octave: 3 },
      { note: "D", frequency: 146.83, octave: 3 },
      { note: "G", frequency: 98.0, octave: 2 },
      { note: "D", frequency: 73.42, octave: 2 },
    ],
  },
};

const stringColorsRaw = [
  { gradient: "from-rose-500 to-pink-600", glow: "shadow-rose-500/50", bg: "bg-rose-500" },
  { gradient: "from-orange-500 to-amber-600", glow: "shadow-orange-500/50", bg: "bg-orange-500" },
  { gradient: "from-yellow-400 to-yellow-600", glow: "shadow-yellow-500/50", bg: "bg-yellow-500" },
  { gradient: "from-emerald-400 to-green-600", glow: "shadow-emerald-500/50", bg: "bg-emerald-500" },
  { gradient: "from-cyan-400 to-blue-600", glow: "shadow-cyan-500/50", bg: "bg-cyan-500" },
  { gradient: "from-violet-500 to-purple-600", glow: "shadow-violet-500/50", bg: "bg-violet-500" },
];

// Circular Gauge Component
function CircularGauge({ cents, isInTune }: { cents: number; isInTune: boolean }) {
  const clampedCents = Math.max(-50, Math.min(50, cents));
  const rotation = (clampedCents / 50) * 90; // -90 to +90 degrees

  return (
    <div className="relative w-64 h-40 mx-auto">
      {/* Gauge background arc */}
      <svg className="w-full h-full" viewBox="0 0 200 120">
        {/* Background arc */}
        <path
          d="M 20 100 A 80 80 0 0 1 180 100"
          fill="none"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth="12"
          strokeLinecap="round"
        />
        {/* Colored sections */}
        <path
          d="M 20 100 A 80 80 0 0 1 60 35"
          fill="none"
          stroke="rgba(251,146,60,0.4)"
          strokeWidth="12"
          strokeLinecap="round"
        />
        <path
          d="M 60 35 A 80 80 0 0 1 90 22"
          fill="none"
          stroke="rgba(250,204,21,0.4)"
          strokeWidth="12"
          strokeLinecap="round"
        />
        <path
          d="M 90 22 A 80 80 0 0 1 110 22"
          fill="none"
          stroke="rgba(74,222,128,0.6)"
          strokeWidth="12"
          strokeLinecap="round"
        />
        <path
          d="M 110 22 A 80 80 0 0 1 140 35"
          fill="none"
          stroke="rgba(250,204,21,0.4)"
          strokeWidth="12"
          strokeLinecap="round"
        />
        <path
          d="M 140 35 A 80 80 0 0 1 180 100"
          fill="none"
          stroke="rgba(251,146,60,0.4)"
          strokeWidth="12"
          strokeLinecap="round"
        />

        {/* Tick marks */}
        {[-50, -25, 0, 25, 50].map((tick) => {
          const angle = ((tick / 50) * 90 - 90) * (Math.PI / 180);
          const x1 = 100 + 65 * Math.cos(angle);
          const y1 = 100 + 65 * Math.sin(angle);
          const x2 = 100 + 75 * Math.cos(angle);
          const y2 = 100 + 75 * Math.sin(angle);
          return (
            <line
              key={tick}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={tick === 0 ? "rgba(74,222,128,0.8)" : "rgba(255,255,255,0.3)"}
              strokeWidth={tick === 0 ? 3 : 2}
            />
          );
        })}

        {/* Needle */}
        <g style={{ transform: `rotate(${rotation}deg)`, transformOrigin: "100px 100px" }}>
          {/* Glow effect */}
          <line
            x1="100"
            y1="100"
            x2="100"
            y2="30"
            stroke={isInTune ? "rgba(74,222,128,0.6)" : "rgba(255,255,255,0.3)"}
            strokeWidth="8"
            strokeLinecap="round"
            style={{ filter: "blur(4px)" }}
          />
          {/* Main needle */}
          <line
            x1="100"
            y1="100"
            x2="100"
            y2="35"
            stroke={isInTune ? "#4ade80" : "#ffffff"}
            strokeWidth="3"
            strokeLinecap="round"
          />
          {/* Center circle */}
          <circle
            cx="100"
            cy="100"
            r="8"
            fill={isInTune ? "#4ade80" : "#ffffff"}
            style={{ filter: isInTune ? "drop-shadow(0 0 8px rgba(74,222,128,0.8))" : undefined }}
          />
        </g>
      </svg>

      {/* Labels */}
      <div className="absolute bottom-0 left-0 right-0 flex justify-between px-4 text-xs text-zinc-500">
        <span>-50¢</span>
        <span className="text-green-400">0</span>
        <span>+50¢</span>
      </div>
    </div>
  );
}

// Waveform visualizer
function WaveformVisualizer({ analyser }: { analyser: AnalyserNode | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();

  useEffect(() => {
    if (!analyser || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const bufferLength = analyser.fftSize;
    const dataArray = new Float32Array(bufferLength);

    const draw = () => {
      analyser.getFloatTimeDomainData(dataArray);

      ctx.fillStyle = "rgba(0, 0, 0, 0.1)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(251, 191, 36, 0.8)";
      ctx.shadowColor = "rgba(251, 191, 36, 0.5)";
      ctx.shadowBlur = 10;

      ctx.beginPath();

      const sliceWidth = canvas.width / 128;
      let x = 0;

      for (let i = 0; i < 128; i++) {
        const v = dataArray[i * 4] * 2;
        const y = (v + 1) / 2 * canvas.height;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }

        x += sliceWidth;
      }

      ctx.stroke();
      ctx.shadowBlur = 0;

      animationRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [analyser]);

  return (
    <canvas
      ref={canvasRef}
      width={400}
      height={60}
      className="w-full h-12 rounded-lg opacity-80"
    />
  );
}

export function App() {
  const [selectedTuning, setSelectedTuning] = useState<string>("guitar");
  const [playingString, setPlayingString] = useState<number | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [detectedFrequency, setDetectedFrequency] = useState<number | null>(null);
  const [detectedNote, setDetectedNote] = useState<{
    string: StringNote;
    index: number;
    cents: number;
  } | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const tuning = tunings[selectedTuning];

  const playNote = useCallback((frequency: number, stringIndex: number) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (sourceRef.current) {
      try { sourceRef.current.stop(); } catch (e) {}
      sourceRef.current = null;
    }
    if (!audioContextRef.current) audioContextRef.current = new AudioContext();
    const ctx = audioContextRef.current;
    if (ctx.state === "suspended") ctx.resume();

    const duration = 4;
    const { source, gainNode } = createPluckedString(ctx, frequency, duration);
    gainNode.connect(ctx.destination);
    source.start(ctx.currentTime);
    sourceRef.current = source;
    gainNodeRef.current = gainNode;
    setPlayingString(stringIndex);

    timeoutRef.current = setTimeout(() => {
      setPlayingString(null);
      sourceRef.current = null;
    }, duration * 1000);
  }, []);

  const stopNote = useCallback(() => {
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
    if (sourceRef.current && gainNodeRef.current && audioContextRef.current) {
      const ctx = audioContextRef.current;
      gainNodeRef.current.gain.setValueAtTime(gainNodeRef.current.gain.value, ctx.currentTime);
      gainNodeRef.current.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
      setTimeout(() => {
        if (sourceRef.current) { try { sourceRef.current.stop(); } catch (e) {} sourceRef.current = null; }
        setPlayingString(null);
      }, 100);
    }
  }, []);

  const startListening = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      if (!audioContextRef.current) audioContextRef.current = new AudioContext();
      const ctx = audioContextRef.current;
      if (ctx.state === "suspended") await ctx.resume();

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 4096;
      source.connect(analyser);

      mediaStreamRef.current = stream;
      analyserRef.current = analyser;
      setIsListening(true);

      const bufferLength = analyser.fftSize;
      const buffer = new Float32Array(bufferLength);

      const detect = () => {
        analyser.getFloatTimeDomainData(buffer);
        const frequency = detectPitch(buffer, ctx.sampleRate);
        if (frequency) {
          setDetectedFrequency(frequency);
          setDetectedNote(findClosestString(frequency, tuning.strings));
        } else {
          setDetectedFrequency(null);
          setDetectedNote(null);
        }
        animationFrameRef.current = requestAnimationFrame(detect);
      };
      detect();
    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert("Could not access microphone. Please allow microphone access.");
    }
  }, [tuning.strings]);

  const stopListening = useCallback(() => {
    if (animationFrameRef.current) { cancelAnimationFrame(animationFrameRef.current); animationFrameRef.current = null; }
    if (mediaStreamRef.current) { mediaStreamRef.current.getTracks().forEach((t) => t.stop()); mediaStreamRef.current = null; }
    analyserRef.current = null;
    setIsListening(false);
    setDetectedFrequency(null);
    setDetectedNote(null);
  }, []);

  useEffect(() => {
    if (isListening && detectedFrequency) {
      setDetectedNote(findClosestString(detectedFrequency, tuning.strings));
    }
  }, [selectedTuning, tuning.strings, isListening, detectedFrequency]);

  useEffect(() => {
    return () => { stopListening(); stopNote(); };
  }, [stopListening, stopNote]);

  const getTuningStatus = (cents: number) => {
    const absCents = Math.abs(cents);
    if (absCents <= 5) return { text: "Perfect!", color: "text-green-400", glow: "drop-shadow-[0_0_20px_rgba(74,222,128,0.8)]" };
    if (absCents <= 10) return { text: "Almost!", color: "text-lime-400", glow: "drop-shadow-[0_0_15px_rgba(163,230,53,0.6)]" };
    if (absCents <= 25) return { text: cents > 0 ? "Sharp" : "Flat", color: "text-yellow-400", glow: "" };
    return { text: cents > 0 ? "Too Sharp" : "Too Flat", color: "text-orange-400", glow: "" };
  };

  const isInTune = detectedNote ? Math.abs(detectedNote.cents) <= 5 : false;

  return (
    <div className="min-h-screen w-full relative overflow-hidden">
      {/* Animated background */}
      <div className="fixed inset-0 bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(251,191,36,0.1),transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(168,85,247,0.1),transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(34,197,94,0.05),transparent_50%)]" />
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen p-4 sm:p-6">
        <div className="w-full max-w-lg">

          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-5xl sm:text-6xl font-black mb-3 bg-gradient-to-r from-amber-300 via-orange-400 to-rose-500 bg-clip-text text-transparent drop-shadow-2xl tracking-tight">
              TUNER
            </h1>
            <p className="text-zinc-500 text-sm tracking-wide uppercase">
              {isListening ? "Listening..." : "Tap to begin"}
            </p>
          </div>

          {/* Main Tuner Card */}
          <div className="backdrop-blur-xl bg-white/5 rounded-3xl border border-white/10 shadow-2xl overflow-hidden mb-6">

            {/* Tuning Display */}
            {isListening && (
              <div className="p-6 pb-4 border-b border-white/5">
                {detectedNote ? (
                  <div className="space-y-4">
                    {/* Note Display */}
                    <div className="text-center">
                      <div className={`inline-block transition-all duration-300 ${getTuningStatus(detectedNote.cents).glow}`}>
                        <span className={`text-8xl font-black ${getTuningStatus(detectedNote.cents).color} transition-colors`}>
                          {detectedNote.string.note}
                        </span>
                        <span className="text-3xl text-zinc-500 font-medium ml-1">{detectedNote.string.octave}</span>
                      </div>
                    </div>

                    {/* Circular Gauge */}
                    <CircularGauge cents={detectedNote.cents} isInTune={isInTune} />

                    {/* Status */}
                    <div className="text-center">
                      <p className={`text-2xl font-bold ${getTuningStatus(detectedNote.cents).color}`}>
                        {getTuningStatus(detectedNote.cents).text}
                      </p>
                      <p className="text-zinc-500 text-sm mt-1">
                        {detectedFrequency?.toFixed(1)} Hz
                        <span className="mx-2 opacity-50">→</span>
                        {detectedNote.string.frequency.toFixed(1)} Hz
                        <span className="ml-2 opacity-70">
                          ({detectedNote.cents > 0 ? "+" : ""}{detectedNote.cents.toFixed(0)}¢)
                        </span>
                      </p>
                    </div>

                    {/* Waveform */}
                    <WaveformVisualizer analyser={analyserRef.current} />

                    {/* String Pills */}
                    <div className="flex justify-center gap-2 pt-2">
                      {tuning.strings.map((s, i) => {
                        const colors = stringColorsRaw[i % stringColorsRaw.length];
                        const isActive = i === detectedNote.index;
                        return (
                          <button
                            key={i}
                            onClick={() => playNote(s.frequency, i)}
                            className={`relative w-11 h-11 rounded-xl font-bold text-sm transition-all duration-300
                              ${isActive
                                ? `bg-gradient-to-br ${colors.gradient} scale-110 shadow-lg ${colors.glow}`
                                : "bg-zinc-800/50 text-zinc-500 hover:bg-zinc-700/50 hover:scale-105"
                              }`}
                          >
                            {s.note}
                            {isActive && (
                              <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-400 rounded-full animate-ping" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <div className="relative inline-block">
                      <div className="text-6xl animate-pulse">🎸</div>
                      <div className="absolute inset-0 bg-amber-500/20 rounded-full blur-2xl animate-pulse" />
                    </div>
                    <p className="text-zinc-400 mt-4 text-lg">Play a string...</p>
                    <p className="text-zinc-600 text-sm mt-1">Waiting for input</p>

                    {/* Waveform even when no note */}
                    <div className="mt-6">
                      <WaveformVisualizer analyser={analyserRef.current} />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Listen Button */}
            <div className="p-4">
              <button
                onClick={isListening ? stopListening : startListening}
                className={`w-full py-5 rounded-2xl font-bold text-lg transition-all duration-500 relative overflow-hidden group
                  ${isListening
                    ? "bg-gradient-to-r from-green-600 to-emerald-600"
                    : "bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500"
                  }`}
              >
                <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                <span className="relative flex items-center justify-center gap-3">
                  {isListening ? (
                    <>
                      <span className="relative flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-white" />
                      </span>
                      Stop Listening
                    </>
                  ) : (
                    <>
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                      </svg>
                      Start Tuning
                    </>
                  )}
                </span>
              </button>
            </div>

            {/* Tuning Selector */}
            <div className="px-4 pb-4">
              <select
                value={selectedTuning}
                onChange={(e) => { stopNote(); setSelectedTuning(e.target.value); }}
                className="w-full px-4 py-3 bg-zinc-800/50 border border-zinc-700/50 rounded-xl text-white
                         focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500/50
                         cursor-pointer appearance-none backdrop-blur-sm transition-all"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23a1a1aa'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "right 12px center",
                  backgroundSize: "20px",
                }}
              >
                {Object.entries(tunings).map(([key, value]) => (
                  <option key={key} value={key}>{value.icon} {value.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Strings */}
          <div className="backdrop-blur-xl bg-white/5 rounded-3xl border border-white/10 shadow-2xl p-4 overflow-hidden">
            {/* Guitar Head */}
            <div className="flex items-center justify-center mb-4">
              <div className="h-3 w-32 bg-gradient-to-b from-zinc-600 to-zinc-800 rounded-full shadow-inner" />
            </div>

            {/* Strings */}
            <div className="space-y-2">
              {tuning.strings.map((string, index) => {
                const isPlaying = playingString === index;
                const isDetected = isListening && detectedNote?.index === index;
                const isActive = isPlaying || isDetected;
                const colors = stringColorsRaw[index % stringColorsRaw.length];
                const thickness = 2 + index * 0.5;

                return (
                  <button
                    key={`${selectedTuning}-${index}`}
                    onClick={() => playNote(string.frequency, index)}
                    className={`group w-full flex items-center gap-4 p-3 rounded-2xl transition-all duration-300
                      ${isActive ? "bg-white/10 scale-[1.02]" : "hover:bg-white/5"}`}
                  >
                    {/* Note Badge */}
                    <div className={`relative w-14 h-14 rounded-2xl flex items-center justify-center font-black text-xl
                      transition-all duration-300
                      ${isActive
                        ? `bg-gradient-to-br ${colors.gradient} shadow-xl ${colors.glow} scale-110`
                        : `bg-zinc-800/80 group-hover:bg-zinc-700/80`}`}
                    >
                      {string.note}
                      <sub className="text-xs opacity-60 ml-0.5">{string.octave}</sub>
                      {isActive && (
                        <div className="absolute inset-0 rounded-2xl animate-ping bg-white/20" style={{ animationDuration: "1s" }} />
                      )}
                    </div>

                    {/* String Line */}
                    <div className="flex-1 relative h-10 flex items-center">
                      {/* String shadow */}
                      <div
                        className="absolute inset-x-0 bg-black/40 rounded-full blur-sm"
                        style={{ height: thickness + 2, top: "50%", transform: "translateY(-50%)" }}
                      />
                      {/* Main string */}
                      <div
                        className={`relative w-full rounded-full transition-all duration-300
                          ${isActive
                            ? `bg-gradient-to-r ${colors.gradient} shadow-lg ${colors.glow}`
                            : "bg-gradient-to-r from-zinc-400 via-zinc-300 to-zinc-400"}`}
                        style={{ height: thickness }}
                      />
                      {/* Vibration effect */}
                      {isActive && (
                        <>
                          <div
                            className={`absolute inset-x-0 rounded-full ${colors.bg} opacity-60 animate-[vibrate_50ms_ease-in-out_infinite]`}
                            style={{ height: thickness * 0.5, top: "40%" }}
                          />
                          <div
                            className={`absolute inset-x-0 rounded-full ${colors.bg} opacity-40 animate-[vibrate_50ms_ease-in-out_infinite_25ms]`}
                            style={{ height: thickness * 0.5, top: "60%" }}
                          />
                        </>
                      )}
                    </div>

                    {/* Frequency */}
                    <div className="w-20 text-right">
                      <span className={`text-sm font-mono transition-all duration-300
                        ${isActive ? "text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]" : "text-zinc-500 group-hover:text-zinc-400"}`}>
                        {string.frequency.toFixed(0)}
                        <span className="text-xs ml-0.5 opacity-60">Hz</span>
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Bridge */}
            <div className="mt-4 flex justify-center">
              <div className="h-4 w-40 bg-gradient-to-b from-amber-700 to-amber-900 rounded-b-lg shadow-inner" />
            </div>
          </div>

          {/* Footer */}
          <p className="text-center text-zinc-600 text-xs mt-6 tracking-wide">
            {isListening ? "Play one string at a time for best accuracy" : "Click a string or start tuning"}
          </p>
        </div>
      </div>
    </div>
  );
}

export default App;
