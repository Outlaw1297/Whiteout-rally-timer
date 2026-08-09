import { useEffect, useMemo, useRef, useState } from "react";
import {
  computeLaunchPlan,
  formatClock,
  formatDuration,
  parseDuration,
  type March,
} from "./rally";
import { useNow } from "./useNow";

let marchCounter = 0;
const nextId = () => `m${++marchCounter}-${Math.random().toString(36).slice(2, 7)}`;

const SEED_MARCHES: March[] = [
  { id: nextId(), name: "Rally leader", marchSeconds: 300 },
  { id: nextId(), name: "Alice", marchSeconds: 245 },
  { id: nextId(), name: "Bjorn", marchSeconds: 180 },
];

function playBeep() {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.value = 0.12;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.18);
    osc.onended = () => ctx.close();
  } catch {
    // Audio is a nice-to-have; ignore failures (e.g. autoplay policies).
  }
}

export default function App() {
  const now = useNow(200);

  const [arrivalMs, setArrivalMs] = useState(() => Date.now() + 5 * 60 * 1000);
  const [marches, setMarches] = useState<March[]>(SEED_MARCHES);
  const [name, setName] = useState("");
  const [marchInput, setMarchInput] = useState("");
  const [soundOn, setSoundOn] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const plan = useMemo(
    () => computeLaunchPlan(marches, arrivalMs, now),
    [marches, arrivalMs, now],
  );

  const prevStatuses = useRef<Record<string, string>>({});
  useEffect(() => {
    for (const entry of plan) {
      const prev = prevStatuses.current[entry.id];
      if (prev !== "launch" && entry.status === "launch" && soundOn) {
        playBeep();
      }
      prevStatuses.current[entry.id] = entry.status;
    }
  }, [plan, soundOn]);

  const msToArrival = arrivalMs - now;
  const arrivalReached = msToArrival <= 0;

  function addMarch(e: React.FormEvent) {
    e.preventDefault();
    const seconds = parseDuration(marchInput);
    if (seconds === null || seconds <= 0) {
      setError("Enter a march time like 3:45 or 245 (seconds).");
      return;
    }
    const trimmed = name.trim() || `March ${marches.length + 1}`;
    setMarches((prev) => [...prev, { id: nextId(), name: trimmed, marchSeconds: seconds }]);
    setName("");
    setMarchInput("");
    setError(null);
  }

  function removeMarch(id: string) {
    setMarches((prev) => prev.filter((m) => m.id !== id));
  }

  function setArrivalInSeconds(seconds: number) {
    setArrivalMs(Date.now() + seconds * 1000);
  }

  function nudgeArrival(seconds: number) {
    setArrivalMs((prev) => prev + seconds * 1000);
  }

  return (
    <div className="app">
      <header className="hero">
        <div className="hero-mark" aria-hidden>❄</div>
        <div>
          <h1>Whiteout Rally Timer</h1>
          <p className="tagline">
            Line up every march to hit the target at the same moment.
          </p>
        </div>
      </header>

      <section className="master card" aria-label="Target arrival">
        <div className="master-label">Rally lands in</div>
        <div className={`master-clock ${arrivalReached ? "is-live" : ""}`}>
          {arrivalReached ? "IMPACT" : formatDuration(msToArrival / 1000)}
        </div>
        <div className="master-target">
          Target impact at <strong>{formatClock(arrivalMs)}</strong>
        </div>
        <div className="master-controls">
          <div className="btn-row">
            <button type="button" onClick={() => setArrivalInSeconds(60)}>
              1:00
            </button>
            <button type="button" onClick={() => setArrivalInSeconds(180)}>
              3:00
            </button>
            <button type="button" onClick={() => setArrivalInSeconds(300)}>
              5:00
            </button>
          </div>
          <div className="btn-row">
            <button type="button" className="ghost" onClick={() => nudgeArrival(-15)}>
              −15s
            </button>
            <button type="button" className="ghost" onClick={() => nudgeArrival(15)}>
              +15s
            </button>
          </div>
        </div>
      </section>

      <section className="card" aria-label="Add a march">
        <h2>Add a march</h2>
        <form className="add-form" onSubmit={addMarch}>
          <label className="field">
            <span>Player / troop</span>
            <input
              type="text"
              placeholder="e.g. Alice"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="field">
            <span>March time (m:ss)</span>
            <input
              type="text"
              inputMode="numeric"
              placeholder="3:45"
              value={marchInput}
              onChange={(e) => setMarchInput(e.target.value)}
              aria-label="March time"
            />
          </label>
          <button type="submit" className="primary">
            Add march
          </button>
        </form>
        {error && <p className="error" role="alert">{error}</p>}
        <label className="sound-toggle">
          <input
            type="checkbox"
            checked={soundOn}
            onChange={(e) => setSoundOn(e.target.checked)}
          />
          Play a chime when it&apos;s time to launch
        </label>
      </section>

      <section className="card" aria-label="Launch plan">
        <h2>Launch order</h2>
        {plan.length === 0 ? (
          <p className="empty">No marches yet. Add one above to build the plan.</p>
        ) : (
          <ul className="plan" role="list">
            {plan.map((entry) => (
              <li key={entry.id} className={`plan-row status-${entry.status}`}>
                <div className="plan-main">
                  <span className="plan-name">{entry.name}</span>
                  <span className="plan-march">march {formatDuration(entry.marchSeconds)}</span>
                </div>
                <div className="plan-launch">
                  <span className="plan-launch-clock">launch {formatClock(entry.launchAtMs)}</span>
                  <span className="plan-countdown" data-testid={`countdown-${entry.id}`}>
                    {entry.status === "waiting"
                      ? `in ${formatDuration(entry.msUntilLaunch / 1000)}`
                      : entry.status === "launch"
                        ? "LAUNCH NOW"
                        : "sent"}
                  </span>
                </div>
                <button
                  type="button"
                  className="remove"
                  aria-label={`Remove ${entry.name}`}
                  onClick={() => removeMarch(entry.id)}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="foot">
        Built for Whiteout Survival rally coordination · times are local to your device
      </footer>
    </div>
  );
}
