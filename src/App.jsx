import React, { useState, useMemo } from "react";
import {
  AlertTriangle, Activity, Thermometer, Droplet, Heart, Wind,
  Plus, ChevronRight, ChevronDown, ArrowLeft, CheckCircle2, Clock,
  Stethoscope, ClipboardCheck, ArrowDownCircle, Gauge,
} from "lucide-react";

/*
  Taimaka — ITP front-door triage (concept prototype)
  ---------------------------------------------------
  Sits at the door of the Inpatient Therapeutic Programme. Children arrive
  ALREADY referred from OTP, so the job is a sieve:
    Phase 1 — eyeball EMERGENCY GATE (no equipment): any one sign -> Emergency.
    Phase 2 — VITALS & ASSESSMENT: a tiered rule engine.

  Disposition is a TIERED OVERRIDE, not a weighted score. Every finding carries
  a severity (transition < acute < emergency). We collect ALL findings and route
  the child to their single HIGHEST-severity finding. No findings -> step down
  to OTP. The tool advises; the clinician decides.

  ⚠️  EVERY clinical number below is a PLACEHOLDER (standard WHO/IMCI-ish) and
  must be replaced with Taimaka's real CMAM / IMCI / national-guideline values.
  They all live in the CLINICAL CONFIG block immediately below so they can be
  edited in one place. Keep units in sync with thresholds. The acute-vs-transition
  weighting is a deliberate scaffold, NOT validated clinical logic.

  No database — everything is in memory for the demo.
*/

// ============================================================================
//  CLINICAL CONFIG  — ALL PLACEHOLDER VALUES. Edit here.
// ============================================================================

// Severity ranking. Higher number = more severe = wins the routing tie-break.
const TIER_RANK = { transition: 1, acute: 2, emergency: 3 };

// Map a finding's tier to a vitals-cell colour band.
const TIER_BAND = { none: "green", transition: "amber", acute: "red", emergency: "red" };

// IMCI fast-breathing cut-off (breaths/min) by age.
const rrFastThreshold = (ageMonths) =>
  (ageMonths != null && ageMonths !== "" && Number(ageMonths) < 12 ? 50 : 40);

// helper for the per-vital evaluators below
const f = (tier, finding) => ({ tier, finding });

// Phase 1 — EMERGENCY GATE. Any one "Yes" => Emergency (skip vitals).
const EMERGENCY_GATE = [
  {
    key: "airwayBreathing",
    title: "Airway or breathing problem",
    finding: "Airway / breathing compromise",
    look: [
      "Is the child breathing at all?",
      "Is the airway obstructed?",
      "Blue lips or tongue (central cyanosis)?",
      "Severe respiratory distress?",
    ],
  },
  {
    key: "shock",
    title: "Circulation impairment (shock)",
    finding: "Circulatory shock",
    look: [
      "Cold hands?",
      "Capillary refill longer than 3 seconds?",
      "Weak and rapid pulse?",
    ],
  },
  {
    key: "comaSeizure",
    title: "Seizure / convulsion or coma",
    finding: "Coma or active seizure",
    look: [
      "Not alert on AVPU?",
      "No response to voice or to pain?",
      "Convulsing right now?",
    ],
  },
  {
    key: "severeDehydration",
    title: "Severe dehydration",
    finding: "Severe dehydration",
    look: [
      "Diarrhoea, vomiting, or poor fluid intake (malaise / fever)?",
      "PLUS any one of:",
      "• Lethargic or unconscious",
      "• Sunken eyes",
      "• Skin pinch goes back very slowly (> 2s)",
    ],
  },
];

// Phase 2 — VITALS. Each evaluator returns {tier, finding} or null (= normal).
// Order here is the on-screen order.
const VITALS = [
  {
    key: "hr", label: "Heart rate", unit: "bpm", icon: Heart,
    tier(v) {
      if (v < 80) return f("emergency", "Bradycardia (very low heart rate)");
      if (v > 180) return f("emergency", "Very high heart rate");
      if (v > 160) return f("acute", "High heart rate");
      return null;
    },
  },
  {
    key: "rr", label: "Resp. rate", unit: "/min", icon: Wind,
    tier(v, ageMonths) {
      const t = rrFastThreshold(ageMonths);
      if (v < 20) return f("emergency", "Very low respiratory rate");
      if (v >= t + 20) return f("emergency", "Severe fast breathing");
      if (v >= t) return f("acute", "Fast breathing");
      return null;
    },
  },
  {
    key: "spo2", label: "SpO₂", unit: "%", icon: Gauge, hint: "if oximeter available",
    tier(v) {
      if (v < 90) return f("emergency", "Severe hypoxaemia");
      if (v < 94) return f("acute", "Hypoxaemia");
      if (v < 96) return f("transition", "Borderline oxygen saturation");
      return null;
    },
  },
  {
    key: "temp", label: "Temp", unit: "°C", icon: Thermometer,
    tier(v) {
      if (v < 35.0) return f("emergency", "Severe hypothermia");
      if (v < 36.0) return f("acute", "Hypothermia");
      if (v < 36.5) return f("transition", "Low temperature");
      if (v <= 37.5) return null;
      if (v < 39.0) return f("acute", "Fever");
      return f("emergency", "High fever");
    },
  },
  {
    key: "pcv", label: "PCV", unit: "%", icon: Activity, hint: "packed cell volume — anaemia",
    tier(v) {
      if (v < 12) return f("emergency", "Severe anaemia");
      if (v < 18) return f("acute", "Anaemia");
      if (v < 24) return f("transition", "Mild anaemia");
      return null;
    },
  },
  {
    key: "bloodSugar", label: "Blood sugar", unit: "mmol/L", icon: Droplet, hint: "random",
    tier(v) {
      if (v < 2.2) return f("emergency", "Severe hypoglycaemia");
      if (v < 3.0) return f("acute", "Hypoglycaemia (low blood sugar)");
      if (v < 3.5) return f("transition", "Borderline low blood sugar");
      return null;
    },
  },
];

// Phase 2 — other (non-vital) findings.
const APPETITE_FAIL = f("acute", "Failed appetite test");
const OEDEMA_TIER = {
  "+++": f("acute", "Bilateral oedema (+++)"),
  "++": f("acute", "Bilateral oedema (++)"),
  "+": f("transition", "Bilateral oedema (+)"),
  none: null,
};

// Dispositions: level -> label + ward + colours + board sort order.
const LEVEL = {
  emergency:  { label: "ITP · Emergency",     ward: "ICU / resuscitation — call clinician now", order: 0, bar: "bg-red-600",     chip: "bg-red-600 text-white",    soft: "bg-red-50 text-red-700 border-red-200",          ring: "ring-red-200",     border: "border-red-400",     icon: AlertTriangle },
  pending:    { label: "Awaiting assessment", ward: "—",                                         order: 1, bar: "bg-slate-400",   chip: "bg-slate-600 text-white",  soft: "bg-slate-50 text-slate-600 border-slate-200",    ring: "ring-slate-200",   border: "border-slate-300",   icon: Clock },
  acute:      { label: "ITP · Acute",         ward: "Admit — acute / Phase 1 stabilisation",     order: 2, bar: "bg-orange-500",  chip: "bg-orange-500 text-white", soft: "bg-orange-50 text-orange-800 border-orange-200", ring: "ring-orange-200",  border: "border-orange-400",  icon: Activity },
  transition: { label: "ITP · Transition",    ward: "Admit — transition phase",                  order: 3, bar: "bg-amber-500",   chip: "bg-amber-500 text-white",  soft: "bg-amber-50 text-amber-800 border-amber-200",    ring: "ring-amber-200",   border: "border-amber-400",   icon: Activity },
  stepdown:   { label: "Step-down to OTP",    ward: "Step down to OTP — pending doctor sign-off", order: 4, bar: "bg-emerald-600", chip: "bg-emerald-600 text-white",soft: "bg-emerald-50 text-emerald-700 border-emerald-200",ring: "ring-emerald-200", border: "border-emerald-400", icon: ArrowDownCircle },
};

// Tier badge colours for the findings list.
const TIER_BADGE = {
  emergency:  "bg-red-50 text-red-700 border-red-200",
  acute:      "bg-orange-50 text-orange-800 border-orange-200",
  transition: "bg-amber-50 text-amber-800 border-amber-200",
};
const TIER_LABEL = { emergency: "Emergency", acute: "Acute", transition: "Transition" };

// ============================================================================
//  END CLINICAL CONFIG
// ============================================================================

const bandClasses = {
  green: "bg-emerald-50 text-emerald-700 border-emerald-200",
  amber: "bg-amber-50 text-amber-800 border-amber-200",
  red: "bg-red-50 text-red-700 border-red-200",
  null: "bg-slate-50 text-slate-400 border-slate-200",
};

// Evaluate one vital. Returns {tier, finding} for an abnormal value,
// {tier:"none"} for a normal value, or null when there's no value.
function evalVital(vital, rawValue, ageMonths) {
  if (rawValue == null || rawValue === "" || isNaN(rawValue)) return null;
  const res = vital.tier(Number(rawValue), ageMonths);
  return res || { tier: "none" };
}

// Colour band for a vitals cell.
function vitalBand(vital, rawValue, ageMonths) {
  const r = evalVital(vital, rawValue, ageMonths);
  return r ? TIER_BAND[r.tier] : null;
}

// ---------- disposition engine ----------
function disposition(p) {
  // Phase 1 — emergency gate override.
  const gateReasons = EMERGENCY_GATE
    .filter((g) => p.gate && p.gate[g.key] === true)
    .map((g) => ({ tier: "emergency", label: g.finding }));
  if (gateReasons.length) {
    return { level: "emergency", findings: gateReasons, ward: LEVEL.emergency.ward };
  }

  // Interim — gate clear but vitals not entered yet.
  if (!p.assessed) {
    return { level: "pending", findings: [{ tier: "pending", label: "Awaiting full assessment" }], ward: LEVEL.pending.ward };
  }

  // Phase 2 — collect every finding with its tier.
  const findings = [];
  VITALS.forEach((vital) => {
    const r = evalVital(vital, p.vitals?.[vital.key], p.ageMonths);
    if (r && r.tier !== "none") findings.push({ tier: r.tier, label: r.finding });
  });
  if (p.appetite === "fail") findings.push({ ...APPETITE_FAIL, label: APPETITE_FAIL.finding });
  const oed = OEDEMA_TIER[p.oedema];
  if (oed) findings.push({ tier: oed.tier, label: oed.finding });

  if (!findings.length) {
    return {
      level: "stepdown",
      findings: [{ tier: "stepdown", label: "No inpatient criteria met — clinically well, appetite intact" }],
      ward: LEVEL.stepdown.ward,
    };
  }

  // Route to the single highest-severity finding.
  findings.sort((a, b) => TIER_RANK[b.tier] - TIER_RANK[a.tier]);
  const level = findings[0].tier;
  return { level, findings, ward: LEVEL[level].ward };
}

// ---------- seed data ----------
const now = Date.now();
const mins = (m) => new Date(now - m * 60000);
let _id = 0;
const nid = () => `p${++_id}`;

const seed = [
  {
    // Emergency via gate — convulsing on arrival, no vitals needed.
    id: nid(), name: "Aisha B.", ageMonths: 14, sex: "F", arrival: mins(6),
    gate: { airwayBreathing: false, shock: false, comaSeizure: true, severeDehydration: false },
    oedema: "none", appetite: null, vitals: {}, assessed: false,
  },
  {
    // Acute — multiple acute findings (hypothermia, hypoxaemia, anaemia, failed appetite).
    id: nid(), name: "Musa A.", ageMonths: 9, sex: "M", arrival: mins(22),
    gate: { airwayBreathing: false, shock: false, comaSeizure: false, severeDehydration: false },
    oedema: "++", appetite: "fail",
    vitals: { hr: 168, rr: 44, spo2: 92, temp: 35.8, pcv: 16, bloodSugar: 4.0 }, assessed: true,
  },
  {
    // Transition — only transition-tier findings (mild anaemia, borderline SpO₂, oedema +).
    id: nid(), name: "Fatima S.", ageMonths: 30, sex: "F", arrival: mins(40),
    gate: { airwayBreathing: false, shock: false, comaSeizure: false, severeDehydration: false },
    oedema: "+", appetite: "pass",
    vitals: { hr: 120, rr: 30, spo2: 95, temp: 37.0, pcv: 22, bloodSugar: 4.4 }, assessed: true,
  },
  {
    // Step-down — everything normal, appetite intact.
    id: nid(), name: "Hadiza K.", ageMonths: 36, sex: "F", arrival: mins(52),
    gate: { airwayBreathing: false, shock: false, comaSeizure: false, severeDehydration: false },
    oedema: "none", appetite: "pass",
    vitals: { hr: 110, rr: 28, spo2: 98, temp: 37.0, pcv: 31, bloodSugar: 5.1 }, assessed: true,
  },
  {
    // Pending — gate clear, vitals not yet entered.
    id: nid(), name: "Yusuf I.", ageMonths: 18, sex: "M", arrival: mins(15),
    gate: { airwayBreathing: false, shock: false, comaSeizure: false, severeDehydration: false },
    oedema: "none", appetite: null, vitals: {}, assessed: false,
  },
];

// ---------- small UI helpers ----------
function waitLabel(arrival) {
  const m = Math.max(0, Math.round((Date.now() - new Date(arrival).getTime()) / 60000));
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function VitalInput({ vital, value, onChange, ageMonths }) {
  const Icon = vital.icon;
  const b = vitalBand(vital, value, ageMonths);
  return (
    <div className={`rounded-xl border p-3 transition ${b ? bandClasses[b] : bandClasses.null}`}>
      <div className="flex items-center gap-1.5 text-xs font-medium opacity-80">
        <Icon className="h-3.5 w-3.5" /> {vital.label}
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <input
          type="number"
          inputMode="decimal"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
          placeholder="—"
          className="w-full bg-transparent text-2xl font-semibold tabular-nums outline-none placeholder:text-slate-300"
        />
        <span className="text-xs font-medium opacity-70">{vital.unit}</span>
      </div>
      {vital.hint && <div className="mt-0.5 text-[10px] leading-tight opacity-60">{vital.hint}</div>}
    </div>
  );
}

// ---------- main ----------
export default function App() {
  const [patients, setPatients] = useState(seed);
  const [view, setView] = useState("board"); // board | arrival | gate | assess | result
  const [draft, setDraft] = useState(null);

  const grouped = useMemo(() => {
    const withDisp = patients.map((p) => ({ ...p, disp: disposition(p) }));
    withDisp.sort((a, b) => {
      const o = LEVEL[a.disp.level].order - LEVEL[b.disp.level].order;
      if (o !== 0) return o;
      return new Date(a.arrival) - new Date(b.arrival); // longest waiting first
    });
    const buckets = { emergency: [], pending: [], acute: [], transition: [], stepdown: [] };
    withDisp.forEach((p) => buckets[p.disp.level].push(p));
    return buckets;
  }, [patients]);

  const counts = {
    emergency: grouped.emergency.length,
    pending: grouped.pending.length,
    acute: grouped.acute.length,
    transition: grouped.transition.length,
    stepdown: grouped.stepdown.length,
  };

  function startArrival() {
    setDraft({
      id: nid(), name: "", ageMonths: "", sex: "", arrival: new Date(),
      gate: {}, oedema: "none", appetite: null, vitals: {}, assessed: false,
    });
    setView("arrival");
  }

  function openPatient(p) {
    setDraft({ ...p });
    setView(p.assessed || disposition(p).level === "emergency" ? "result" : "assess");
  }

  function commit(updated) {
    setPatients((prev) => {
      const exists = prev.some((x) => x.id === updated.id);
      return exists ? prev.map((x) => (x.id === updated.id ? updated : x)) : [...prev, updated];
    });
  }

  return (
    <div className="min-h-screen w-full bg-slate-100 font-sans text-slate-900">
      <div className="mx-auto max-w-md pb-24">
        {/* Header */}
        <header className="sticky top-0 z-10 bg-teal-900 px-5 pb-4 pt-5 text-white shadow-sm">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-white/15">
              <Stethoscope className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-semibold leading-tight">Taimaka · ITP Triage</div>
              <div className="text-[11px] text-teal-200">Inpatient front-door sieve</div>
            </div>
          </div>
        </header>

        {view === "board" && (
          <Board grouped={grouped} counts={counts} onOpen={openPatient} onNew={startArrival} />
        )}
        {view === "arrival" && (
          <ArrivalForm draft={draft} setDraft={setDraft} onBack={() => setView("board")} onNext={() => setView("gate")} />
        )}
        {view === "gate" && (
          <EmergencyGate
            draft={draft}
            setDraft={setDraft}
            onBack={() => setView("arrival")}
            onEmergency={() => { commit(draft); setView("board"); }}
            onContinue={() => setView("assess")}
          />
        )}
        {view === "assess" && (
          <Assessment
            draft={draft}
            setDraft={setDraft}
            onBack={() => setView(draft.name ? "board" : "gate")}
            onFinish={() => { const d = { ...draft, assessed: true }; setDraft(d); commit(d); setView("result"); }}
          />
        )}
        {view === "result" && (
          <Result draft={draft} onBack={() => setView("board")} />
        )}
      </div>
    </div>
  );
}

// ---------- Board ----------
function Board({ grouped, counts, onOpen, onNew }) {
  const total = counts.emergency + counts.pending + counts.acute + counts.transition + counts.stepdown;
  return (
    <div className="px-4 pt-4">
      {/* summary strip */}
      <div className="mb-4 grid grid-cols-5 gap-1.5">
        {[
          ["emergency", counts.emergency],
          ["pending", counts.pending],
          ["acute", counts.acute],
          ["transition", counts.transition],
          ["stepdown", counts.stepdown],
        ].map(([lvl, n]) => (
          <div key={lvl} className={`rounded-xl border px-1 py-2 text-center ${LEVEL[lvl].soft}`}>
            <div className="text-xl font-bold tabular-nums">{n}</div>
            <div className="text-[9px] font-medium leading-tight opacity-80">{LEVEL[lvl].label}</div>
          </div>
        ))}
      </div>

      {total === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <ClipboardCheck className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-3 text-sm font-medium text-slate-700">No children in triage</p>
          <p className="mt-1 text-xs text-slate-500">Log the first arrival to begin sieving.</p>
        </div>
      )}

      <Section title="Emergency — act now" items={grouped.emergency} onOpen={onOpen} />
      <Section title="Awaiting assessment" items={grouped.pending} onOpen={onOpen} />
      <Section title="ITP · Acute — admit" items={grouped.acute} onOpen={onOpen} />
      <Section title="ITP · Transition — admit" items={grouped.transition} onOpen={onOpen} />
      <Section title="Step-down candidates" items={grouped.stepdown} onOpen={onOpen} />

      {/* floating new-arrival */}
      <div className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md px-4 pb-4">
        <button
          onClick={onNew}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-teal-700 py-3.5 text-sm font-semibold text-white shadow-lg shadow-teal-900/20 transition hover:bg-teal-800 active:scale-[0.99]"
        >
          <Plus className="h-5 w-5" /> New arrival
        </button>
      </div>
    </div>
  );
}

function Section({ title, items, onOpen }) {
  if (!items.length) return null;
  return (
    <div className="mb-5">
      <h2 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
      <div className="space-y-2">
        {items.map((p) => (
          <PatientCard key={p.id} p={p} onOpen={onOpen} />
        ))}
      </div>
    </div>
  );
}

function PatientCard({ p, onOpen }) {
  const lvl = LEVEL[p.disp.level];
  const isEmergency = p.disp.level === "emergency";
  return (
    <button
      onClick={() => onOpen(p)}
      className={`relative flex w-full items-stretch overflow-hidden rounded-xl border bg-white text-left shadow-sm transition hover:shadow-md ${
        isEmergency ? "border-red-300 ring-2 ring-red-200" : "border-slate-200"
      }`}
    >
      <div className={`w-1.5 shrink-0 ${lvl.bar} ${isEmergency ? "animate-pulse" : ""}`} />
      <div className="flex-1 px-3.5 py-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-900">{p.name || "Unnamed"}</span>
              <span className="text-xs text-slate-400">{p.ageMonths}mo · {p.sex || "—"}</span>
            </div>
            <div className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-400">
              <Clock className="h-3 w-3" /> waiting {waitLabel(p.arrival)}
            </div>
          </div>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${lvl.chip}`}>{lvl.label}</span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {p.disp.findings.slice(0, 2).map((r, i) => (
            <span key={i} className={`rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${lvl.soft}`}>{r.label}</span>
          ))}
          {p.disp.findings.length > 2 && (
            <span className="text-[10px] text-slate-400">+{p.disp.findings.length - 2}</span>
          )}
        </div>
        <div className="mt-2 flex items-center gap-1 text-[11px] font-medium text-slate-600">
          <ChevronRight className="h-3.5 w-3.5 text-slate-300" />
          {p.disp.ward}
        </div>
      </div>
    </button>
  );
}

// ---------- Arrival ----------
function ArrivalForm({ draft, setDraft, onBack, onNext }) {
  const ok = draft.name.trim() && draft.ageMonths !== "" && !isNaN(draft.ageMonths);
  return (
    <FlowShell step={1} onBack={onBack} title="New arrival" subtitle="Referred from OTP — log first, sieve next">
      <div className="space-y-4">
        <Field label="Name or ID">
          <input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="e.g. Aisha B. / OTP-2041"
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Age (months)">
            <input
              type="number" inputMode="numeric"
              value={draft.ageMonths}
              onChange={(e) => setDraft({ ...draft, ageMonths: e.target.value === "" ? "" : Number(e.target.value) })}
              placeholder="0–59"
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            />
          </Field>
          <Field label="Sex">
            <div className="flex gap-2">
              {["M", "F"].map((s) => (
                <button key={s} onClick={() => setDraft({ ...draft, sex: s })}
                  className={`flex-1 rounded-xl border py-3 text-sm font-medium transition ${draft.sex === s ? "border-teal-600 bg-teal-50 text-teal-800" : "border-slate-200 text-slate-600"}`}>
                  {s === "M" ? "Male" : "Female"}
                </button>
              ))}
            </div>
          </Field>
        </div>
      </div>
      <PrimaryBtn disabled={!ok} onClick={onNext}>Continue to emergency check <ChevronRight className="h-4 w-4" /></PrimaryBtn>
    </FlowShell>
  );
}

// ---------- Emergency gate ----------
function GateCategory({ cat, value, onSet }) {
  const [open, setOpen] = useState(false);
  const yes = value === true;
  const no = value === false;
  return (
    <div className={`rounded-xl border transition ${yes ? "border-red-500 bg-red-50 ring-2 ring-red-200" : "border-slate-200 bg-white"}`}>
      <div className="px-4 pt-3">
        <div className={`text-sm font-medium ${yes ? "text-red-800" : "text-slate-800"}`}>{cat.title}</div>
        <div className="mt-0.5 text-xs text-slate-500">Can you see signs of this?</div>
      </div>
      <div className="grid grid-cols-2 gap-2 px-4 pb-3 pt-2">
        <button onClick={() => onSet(true)}
          className={`rounded-lg border py-2 text-sm font-semibold transition ${yes ? "border-red-500 bg-red-600 text-white" : "border-slate-200 text-slate-600 hover:border-red-300"}`}>
          Yes
        </button>
        <button onClick={() => onSet(false)}
          className={`rounded-lg border py-2 text-sm font-semibold transition ${no ? "border-emerald-500 bg-emerald-600 text-white" : "border-slate-200 text-slate-600 hover:border-emerald-300"}`}>
          No
        </button>
      </div>
      <button onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between border-t border-slate-100 px-4 py-2 text-[11px] font-medium text-slate-500">
        <span>What to look for</span>
        <ChevronDown className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ul className="space-y-1 px-4 pb-3 text-xs text-slate-600">
          {cat.look.map((l, i) => (
            <li key={i} className={l.startsWith("•") || l.startsWith("PLUS") ? "" : "before:mr-1.5 before:text-slate-300 before:content-['–']"}>{l}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EmergencyGate({ draft, setDraft, onBack, onEmergency, onContinue }) {
  const anyYes = EMERGENCY_GATE.some((g) => draft.gate[g.key] === true);
  const allAnswered = EMERGENCY_GATE.every((g) => draft.gate[g.key] === true || draft.gate[g.key] === false);
  const set = (k, val) => setDraft({ ...draft, gate: { ...draft.gate, [k]: val } });
  return (
    <FlowShell step={2} onBack={onBack} title="Emergency signs" subtitle="Eyeball check — no equipment needed">
      <div className="mb-4 flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2.5 text-xs text-red-700">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>If <strong>any one</strong> sign is present, the child goes straight to emergency — skip the rest.</span>
      </div>
      <div className="space-y-2.5">
        {EMERGENCY_GATE.map((cat) => (
          <GateCategory key={cat.key} cat={cat} value={draft.gate[cat.key]} onSet={(v) => set(cat.key, v)} />
        ))}
      </div>
      <div className="mt-4 flex items-start gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-[11px] text-slate-500">
        <Activity className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>Severe anaemia, hypothermia and hypoglycaemia <strong>can't be eyeballed</strong> — they're detected automatically from the vitals on the next screen.</span>
      </div>
      {anyYes ? (
        <PrimaryBtn danger onClick={onEmergency}>
          <AlertTriangle className="h-4 w-4" /> Log & send to emergency now
        </PrimaryBtn>
      ) : (
        <PrimaryBtn disabled={!allAnswered} onClick={onContinue}>No emergency signs — continue assessment <ChevronRight className="h-4 w-4" /></PrimaryBtn>
      )}
      {!anyYes && !allAnswered && <p className="mt-2 text-center text-[11px] text-slate-400">Answer all four to continue.</p>}
    </FlowShell>
  );
}

// ---------- Full assessment ----------
function Assessment({ draft, setDraft, onBack, onFinish }) {
  const set = (patch) => setDraft({ ...draft, ...patch });
  const setVital = (k, v) => set({ vitals: { ...draft.vitals, [k]: v } });
  const ok = draft.appetite != null;

  return (
    <FlowShell step={3} onBack={onBack} title="Vitals & assessment" subtitle={`${draft.name || "Patient"} · ${draft.ageMonths}mo`}>
      <Group title="Vitals">
        <div className="grid grid-cols-2 gap-2">
          {VITALS.map((vital) => (
            <VitalInput
              key={vital.key}
              vital={vital}
              value={draft.vitals[vital.key]}
              onChange={(v) => setVital(vital.key, v)}
              ageMonths={draft.ageMonths}
            />
          ))}
        </div>
        <p className="mt-1.5 text-[11px] text-slate-400">Cells colour live as you type. PCV detects anaemia; temp and blood sugar detect hypothermia and hypoglycaemia.</p>
      </Group>

      <Group title="Appetite test (RUTF)">
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => set({ appetite: "pass" })}
            className={`rounded-xl border py-3.5 text-sm font-semibold transition ${draft.appetite === "pass" ? "border-emerald-600 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-500"}`}>
            Passed
          </button>
          <button onClick={() => set({ appetite: "fail" })}
            className={`rounded-xl border py-3.5 text-sm font-semibold transition ${draft.appetite === "fail" ? "border-orange-500 bg-orange-50 text-orange-700" : "border-slate-200 text-slate-500"}`}>
            Failed
          </button>
        </div>
        <p className="mt-1.5 text-[11px] text-slate-400">A failed appetite test is an acute finding. This is the key sieve question.</p>
      </Group>

      <Group title="Bilateral pitting oedema">
        <div className="grid grid-cols-4 gap-2">
          {[["none", "None"], ["+", "+"], ["++", "++"], ["+++", "+++"]].map(([v, lab]) => {
            const active = draft.oedema === v;
            const acute = active && (v === "++" || v === "+++");
            const trans = active && v === "+";
            return (
              <button key={v} onClick={() => set({ oedema: v })}
                className={`rounded-xl border py-3 text-sm font-semibold transition ${
                  acute ? "border-orange-500 bg-orange-50 text-orange-700"
                    : trans ? "border-amber-500 bg-amber-50 text-amber-700"
                    : active ? "border-teal-600 bg-teal-50 text-teal-800"
                    : "border-slate-200 text-slate-500"
                }`}>
                {lab}
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-[11px] text-slate-400">++ / +++ are acute findings; + is a transition finding.</p>
      </Group>

      <PrimaryBtn disabled={!ok} onClick={onFinish}>
        <ClipboardCheck className="h-4 w-4" /> Save & view disposition
      </PrimaryBtn>
      {!ok && <p className="mt-2 text-center text-[11px] text-slate-400">Record the appetite test to continue.</p>}
    </FlowShell>
  );
}

// ---------- Result ----------
function Result({ draft, onBack }) {
  const disp = disposition(draft);
  const lvl = LEVEL[disp.level];
  const Icon = lvl.icon;
  const routed = disp.level !== "stepdown" && disp.level !== "pending";

  const v = draft.vitals || {};
  const vitalRows = VITALS
    .map((vital) => ({ vital, value: v[vital.key], band: vitalBand(vital, v[vital.key], draft.ageMonths) }))
    .filter((r) => r.value != null && r.value !== "");

  return (
    <div className="px-4 pt-4">
      <button onClick={onBack} className="mb-3 flex items-center gap-1 text-sm font-medium text-slate-500">
        <ArrowLeft className="h-4 w-4" /> Board
      </button>

      {/* disposition banner */}
      <div className={`rounded-2xl border-2 p-5 ${lvl.soft} ${lvl.border}`}>
        <div className="flex items-center gap-2">
          <Icon className="h-6 w-6" />
          <span className="text-lg font-bold">{lvl.label}</span>
        </div>
        <div className="mt-1 text-sm font-medium opacity-90">{disp.ward}</div>
      </div>

      {/* patient */}
      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <div className="text-base font-semibold">{draft.name || "Unnamed"}</div>
          <div className="text-xs text-slate-400">{draft.ageMonths}mo · {draft.sex || "—"} · waiting {waitLabel(draft.arrival)}</div>
        </div>

        <h3 className="mt-4 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          <span>Findings</span>
          {routed && <span className="font-medium normal-case tracking-normal text-slate-400">routed to the highest-severity finding</span>}
        </h3>
        <ul className="mt-2 space-y-1.5">
          {disp.findings.map((r, i) => {
            const isTop = routed && i === 0;
            return (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                <span className={`mt-0.5 shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold ${TIER_BADGE[r.tier] || "bg-slate-50 text-slate-500 border-slate-200"}`}>
                  {TIER_LABEL[r.tier] || "—"}
                </span>
                <span className={isTop ? "font-medium" : ""}>{r.label}{isTop && <span className="ml-1 text-[11px] font-normal text-slate-400">(routes disposition)</span>}</span>
              </li>
            );
          })}
        </ul>

        {vitalRows.length > 0 && (
          <>
            <h3 className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Vitals</h3>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {vitalRows.map(({ vital, value, band }) => (
                <div key={vital.key} className={`rounded-lg border px-2.5 py-2 ${band ? bandClasses[band] : bandClasses.null}`}>
                  <div className="text-[10px] font-medium opacity-70">{vital.label}</div>
                  <div className="text-base font-semibold tabular-nums">{value}<span className="ml-0.5 text-[10px] font-normal opacity-60">{vital.unit}</span></div>
                </div>
              ))}
            </div>
          </>
        )}

        {disp.level === "stepdown" && (
          <div className="mt-4 flex items-start gap-2 rounded-xl bg-emerald-50 px-3 py-2.5 text-xs text-emerald-800">
            <Stethoscope className="mt-0.5 h-4 w-4 shrink-0" />
            <span>The tool advises — the clinician decides. This child needs a <strong>doctor's go-ahead</strong> before stepping down to OTP.</span>
          </div>
        )}
      </div>

      <button onClick={onBack} className="mt-4 mb-6 w-full rounded-2xl bg-teal-700 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800">
        Done — back to board
      </button>
    </div>
  );
}

// ---------- layout primitives ----------
function FlowShell({ step, title, subtitle, onBack, children }) {
  return (
    <div className="px-4 pb-8 pt-4">
      <button onClick={onBack} className="mb-3 flex items-center gap-1 text-sm font-medium text-slate-500">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>
      <div className="mb-1 flex items-center gap-2">
        {[1, 2, 3].map((s) => (
          <div key={s} className={`h-1.5 flex-1 rounded-full ${s <= step ? "bg-teal-600" : "bg-slate-200"}`} />
        ))}
      </div>
      <h1 className="mt-3 text-xl font-bold text-slate-900">{title}</h1>
      {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
      <div className="mt-5">{children}</div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-slate-500">{label}</label>
      {children}
    </div>
  );
}

function Group({ title, children }) {
  return (
    <div className="mb-5">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      {children}
    </div>
  );
}

function PrimaryBtn({ children, onClick, disabled, danger }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`mt-6 flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-semibold text-white shadow-sm transition active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-300 ${
        danger ? "bg-red-600 hover:bg-red-700" : "bg-teal-700 hover:bg-teal-800"
      }`}
    >
      {children}
    </button>
  );
}
