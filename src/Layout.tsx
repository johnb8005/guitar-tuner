import { NavLink, Outlet } from "react-router-dom";
import "./index.css";

const LINKS = [
  { to: "/", label: "Composer", end: true },
  { to: "/cadence", label: "Cadence" },
  { to: "/chords", label: "Chords" },
  { to: "/tuner", label: "Tuner" },
];

export function Layout() {
  return (
    <div className="relative min-h-screen w-full overflow-x-hidden">
      {/* Ambient background */}
      <div className="fixed inset-0 bg-zinc-950">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_20%_-10%,rgba(251,191,36,0.12),transparent)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_100%_100%,rgba(168,85,247,0.10),transparent)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_50%_40%_at_0%_100%,rgba(56,189,248,0.06),transparent)]" />
      </div>

      <nav className="fixed inset-x-0 top-0 z-50 border-b border-white/[0.07] bg-zinc-950/75 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-3 px-3 py-2.5 sm:px-5">
          <NavLink to="/" className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-amber-400 to-pink-500 text-zinc-950 shadow-lg shadow-amber-500/20">
              <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden>
                <path d="M9 18V6l11-2v12" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="6.5" cy="18" r="2.5" />
                <circle cx="17.5" cy="16" r="2.5" />
              </svg>
            </span>
            <span className="hidden text-base font-bold tracking-tight text-white sm:inline">
              Cadence <span className="font-normal text-zinc-400">Studio</span>
            </span>
          </NavLink>
          <div className="flex gap-0.5 rounded-xl bg-white/5 p-1 ring-1 ring-white/5">
            {LINKS.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                className={({ isActive }) =>
                  `rounded-lg px-2.5 py-1.5 text-xs font-medium transition sm:px-3 sm:text-sm ${
                    isActive ? "bg-white text-zinc-900 shadow" : "text-zinc-400 hover:bg-white/5 hover:text-white"
                  }`
                }
              >
                {l.label}
              </NavLink>
            ))}
          </div>
        </div>
      </nav>

      <div className="relative z-10 pt-14">
        <Outlet />
      </div>
    </div>
  );
}
