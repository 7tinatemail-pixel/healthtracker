import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, Plus, Trash2, Award, TrendingDown, Activity, CalendarDays } from "lucide-react";

const toKey = (d) => new Date(d).toISOString().split("T")[0];
const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
const diffDays = (a, b) => Math.round((new Date(a) - new Date(b)) / 86400000);
const fmtShort = (d) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const isFirstTuesdayOfMonth = (date) => { const d = new Date(date); return d.getDay() === 2 && d.getDate() <= 7; };

const SEED_PERIODS = [{ id: 1, start: "2025-03-26", end: "2025-04-01" }];

const DEFAULT_TARGETS = {
  calories: { min: 1200, max: 1400 }, protein: 105, fiber: 25,
  carbs: { min: 100, max: 150 }, fats: { min: 45, max: 55 },
  exercisePerWeek: 3,
};
const PROFILE = { height: 151, weight: 57, bfp: 33.7, goalWeight: 48, goalBFP: 28 };

const computeAvgCycleLength = (periods) => {
  if (periods.length < 2) return 28;
  const sorted = [...periods].sort((a, b) => new Date(a.start) - new Date(b.start));
  const gaps = [];
  for (let i = 1; i < sorted.length; i++) gaps.push(diffDays(sorted[i].start, sorted[i - 1].start));
  return Math.round(gaps.reduce((s, g) => s + g, 0) / gaps.length);
};

const computePeriodInfo = (periods, today = new Date()) => {
  if (!periods.length) return { phase: "Unknown", phaseEmoji: "❓", phaseDesc: "", daysUntilNext: null, nextStart: null, cycleDay: null, avgCycle: 28 };
  const sorted = [...periods].sort((a, b) => new Date(b.start) - new Date(a.start));
  const latest = sorted[0];
  const latestStart = new Date(latest.start);
  const avgCycle = computeAvgCycleLength(periods);
  const avgPeriodLen = Math.round(periods.reduce((s, p) => s + diffDays(p.end, p.start) + 1, 0) / periods.length);
  const rawDay = diffDays(today, latestStart) + 1;
  const day = ((rawDay - 1) % avgCycle) + 1;

  let nextStart = new Date(latestStart);
  while (nextStart <= today) nextStart = addDays(nextStart, avgCycle);
  const daysUntilNext = diffDays(nextStart, today);

  let phase, phaseEmoji, phaseDesc;
  if (day <= avgPeriodLen) { phase = "Menstrual"; phaseEmoji = "🔴"; phaseDesc = "Rest & nourishing foods help. Be gentle with yourself."; }
  else if (day <= 12) { phase = "Follicular"; phaseEmoji = "🌱"; phaseDesc = "Energy is rising — great time for active workouts."; }
  else if (day <= 16) { phase = "Ovulation"; phaseEmoji = "⚡"; phaseDesc = "Peak energy & confidence — your most productive days."; }
  else { phase = "Luteal"; phaseEmoji = "🌙"; phaseDesc = "Wind down gradually — lighter movement works well."; }

  return { phase, phaseEmoji, phaseDesc, daysUntilNext, nextStart, cycleDay: day, avgCycle };
};

const load = async (key, fallback) => {
  // Try window.storage first (Claude artifact env), then localStorage
  try {
    if (window.storage) {
      const r = await window.storage.get(key);
      if (r && r.value !== undefined) {
        const parsed = JSON.parse(r.value);
        try { localStorage.setItem(key, r.value); } catch {}
        return parsed;
      }
    }
  } catch {}
  try {
    const ls = localStorage.getItem(key);
    if (ls !== null) return JSON.parse(ls);
  } catch {}
  return fallback;
};

const save = async (key, val) => {
  const str = JSON.stringify(val);
  // localStorage is the primary store for standalone deployment
  try { localStorage.setItem(key, str); } catch {}
  try { if (window.storage) await window.storage.set(key, str); } catch {}
};

export default function HealthTracker() {
  const [tab, setTab] = useState("daily");
  const [selDate, setSelDate] = useState(new Date());
  const [daily, setDaily] = useState({});
  const [periods, setPeriods] = useState(SEED_PERIODS);
  const [foodLibrary, setFoodLibrary] = useState({});
  const [targets, setTargets] = useState(DEFAULT_TARGETS);
  const [saveStatus, setSaveStatus] = useState("idle"); // "idle"|"saving"|"saved"|"error"
  const [storageOk, setStorageOk] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      // Storage health check
      try {
        await window.storage.set("ht-ping", "1");
        const r = await window.storage.get("ht-ping");
        setStorageOk(!!r);
      } catch {
        setStorageOk(false);
      }
      const d = await load("ht-daily", {});
      const p = await load("ht-periods", SEED_PERIODS);
      const fl = await load("ht-food-library", {});
      const t = await load("ht-targets", DEFAULT_TARGETS);
      setDaily(d); setPeriods(p); setFoodLibrary(fl); setTargets(t); setLoading(false);
    })();
  }, []);

  const persist = async (key, val) => {
    setSaveStatus("saving");
    const ok = await save(key, val);
    setSaveStatus(ok ? "saved" : "error");
    setTimeout(() => setSaveStatus("idle"), ok ? 1500 : 4000);
  };

  const saveTargets = (t) => { setTargets(t); persist("ht-targets", t); };

  const dk = toKey(selDate);
  const dayData = { foods: [], exercises: [], weight: null, ...daily[dk] };

  const mutateDayData = (fn) => {
    const next = { ...daily, [dk]: fn({ foods: [], exercises: [], weight: null, ...daily[dk] }) };
    setDaily(next);
    persist("ht-daily", next);
  };

  const addFood = (food) => {
    // Save per-gram ratios to library
    const perG = {
      cal: food.cal / food.weight,
      protein: food.protein / food.weight,
      carbs: food.carbs / food.weight,
      fats: food.fats / food.weight,
      fiber: food.fiber / food.weight,
    };
    const key = food.name.trim().toLowerCase();
    const updatedLib = { ...foodLibrary, [key]: { name: food.name.trim(), ...perG } };
    setFoodLibrary(updatedLib);
    persist("ht-food-library", updatedLib);

    mutateDayData(d => ({ ...d, foods: [...d.foods, { ...food, id: Date.now() }] }));
  };
  const delFood = (id) => mutateDayData(d => ({ ...d, foods: d.foods.filter(f => f.id !== id) }));
  const addEx = (ex) => mutateDayData(d => ({ ...d, exercises: [...d.exercises, { ...ex, id: Date.now() }] }));
  const delEx = (id) => mutateDayData(d => ({ ...d, exercises: d.exercises.filter(e => e.id !== id) }));
  const setWeight = (w, details) => mutateDayData(d => ({ ...d, weight: { weight: w, ...details } }));

  const macros = dayData.foods.reduce(
    (acc, f) => ({ cal: acc.cal + f.cal, protein: acc.protein + f.protein, carbs: acc.carbs + f.carbs, fats: acc.fats + f.fats, fiber: acc.fiber + f.fiber }),
    { cal: 0, protein: 0, carbs: 0, fats: 0, fiber: 0 }
  );
  const met = {
    calories: macros.cal >= targets.calories.min && macros.cal <= targets.calories.max,
    protein: macros.protein >= targets.protein, fiber: macros.fiber >= targets.fiber,
    carbs: macros.carbs >= targets.carbs.min && macros.carbs <= targets.carbs.max,
    fats: macros.fats >= targets.fats.min && macros.fats <= targets.fats.max,
  };

  // Weekly exercise tracking (look at current week Mon–Sun containing selDate)
  const weekStart = (() => { const d = new Date(selDate); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); d.setHours(0,0,0,0); return d; })();
  const weekExDays = Array.from({ length: 7 }, (_, i) => {
    const k = toKey(addDays(weekStart, i));
    return (daily[k]?.exercises || []).length > 0;
  }).filter(Boolean).length;
  const weekExMet = weekExDays >= targets.exercisePerWeek;

  const macrosMet = Object.values(met).every(Boolean);
  const achievement = macrosMet && dayData.exercises.length > 0;

  // Warnings: only show if any food has been logged today
  const hasFood = dayData.foods.length > 0;
  const warnings = hasFood ? [
    !met.calories && macros.cal > targets.calories.max && `Calories over max (${Math.round(macros.cal)} / ${targets.calories.max} kcal)`,
    !met.calories && macros.cal < targets.calories.min && `Calories under minimum (${Math.round(macros.cal)} / ${targets.calories.min} kcal)`,
    !met.protein && `Protein low — ${Math.round(macros.protein)}g of ${targets.protein}g target`,
    !met.fiber && `Fiber low — ${Math.round(macros.fiber)}g of ${targets.fiber}g target`,
    !met.carbs && macros.carbs > targets.carbs.max && `Carbs over max (${Math.round(macros.carbs)}g / ${targets.carbs.max}g)`,
    !met.carbs && macros.carbs < targets.carbs.min && `Carbs under minimum (${Math.round(macros.carbs)}g / ${targets.carbs.min}g)`,
    !met.fats && macros.fats > targets.fats.max && `Fats over max (${Math.round(macros.fats)}g / ${targets.fats.max}g)`,
    !met.fats && macros.fats < targets.fats.min && `Fats under minimum (${Math.round(macros.fats)}g / ${targets.fats.min}g)`,
  ].filter(Boolean) : [];

  // ── Latest logged stats (from most recent weight entry across all days) ──
  const latestStats = (() => {
    const entries = Object.entries(daily)
      .filter(([, d]) => d?.weight?.weight)
      .sort(([a], [b]) => b.localeCompare(a)); // newest first
    if (!entries.length) return { weight: PROFILE.weight, bfp: PROFILE.bfp, muscleMass: null, visceralFat: null, date: null };
    const [date, d] = entries[0];
    return {
      weight: d.weight.weight,
      bfp: d.weight.bfp ?? PROFILE.bfp,
      muscleMass: d.weight.muscleMass ?? null,
      visceralFat: d.weight.visceralFat ?? null,
      date,
    };
  })();

  const savePeriods = (p) => { setPeriods(p); save("ht-periods", p); };
  const addPeriod = (start, end) => {
    const next = [...periods, { id: Date.now(), start, end }].sort((a, b) => new Date(b.start) - new Date(a.start));
    savePeriods(next);
  };
  const delPeriod = (id) => savePeriods(periods.filter(p => p.id !== id));
  const periodInfo = computePeriodInfo(periods);

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(selDate, i - 6); const k = toKey(d);
    const fd = daily[k]?.foods || [];
    return { date: d, cal: fd.reduce((s, f) => s + f.cal, 0), ex: (daily[k]?.exercises || []).length > 0 };
  });

  const year = selDate.getFullYear(), month = selDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthDays = Array.from({ length: daysInMonth }, (_, i) => {
    const d = new Date(year, month, i + 1); const k = toKey(d);
    const fd = daily[k]?.foods || [];
    return { date: d, cal: fd.reduce((s, f) => s + f.cal, 0), ex: (daily[k]?.exercises || []).length > 0 };
  });
  const firstDow = new Date(year, month, 1).getDay();

  if (loading) return <div className="flex items-center justify-center h-screen text-gray-400">Loading…</div>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-amber-50 to-emerald-50">
      <div className="max-w-xl mx-auto px-4 py-6 pb-12">

        <div className="mb-6">
          <h1 className="text-3xl font-black tracking-tight text-gray-900">Health Tracker</h1>
          <p className="text-sm text-gray-500 mt-1">Goal: {PROFILE.goalWeight} kg · {PROFILE.goalBFP}% BFP · {(latestStats.weight - PROFILE.goalWeight).toFixed(1)} kg to go</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-5 flex items-center gap-3">
          <button onClick={() => setSelDate(addDays(selDate, -1))} className="p-2 rounded-xl bg-gray-100 hover:bg-gray-200"><ChevronLeft className="w-4 h-4" /></button>
          <input type="date" value={toKey(selDate)} onChange={(e) => setSelDate(new Date(e.target.value + "T12:00:00"))}
            className="flex-1 text-center font-semibold border border-gray-200 rounded-xl px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300" />
          <button onClick={() => setSelDate(addDays(selDate, 1))} className="p-2 rounded-xl bg-gray-100 hover:bg-gray-200"><ChevronRight className="w-4 h-4" /></button>
          <button onClick={() => setSelDate(new Date())} className="text-xs px-3 py-2 bg-rose-100 text-rose-700 rounded-xl font-semibold">Today</button>
        </div>

        <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
          {[{ id: "daily", label: "📅 Daily" }, { id: "weekly", label: "📊 Weekly" }, { id: "monthly", label: "📈 Monthly" }, { id: "period", label: `${periodInfo.phaseEmoji} Period` }, { id: "settings", label: "⚙️ Targets" }]
            .map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`px-4 py-2 rounded-xl font-semibold whitespace-nowrap text-sm transition-all ${tab === t.id ? "bg-gray-900 text-white shadow" : "bg-white text-gray-600 hover:bg-gray-50 border border-gray-200"}`}>
                {t.label}
              </button>
            ))}
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">

          {tab === "daily" && (
            <div className="space-y-5">

              {/* ── Achievement banner ── */}
              {achievement ? (
                <div className="bg-gradient-to-r from-amber-400 to-orange-400 rounded-2xl p-4 flex items-center gap-3 shadow">
                  <div className="text-3xl">🏆</div>
                  <div>
                    <p className="font-black text-white text-base">Perfect Day!</p>
                    <p className="text-xs text-amber-100">All nutrition targets met + exercise done. Amazing!</p>
                  </div>
                </div>
              ) : macrosMet && !dayData.exercises.length ? (
                <div className="bg-gradient-to-r from-emerald-400 to-teal-400 rounded-2xl p-4 flex items-center gap-3 shadow">
                  <div className="text-3xl">🥗</div>
                  <div>
                    <p className="font-black text-white text-base">Nutrition Goals Met!</p>
                    <p className="text-xs text-emerald-100">Add an exercise to unlock the full achievement badge.</p>
                  </div>
                </div>
              ) : dayData.exercises.length > 0 && !macrosMet ? (
                <div className="bg-gradient-to-r from-blue-400 to-indigo-400 rounded-2xl p-4 flex items-center gap-3 shadow">
                  <div className="text-3xl">💪</div>
                  <div>
                    <p className="font-black text-white text-base">Exercise Done!</p>
                    <p className="text-xs text-blue-100">Hit your nutrition targets too for the full badge.</p>
                  </div>
                </div>
              ) : null}

              {/* ── Warnings ── */}
              {warnings.length > 0 && (
                <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-4 space-y-2">
                  <p className="font-bold text-red-700 text-sm flex items-center gap-2">⚠️ Targets not met</p>
                  {warnings.map((w, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="text-red-400 text-xs mt-0.5">•</span>
                      <p className="text-xs text-red-600">{w}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* ── Weekly exercise progress ── */}
              <div className={`rounded-2xl p-4 border-2 flex items-center justify-between ${weekExMet ? "bg-emerald-50 border-emerald-300" : "bg-orange-50 border-orange-200"}`}>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">This Week's Exercise</p>
                  <p className="text-xl font-black text-gray-800">{weekExDays} <span className="text-sm font-normal text-gray-500">/ {targets.exercisePerWeek} days</span></p>
                  <p className="text-xs text-gray-500">{weekExMet ? "✓ Weekly goal reached!" : `${targets.exercisePerWeek - weekExDays} more day${targets.exercisePerWeek - weekExDays !== 1 ? "s" : ""} to go`}</p>
                </div>
                <div className="flex gap-1">
                  {Array.from({ length: targets.exercisePerWeek }, (_, i) => (
                    <div key={i} className={`w-5 h-5 rounded-full ${i < weekExDays ? "bg-emerald-500" : "bg-gray-200"}`} />
                  ))}
                </div>
              </div>

              {/* ── Macro cards ── */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Calories", val: Math.round(macros.cal), unit: "kcal", ok: met.calories, sub: `${targets.calories.min}–${targets.calories.max}` },
                  { label: "Protein", val: Math.round(macros.protein), unit: "g", ok: met.protein, sub: `${targets.protein}g+` },
                  { label: "Carbs", val: Math.round(macros.carbs), unit: "g", ok: met.carbs, sub: `${targets.carbs.min}–${targets.carbs.max}g` },
                  { label: "Fats", val: Math.round(macros.fats), unit: "g", ok: met.fats, sub: `${targets.fats.min}–${targets.fats.max}g` },
                  { label: "Fiber", val: Math.round(macros.fiber), unit: "g", ok: met.fiber, sub: `${targets.fiber}g+` },
                ].map((m) => (
                  <div key={m.label} className={`rounded-xl p-4 border-2 ${m.ok ? "bg-emerald-50 border-emerald-300" : hasFood ? "bg-red-50 border-red-200" : "bg-gray-50 border-gray-200"}`}>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{m.label}</p>
                    <p className="text-2xl font-black text-gray-800">{m.val}<span className="text-sm font-normal text-gray-500 ml-1">{m.unit}</span></p>
                    <p className="text-xs text-gray-500">{m.sub} {m.ok ? "✓" : ""}</p>
                  </div>
                ))}
              </div>

              <FoodForm onAdd={addFood} library={foodLibrary} />
              {dayData.foods.length > 0 && (
                <div className="space-y-2">
                  <p className="font-bold text-sm text-gray-700">Foods Logged</p>
                  {dayData.foods.map((f) => (
                    <div key={f.id} className="flex justify-between items-start bg-gray-50 rounded-xl px-4 py-3">
                      <div>
                        <p className="font-semibold text-gray-800 text-sm">{f.name}</p>
                        <p className="text-xs text-gray-500">{f.displayWeight || `${f.weight}g`} · {f.cal} kcal · P{f.protein}g C{f.carbs}g F{f.fats}g Fiber{f.fiber}g</p>
                      </div>
                      <button onClick={() => delFood(f.id)} className="text-red-400 hover:text-red-600 p-1"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>
              )}

              <ExForm onAdd={addEx} />
              {dayData.exercises.length > 0 && (
                <div className="space-y-2">
                  <p className="font-bold text-sm text-gray-700">Exercises</p>
                  {dayData.exercises.map((e) => (
                    <div key={e.id} className="flex justify-between items-start bg-blue-50 rounded-xl px-4 py-3">
                      <div>
                        <p className="font-semibold text-gray-800 text-sm">{e.name}</p>
                        <p className="text-xs text-gray-500">{e.duration} min · {e.burned} kcal burned</p>
                      </div>
                      <button onClick={() => delEx(e.id)} className="text-red-400 hover:text-red-600 p-1"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>
              )}

              <WeightForm current={dayData.weight} showDetailed={isFirstTuesdayOfMonth(selDate)} onSave={setWeight} />
            </div>
          )}

          {tab === "weekly" && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4">
                  <p className="text-xs font-semibold text-gray-500">Avg Calories</p>
                  <p className="text-2xl font-black">{Math.round(weekDays.reduce((s, d) => s + d.cal, 0) / 7)}</p>
                </div>
                <div className="bg-emerald-50 border-2 border-emerald-200 rounded-xl p-4">
                  <p className="text-xs font-semibold text-gray-500">Exercise Days</p>
                  <p className="text-2xl font-black">{weekDays.filter(d => d.ex).length} / 7</p>
                </div>
              </div>
              {weekDays.map((d, i) => {
                const pct = Math.min(100, Math.round(d.cal / targets.calories.max * 100));
                const color = d.cal > targets.calories.max ? "bg-red-400" : d.cal >= targets.calories.min ? "bg-emerald-400" : "bg-gray-300";
                return (
                  <div key={i} className="bg-gray-50 rounded-xl p-3">
                    <div className="flex justify-between items-center mb-1">
                      <p className="text-sm font-semibold text-gray-700">{d.date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}{d.ex && " 💪"}</p>
                      <p className="text-sm font-bold text-gray-800">{d.cal} kcal</p>
                    </div>
                    <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
                      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {tab === "monthly" && (
            <div className="space-y-5">
              <p className="font-bold text-gray-800">{selDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</p>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-purple-50 border-2 border-purple-200 rounded-xl p-3 text-center">
                  <p className="text-xs text-gray-500">Total Cal</p>
                  <p className="text-lg font-black">{monthDays.reduce((s, d) => s + d.cal, 0).toLocaleString()}</p>
                </div>
                <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-3 text-center">
                  <p className="text-xs text-gray-500">Daily Avg</p>
                  <p className="text-lg font-black">{Math.round(monthDays.reduce((s, d) => s + d.cal, 0) / daysInMonth)}</p>
                </div>
                <div className="bg-emerald-50 border-2 border-emerald-200 rounded-xl p-3 text-center">
                  <p className="text-xs text-gray-500">Exercise</p>
                  <p className="text-lg font-black">{monthDays.filter(d => d.ex).length}d</p>
                </div>
              </div>
              <div className="grid grid-cols-7 gap-1">
                {["Su","Mo","Tu","We","Th","Fr","Sa"].map(d => <div key={d} className="text-center text-xs font-semibold text-gray-400 py-1">{d}</div>)}
                {Array.from({ length: firstDow }, (_, i) => <div key={`e${i}`} />)}
                {monthDays.map((d, i) => {
                  const bg = d.cal > targets.calories.max ? "bg-red-100 border-red-300 text-red-700"
                    : d.cal >= targets.calories.min ? "bg-emerald-100 border-emerald-300 text-emerald-700"
                    : "bg-gray-100 border-gray-200 text-gray-500";
                  return (
                    <div key={i} className={`aspect-square flex flex-col items-center justify-center rounded-lg border text-xs font-bold ${bg}`}>
                      {d.date.getDate()}{d.ex && <span>💪</span>}
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-gray-400 text-center">🟢 on target · 🔴 over · ⬜ under/no data · 💪 exercise</p>
            </div>
          )}

          {tab === "period" && (
            <PeriodTab periods={periods} periodInfo={periodInfo} onAdd={addPeriod} onDelete={delPeriod} />
          )}

          {tab === "settings" && (
            <SettingsForm targets={targets} onSave={saveTargets} />
          )}
        </div>

        <div className="mt-5 space-y-3">
          {latestStats.date && (
            <p className="text-xs text-gray-400 text-center">
              Stats from {new Date(latestStats.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </p>
          )}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white rounded-xl border border-gray-100 p-3 text-center shadow-sm">
              <p className="text-xl font-black text-gray-800">{latestStats.weight}</p>
              <p className="text-xs text-gray-400">current kg</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-3 text-center shadow-sm">
              <p className="text-xl font-black text-rose-500">{Math.max(0, latestStats.weight - PROFILE.goalWeight).toFixed(1)}</p>
              <p className="text-xs text-gray-400">kg to goal</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-3 text-center shadow-sm">
              <p className="text-xl font-black text-blue-500">{latestStats.bfp != null ? latestStats.bfp.toFixed(1) : "—"}%</p>
              <p className="text-xs text-gray-400">body fat</p>
            </div>
          </div>
          {(latestStats.muscleMass != null || latestStats.visceralFat != null) && (
            <div className="grid grid-cols-2 gap-3">
              {latestStats.muscleMass != null && (
                <div className="bg-white rounded-xl border border-gray-100 p-3 text-center shadow-sm">
                  <p className="text-xl font-black text-emerald-600">{latestStats.muscleMass.toFixed(1)}</p>
                  <p className="text-xs text-gray-400">muscle kg</p>
                </div>
              )}
              {latestStats.visceralFat != null && (
                <div className="bg-white rounded-xl border border-gray-100 p-3 text-center shadow-sm">
                  <p className="text-xl font-black text-orange-500">{latestStats.visceralFat}</p>
                  <p className="text-xs text-gray-400">visceral fat</p>
                </div>
              )}
            </div>
          )}
          <div className="bg-white rounded-xl border border-gray-100 p-3 shadow-sm">
            <div className="flex justify-between text-xs text-gray-400 mb-1">
              <span>Progress to goal</span>
              <span>{latestStats.weight} → {PROFILE.goalWeight} kg</span>
            </div>
            <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-rose-400 to-amber-400 transition-all"
                style={{
                  width: `${Math.min(100, Math.max(0,
                    ((PROFILE.weight - latestStats.weight) / (PROFILE.weight - PROFILE.goalWeight)) * 100
                  ).toFixed(0))}%`
                }}
              />
            </div>
            <p className="text-xs text-gray-400 mt-1 text-right">
              {Math.min(100, Math.max(0, ((PROFILE.weight - latestStats.weight) / (PROFILE.weight - PROFILE.goalWeight)) * 100)).toFixed(0)}% of the way there
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Unit conversion table → grams (approximate, standard culinary values)
const UNITS = [
  { label: "g",          toG: 1 },
  { label: "ml",         toG: 1 },          // water-density approximation
  { label: "tsp",        toG: 4.2 },
  { label: "tbsp",       toG: 12.6 },
  { label: "fl oz",      toG: 29.57 },
  { label: "cup",        toG: 240 },
  { label: "oz",         toG: 28.35 },
  { label: "lb",         toG: 453.6 },
  { label: "slice",      toG: 30 },         // generic slice ~30 g
  { label: "piece",      toG: 50 },         // generic piece ~50 g
  { label: "serving",    toG: 100 },        // user can override macros manually
  { label: "small",      toG: 80 },
  { label: "medium",     toG: 130 },
  { label: "large",      toG: 200 },
  { label: "handful",    toG: 30 },
  { label: "pinch",      toG: 0.36 },
  { label: "dash",       toG: 0.6 },
  { label: "drop",       toG: 0.05 },
  { label: "can (400ml)",toG: 400 },
  { label: "sachet",     toG: 5 },
  { label: "scoop",      toG: 30 },
  { label: "bar",        toG: 40 },
  { label: "bottle (500ml)", toG: 500 },
  { label: "bag (small)",toG: 25 },
];

function FoodForm({ onAdd, library }) {
  const empty = { name: "", qty: "", unit: "g", cal: "", protein: "", carbs: "", fats: "", fiber: "" };
  const [f, setF] = useState(empty);
  const [suggestions, setSuggestions] = useState([]);
  const [matchedEntry, setMatchedEntry] = useState(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [unitSearch, setUnitSearch] = useState("");
  const [showUnitPicker, setShowUnitPicker] = useState(false);

  // Convert qty + unit → grams
  const toGrams = (qty, unit) => {
    const u = UNITS.find(u => u.label === unit) || { toG: 1 };
    return parseFloat(qty) * u.toG;
  };

  const recalcMacros = (qty, unit, entry) => {
    const grams = toGrams(qty, unit);
    if (!grams || !entry) return {};
    return {
      cal:     (entry.cal     * grams).toFixed(1),
      protein: (entry.protein * grams).toFixed(1),
      carbs:   (entry.carbs   * grams).toFixed(1),
      fats:    (entry.fats    * grams).toFixed(1),
      fiber:   (entry.fiber   * grams).toFixed(1),
    };
  };

  const handleQtyChange = (val) => {
    if (matchedEntry && val) {
      setF(p => ({ ...p, qty: val, ...recalcMacros(val, p.unit, matchedEntry) }));
    } else {
      setF(p => ({ ...p, qty: val }));
    }
  };

  const handleUnitSelect = (unit) => {
    setShowUnitPicker(false);
    setUnitSearch("");
    if (matchedEntry && f.qty) {
      setF(p => ({ ...p, unit, ...recalcMacros(f.qty, unit, matchedEntry) }));
    } else {
      setF(p => ({ ...p, unit }));
    }
  };

  const handleNameChange = (val) => {
    setF(p => ({ ...p, name: val }));
    setMatchedEntry(null);
    if (val.trim().length < 1) { setSuggestions([]); setShowSuggestions(false); return; }
    const query = val.trim().toLowerCase();
    const matches = Object.values(library).filter(item =>
      item.name.toLowerCase().includes(query)
    ).slice(0, 6);
    setSuggestions(matches);
    setShowSuggestions(matches.length > 0);
  };

  const selectSuggestion = (item) => {
    setMatchedEntry(item);
    setShowSuggestions(false);
    const qty = f.qty || "100";
    const unit = f.unit || "g";
    setF(p => ({ ...p, name: item.name, qty, unit, ...recalcMacros(qty, unit, item) }));
  };

  const submit = () => {
    if (!f.name || !f.qty || !f.cal) return;
    const grams = toGrams(f.qty, f.unit);
    const displayWeight = `${f.qty} ${f.unit}${f.unit !== "g" ? ` (~${grams.toFixed(0)}g)` : ""}`;
    onAdd({
      ...f,
      weight: grams,           // always store in grams internally
      displayWeight,            // pretty label for the log
      cal: +f.cal, protein: +f.protein||0, carbs: +f.carbs||0, fats: +f.fats||0, fiber: +f.fiber||0,
    });
    setF(empty);
    setMatchedEntry(null);
    setSuggestions([]);
  };

  const filteredUnits = UNITS.filter(u =>
    u.label.toLowerCase().includes(unitSearch.toLowerCase())
  );

  const macroFields = [["protein","P(g)"],["carbs","C(g)"],["fats","F(g)"],["fiber","Fib(g)"]];

  return (
    <div className="bg-emerald-50 rounded-2xl p-4 border border-emerald-200 space-y-2">
      <p className="font-bold text-sm text-gray-700 flex items-center gap-2"><Plus className="w-4 h-4" /> Add Food</p>

      {/* Name autocomplete */}
      <div className="relative">
        <input
          className="w-full px-3 py-2 text-sm border border-emerald-300 rounded-xl bg-white"
          placeholder="Food name (type to search history)"
          value={f.name}
          onChange={e => handleNameChange(e.target.value)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          onFocus={() => f.name.length > 0 && suggestions.length > 0 && setShowSuggestions(true)}
        />
        {showSuggestions && (
          <div className="absolute z-20 w-full mt-1 bg-white border border-emerald-200 rounded-xl shadow-lg overflow-hidden">
            {suggestions.map((item, i) => (
              <button key={i} onMouseDown={() => selectSuggestion(item)}
                className="w-full text-left px-4 py-2 text-sm hover:bg-emerald-50 flex justify-between items-center border-b border-gray-50 last:border-0">
                <span className="font-medium text-gray-800">{item.name}</span>
                <span className="text-xs text-gray-400">{(item.cal * 100).toFixed(0)} kcal/100g</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {matchedEntry && (
        <p className="text-xs text-emerald-700 bg-emerald-100 px-3 py-1 rounded-lg">
          ✓ Known food — change qty or unit to auto-recalculate macros.
        </p>
      )}

      {/* Qty + Unit picker */}
      <div className="flex gap-2">
        <input
          className="w-28 px-3 py-2 text-sm border border-emerald-300 rounded-xl bg-white"
          placeholder="Amount"
          type="number"
          value={f.qty}
          onChange={e => handleQtyChange(e.target.value)}
        />
        {/* Unit button */}
        <div className="relative flex-1">
          <button
            onClick={() => { setShowUnitPicker(p => !p); setUnitSearch(""); }}
            className="w-full px-3 py-2 text-sm border border-emerald-300 rounded-xl bg-white text-left flex justify-between items-center font-medium text-gray-700"
          >
            <span>{f.unit}</span>
            <span className="text-gray-400 text-xs">▾</span>
          </button>
          {showUnitPicker && (
            <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-emerald-200 rounded-xl shadow-xl overflow-hidden">
              <div className="p-2 border-b border-gray-100">
                <input
                  autoFocus
                  className="w-full px-2 py-1 text-xs border border-gray-200 rounded-lg"
                  placeholder="Search units…"
                  value={unitSearch}
                  onChange={e => setUnitSearch(e.target.value)}
                />
              </div>
              <div className="max-h-48 overflow-y-auto">
                {filteredUnits.map(u => (
                  <button key={u.label} onMouseDown={() => handleUnitSelect(u.label)}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-emerald-50 flex justify-between border-b border-gray-50 last:border-0 ${f.unit === u.label ? "bg-emerald-100 font-semibold text-emerald-800" : "text-gray-700"}`}>
                    <span>{u.label}</span>
                    {u.toG !== 1 && <span className="text-xs text-gray-400">≈ {u.toG < 1 ? u.toG.toFixed(2) : u.toG.toFixed(0)}g</span>}
                  </button>
                ))}
                {filteredUnits.length === 0 && (
                  <p className="text-xs text-gray-400 px-4 py-3">No matches. Try a different term.</p>
                )}
              </div>
            </div>
          )}
        </div>
        {/* gram equivalent preview */}
        {f.qty && f.unit !== "g" && (
          <div className="flex items-center text-xs text-gray-500 whitespace-nowrap bg-white border border-emerald-200 rounded-xl px-2">
            ≈ {toGrams(f.qty, f.unit).toFixed(0)}g
          </div>
        )}
      </div>

      {/* Calories */}
      <input
        className={`w-full px-3 py-2 text-sm border border-emerald-300 rounded-xl ${matchedEntry ? "bg-emerald-100 text-emerald-800 font-semibold" : "bg-white"}`}
        placeholder="Calories (kcal)"
        type="number"
        value={f.cal}
        onChange={e => setF(p => ({ ...p, cal: e.target.value }))}
        readOnly={!!matchedEntry}
      />

      {/* Macros */}
      <div className="grid grid-cols-4 gap-2">
        {macroFields.map(([k, ph]) => (
          <input key={k}
            className={`px-2 py-2 text-xs border border-emerald-300 rounded-xl ${matchedEntry ? "bg-emerald-100 text-emerald-800 font-semibold" : "bg-white"}`}
            placeholder={ph} type="number" value={f[k]}
            onChange={e => setF(p => ({ ...p, [k]: e.target.value }))}
            readOnly={!!matchedEntry}
          />
        ))}
      </div>

      <button onClick={submit} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-2 rounded-xl text-sm font-bold transition">
        Add Food
      </button>

      {Object.keys(library).length > 0 && (
        <p className="text-xs text-gray-400 text-center">{Object.keys(library).length} food{Object.keys(library).length !== 1 ? "s" : ""} in your library</p>
      )}
    </div>
  );
}

function ExForm({ onAdd }) {
  const empty = { name: "", duration: "", burned: "" };
  const [e, setE] = useState(empty);
  const upd = (k, v) => setE(p => ({ ...p, [k]: v }));
  const submit = () => {
    if (!e.name || !e.duration || !e.burned) return;
    onAdd({ ...e, duration: +e.duration, burned: +e.burned });
    setE(empty);
  };
  return (
    <div className="bg-blue-50 rounded-2xl p-4 border border-blue-200 space-y-2">
      <p className="font-bold text-sm text-gray-700 flex items-center gap-2"><Activity className="w-4 h-4" /> Add Exercise</p>
      <input className="w-full px-3 py-2 text-sm border border-blue-300 rounded-xl bg-white" placeholder="Exercise name" value={e.name} onChange={ev => upd("name", ev.target.value)} />
      <div className="grid grid-cols-2 gap-2">
        <input className="px-3 py-2 text-sm border border-blue-300 rounded-xl bg-white" placeholder="Duration (min)" type="number" value={e.duration} onChange={ev => upd("duration", ev.target.value)} />
        <input className="px-3 py-2 text-sm border border-blue-300 rounded-xl bg-white" placeholder="Calories burned" type="number" value={e.burned} onChange={ev => upd("burned", ev.target.value)} />
      </div>
      <button onClick={submit} className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-xl text-sm font-bold transition">Add Exercise</button>
    </div>
  );
}

function WeightForm({ current, showDetailed, onSave }) {
  const [w, setW] = useState(current?.weight || "");
  const [d, setD] = useState({ muscleMass: "", bfp: "", visceralFat: "" });
  const submit = () => {
    if (!w) return;
    onSave(+w, showDetailed ? { muscleMass: +d.muscleMass||null, bfp: +d.bfp||null, visceralFat: +d.visceralFat||null } : null);
    setW(""); setD({ muscleMass: "", bfp: "", visceralFat: "" });
  };
  return (
    <div className="bg-purple-50 rounded-2xl p-4 border border-purple-200 space-y-2">
      <p className="font-bold text-sm text-gray-700 flex items-center gap-2"><TrendingDown className="w-4 h-4" /> Weight Log</p>
      {showDetailed && <p className="text-xs text-purple-600 bg-purple-100 px-3 py-1 rounded-lg">📅 First Tuesday — detailed measurements unlocked</p>}
      {current?.weight && <p className="text-xs text-gray-500">Logged: <strong>{current.weight} kg</strong>{current.bfp ? ` · BFP ${current.bfp}%` : ""}</p>}
      <input className="w-full px-3 py-2 text-sm border border-purple-300 rounded-xl bg-white" placeholder="Weight (kg)" type="number" step="0.1" value={w} onChange={e => setW(e.target.value)} />
      {showDetailed && (
        <div className="grid grid-cols-3 gap-2">
          <input className="px-2 py-2 text-xs border border-purple-300 rounded-xl bg-white" placeholder="Muscle (kg)" type="number" step="0.1" value={d.muscleMass} onChange={e => setD(p => ({ ...p, muscleMass: e.target.value }))} />
          <input className="px-2 py-2 text-xs border border-purple-300 rounded-xl bg-white" placeholder="BFP (%)" type="number" step="0.1" value={d.bfp} onChange={e => setD(p => ({ ...p, bfp: e.target.value }))} />
          <input className="px-2 py-2 text-xs border border-purple-300 rounded-xl bg-white" placeholder="Visceral" type="number" value={d.visceralFat} onChange={e => setD(p => ({ ...p, visceralFat: e.target.value }))} />
        </div>
      )}
      <button onClick={submit} className="w-full bg-purple-600 hover:bg-purple-700 text-white py-2 rounded-xl text-sm font-bold transition">Save Weight</button>
    </div>
  );
}

function PeriodTab({ periods, periodInfo, onAdd, onDelete }) {
  const [newStart, setNewStart] = useState("");
  const [newEnd, setNewEnd] = useState("");
  const sorted = [...periods].sort((a, b) => new Date(b.start) - new Date(a.start));

  const phaseColors = {
    Menstrual: "from-red-100 to-rose-100 border-red-300",
    Follicular: "from-green-100 to-emerald-100 border-green-300",
    Ovulation: "from-yellow-100 to-amber-100 border-yellow-300",
    Luteal: "from-indigo-100 to-purple-100 border-indigo-300",
    Unknown: "from-gray-100 to-gray-100 border-gray-300",
  };

  return (
    <div className="space-y-5">
      {/* current phase */}
      <div className={`bg-gradient-to-br ${phaseColors[periodInfo.phase]} rounded-2xl border-2 p-5 text-center`}>
        <p className="text-5xl mb-2">{periodInfo.phaseEmoji}</p>
        <p className="text-2xl font-black text-gray-800">{periodInfo.phase} Phase</p>
        <p className="text-sm text-gray-600 mt-1">{periodInfo.phaseDesc}</p>
        {periodInfo.cycleDay && (
          <p className="text-xs text-gray-400 mt-2">Cycle day ~{periodInfo.cycleDay} · avg cycle {periodInfo.avgCycle} days</p>
        )}
      </div>

      {/* next period prediction */}
      {periodInfo.nextStart && (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-rose-50 border-2 border-rose-200 rounded-xl p-4 text-center">
            <p className="text-xs text-gray-500 font-semibold">Next Period In</p>
            <p className="text-3xl font-black text-rose-600">{periodInfo.daysUntilNext}</p>
            <p className="text-xs text-gray-500">days</p>
          </div>
          <div className="bg-pink-50 border-2 border-pink-200 rounded-xl p-4 text-center">
            <p className="text-xs text-gray-500 font-semibold">Expected On</p>
            <p className="text-xl font-black text-pink-700">{fmtShort(periodInfo.nextStart)}</p>
            <p className="text-xs text-gray-500">{periodInfo.nextStart.getFullYear()}</p>
          </div>
        </div>
      )}

      {/* log a period */}
      <div className="bg-rose-50 rounded-2xl border border-rose-200 p-4 space-y-3">
        <p className="font-bold text-sm text-gray-700 flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-rose-500" /> Log a Period
        </p>
        <p className="text-xs text-gray-400">Add any past or current period to improve cycle predictions.</p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-gray-500 font-semibold">Start date</label>
            <input type="date" value={newStart} onChange={e => setNewStart(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-rose-300 rounded-xl bg-white mt-1" />
          </div>
          <div>
            <label className="text-xs text-gray-500 font-semibold">End date</label>
            <input type="date" value={newEnd} onChange={e => setNewEnd(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-rose-300 rounded-xl bg-white mt-1" />
          </div>
        </div>
        <button
          onClick={() => { if (newStart && newEnd && newEnd >= newStart) { onAdd(newStart, newEnd); setNewStart(""); setNewEnd(""); } }}
          className="w-full bg-rose-600 hover:bg-rose-700 text-white py-2 rounded-xl text-sm font-bold transition">
          Add Period
        </button>
      </div>

      {/* history */}
      <div>
        <p className="font-bold text-sm text-gray-700 mb-3">Period History ({sorted.length} logged)</p>
        <div className="space-y-2">
          {sorted.map(p => {
            const len = diffDays(p.end, p.start) + 1;
            return (
              <div key={p.id} className="bg-gray-50 rounded-xl px-4 py-3 flex justify-between items-center">
                <div>
                  <p className="font-semibold text-sm text-gray-800">{fmtShort(p.start)} → {fmtShort(p.end)}</p>
                  <p className="text-xs text-gray-500">{len} day{len !== 1 ? "s" : ""}</p>
                </div>
                <button onClick={() => onDelete(p.id)} className="text-red-400 hover:text-red-600 p-1"><Trash2 className="w-4 h-4" /></button>
              </div>
            );
          })}
          {!sorted.length && <p className="text-xs text-gray-400">No periods logged yet.</p>}
        </div>
      </div>

      {/* guide */}
      <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
        <p className="font-bold text-sm text-gray-700">Cycle Phases Guide</p>
        {[
          { e: "🔴", phase: "Menstrual (Days 1–5)", tip: "Rest, iron-rich foods, gentle movement." },
          { e: "🌱", phase: "Follicular (Days 6–12)", tip: "Energy rises — great for strength training." },
          { e: "⚡", phase: "Ovulation (Days 13–16)", tip: "Peak power & confidence — go for it!" },
          { e: "🌙", phase: "Luteal (Days 17–28)", tip: "Wind down, prioritise sleep & magnesium." },
        ].map(({ e, phase, tip }) => (
          <div key={phase} className="flex gap-3 text-sm">
            <span className="text-xl">{e}</span>
            <div><p className="font-semibold text-gray-800">{phase}</p><p className="text-gray-500 text-xs">{tip}</p></div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SettingsForm({ targets, onSave }) {
  const [t, setT] = useState({ ...targets });
  const [saved, setSaved] = useState(false);

  const upd = (path, val) => {
    const num = parseFloat(val);
    if (isNaN(num)) return;
    setT(prev => {
      const next = { ...prev };
      if (path.includes(".")) {
        const [a, b] = path.split(".");
        next[a] = { ...next[a], [b]: num };
      } else {
        next[path] = num;
      }
      return next;
    });
    setSaved(false);
  };

  const handleSave = () => {
    onSave(t);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    setT({ ...DEFAULT_TARGETS });
    setSaved(false);
  };

  const Field = ({ label, path, unit, hint }) => (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-gray-100 last:border-0">
      <div className="flex-1">
        <p className="text-sm font-semibold text-gray-700">{label}</p>
        {hint && <p className="text-xs text-gray-400">{hint}</p>}
      </div>
      <div className="flex items-center gap-1">
        <input
          type="number"
          value={path.includes(".") ? t[path.split(".")[0]][path.split(".")[1]] : t[path]}
          onChange={e => upd(path, e.target.value)}
          className="w-20 px-2 py-1.5 text-sm font-bold text-right border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
          min="0"
          step={path === "exercisePerWeek" ? 1 : 0.1}
        />
        <span className="text-xs text-gray-400 w-8">{unit}</span>
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      <div>
        <p className="font-black text-gray-900 text-lg">Daily Targets</p>
        <p className="text-xs text-gray-400 mt-0.5">Edit your targets and tap Save to apply them everywhere.</p>
      </div>

      <div className="bg-amber-50 rounded-2xl p-4 border border-amber-200 space-y-1">
        <p className="font-bold text-sm text-amber-800 mb-2">🔥 Calories</p>
        <Field label="Minimum" path="calories.min" unit="kcal" hint="Eat at least this much" />
        <Field label="Maximum" path="calories.max" unit="kcal" hint="Don't exceed this" />
      </div>

      <div className="bg-rose-50 rounded-2xl p-4 border border-rose-200 space-y-1">
        <p className="font-bold text-sm text-rose-800 mb-2">🥩 Protein</p>
        <Field label="Minimum" path="protein" unit="g" hint="Hit at least this daily" />
      </div>

      <div className="bg-orange-50 rounded-2xl p-4 border border-orange-200 space-y-1">
        <p className="font-bold text-sm text-orange-800 mb-2">🍞 Carbs</p>
        <Field label="Minimum" path="carbs.min" unit="g" />
        <Field label="Maximum" path="carbs.max" unit="g" />
      </div>

      <div className="bg-yellow-50 rounded-2xl p-4 border border-yellow-200 space-y-1">
        <p className="font-bold text-sm text-yellow-800 mb-2">🥑 Fats</p>
        <Field label="Minimum" path="fats.min" unit="g" />
        <Field label="Maximum" path="fats.max" unit="g" />
      </div>

      <div className="bg-green-50 rounded-2xl p-4 border border-green-200 space-y-1">
        <p className="font-bold text-sm text-green-800 mb-2">🌾 Fiber</p>
        <Field label="Minimum" path="fiber" unit="g" hint="Hit at least this daily" />
      </div>

      <div className="bg-blue-50 rounded-2xl p-4 border border-blue-200 space-y-1">
        <p className="font-bold text-sm text-blue-800 mb-2">💪 Exercise</p>
        <Field label="Days per week" path="exercisePerWeek" unit="days" hint="Weekly goal tracked on Daily tab" />
      </div>

      <div className="flex gap-3">
        <button
          onClick={handleSave}
          className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all ${saved ? "bg-emerald-500 text-white" : "bg-gray-900 hover:bg-gray-700 text-white"}`}
        >
          {saved ? "✓ Saved!" : "Save Targets"}
        </button>
        <button
          onClick={handleReset}
          className="px-4 py-3 rounded-xl font-bold text-sm bg-gray-100 hover:bg-gray-200 text-gray-600 transition"
        >
          Reset
        </button>
      </div>

      {/* Summary preview */}
      <div className="bg-gray-50 rounded-2xl p-4 border border-gray-200">
        <p className="font-bold text-sm text-gray-700 mb-3">Current Targets Summary</p>
        <div className="space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-gray-500">Calories</span><span className="font-semibold">{t.calories.min}–{t.calories.max} kcal</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Protein</span><span className="font-semibold">{t.protein}g+</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Carbs</span><span className="font-semibold">{t.carbs.min}–{t.carbs.max}g</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Fats</span><span className="font-semibold">{t.fats.min}–{t.fats.max}g</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Fiber</span><span className="font-semibold">{t.fiber}g+</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Exercise</span><span className="font-semibold">{t.exercisePerWeek}x / week</span></div>
        </div>
      </div>
    </div>
  );
}
