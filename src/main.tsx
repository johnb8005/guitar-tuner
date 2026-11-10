import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Tuner } from "./pages/Tuner";
import { Chords } from "./pages/Chords";
import { Cadence } from "./pages/Cadence";

// Injected by build.ts so the app works when hosted under a sub-path such as
// https://<user>.github.io/guitar-tuner/. Undefined in the dev server.
declare const __BASE_PATH__: string | undefined;
const basename = typeof __BASE_PATH__ !== "undefined" ? __BASE_PATH__ : "/";

function App() {
  return (
    <BrowserRouter basename={basename}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Tuner />} />
          <Route path="/chords" element={<Chords />} />
          <Route path="/cadence" element={<Cadence />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

function start() {
  const root = createRoot(document.getElementById("root")!);
  root.render(<App />);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start);
} else {
  start();
}
