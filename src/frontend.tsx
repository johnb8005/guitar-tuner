import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Layout } from "./Layout";
import { Tuner } from "./Tuner";
import { Chords } from "./Chords";
import { Cadence } from "./Cadence";

function App() {
  return (
    <BrowserRouter>
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
