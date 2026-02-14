import { NavLink, Outlet } from "react-router-dom";
import "./index.css";

export function Layout() {
  return (
    <div className="min-h-screen w-full relative overflow-hidden">
      {/* Animated background */}
      <div className="fixed inset-0 bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(251,191,36,0.1),transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(168,85,247,0.1),transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(34,197,94,0.05),transparent_50%)]" />
      </div>

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl bg-zinc-900/80 border-b border-white/10">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl font-black bg-gradient-to-r from-amber-300 to-orange-500 bg-clip-text text-transparent">
            GUITAR
          </h1>
          <div className="flex gap-1 bg-zinc-800/50 rounded-xl p-1">
            <NavLink
              to="/"
              className={({ isActive }) =>
                `px-3 py-2 rounded-lg font-medium text-sm transition-all duration-300 ${
                  isActive
                    ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg"
                    : "text-zinc-400 hover:text-white hover:bg-white/5"
                }`
              }
            >
              Tuner
            </NavLink>
            <NavLink
              to="/chords"
              className={({ isActive }) =>
                `px-3 py-2 rounded-lg font-medium text-sm transition-all duration-300 ${
                  isActive
                    ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg"
                    : "text-zinc-400 hover:text-white hover:bg-white/5"
                }`
              }
            >
              Chords
            </NavLink>
            <NavLink
              to="/cadence"
              className={({ isActive }) =>
                `px-3 py-2 rounded-lg font-medium text-sm transition-all duration-300 ${
                  isActive
                    ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg"
                    : "text-zinc-400 hover:text-white hover:bg-white/5"
                }`
              }
            >
              Cadence
            </NavLink>
          </div>
        </div>
      </nav>

      {/* Content */}
      <div className="relative z-10 pt-16">
        <Outlet />
      </div>
    </div>
  );
}
