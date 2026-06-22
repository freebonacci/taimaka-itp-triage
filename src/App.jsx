import React, { useState, useMemo } from "react";
import {
  AlertTriangle, Activity, Thermometer, Droplet, Heart, Wind,
  Plus, ChevronRight, ArrowLeft, CheckCircle2, Clock, Ruler,
  Stethoscope, Baby, ClipboardCheck, ArrowDownCircle, Gauge,
} from "lucide-react";

/*
  Taimaka — ITP front-door triage (concept prototype)
  ---------------------------------------------------
  Sits at the door of the Inpatient Therapeutic Programme. Children arrive
  ALREADY referred from OTP, so the job is a sieve:
    1. Catch genuinely critical children immediately (emergency gate, no vitals).
    2. Re-assess everyone else -> confirm ITP need, or step back down to OTP.

  Disposition is an OVERRIDE HIERARCHY (not a weighted score), per WHO ETAT:
    - Any one emergency sign  -> EMERGENCY
    - else any WHO inpatient trigger (danger sign / oedema +++ / failed appetite
      test / priority sign / red vital) -> CONFIRMED ITP
    - else (clinically well, appetite intact) -> STEP-DOWN CANDIDATE (pending doctor)

  All thresholds below are STANDARD WHO PLACEHOLDERS and must be validated
  against Taimaka's own protocols and the Nigerian national CMAM/IMCI guidelines.
  No database — everything is in memory for the demo.
*/

// ---------- clinical thresholds (placeholders) ----------
function rrThreshold(ageMonths) {
  // IMCI fast-breathing cut-offs
  if (ageMonths != null && ageMonths < 12) return 50;
  return 40;
}

// returns "green" | "amber" | "red" | null
function band(metric, value, ageMonths) {
  if (value == null || value === "" || isNaN(value)) return null;
  const v = Number(value);
  switch (metric) {
    case "bloodSugar": // mmol/L
      if (v < 3) return "red";
      if (v < 4) return "amber";
      return "green";
    case "temp": // °C
      if (v < 35 || v >= 39) return "red";
      if (v < 36.5 || v > 37.5) return "amber";
      return "green";
    case "rr": {
      const t = rrThreshold(ageMonths);
      if (v >= t + 20 || v < 20) return "red";
      if (v >= t) return "amber";
      return "green";
    }
    case "hr":
      if (v > 180 || v < 80) return "red";
      if (v > 160) return "amber";
      return "green";
    case "spo2":
      if (v < 90) return "red";
      if (v < 94) return "amber";
      return "green";
    case "muac": // mm — context only, NOT an ITP trigger on its own
      if (v < 115) return "red";
      if (v < 125) return "amber";
      return "green";
    default:
      return null;
  }
}

const EMERGENCY_FIELDS = [
  ["airwayBreathing", "Airway / breathing compromise", "Obstructed or absent breathing, severe distress, or central cyanosis"],
  ["shock", "Signs of shock", "Cold hands + capillary refill > 3s + weak, fast pulse"],
  ["coma", "Coma / reduced consciousness", "Unconscious or not responding normally"],
  ["convulsing", "Convulsing now", "Active seizure on arrival"],
  ["severeDehydration", "Severe dehydration (with diarrhoea)", "Lethargy, sunken eyes, very slow skin pinch"],
];

const DANGER_FIELDS = [
  ["cannotDrink", "Not able to drink or breastfeed"],
  ["vomitsEverything", "Vomits everything"],
  ["convulsionsHistory", "Convulsions (this illness)"],
  ["lethargic", "Lethargic or unconscious"],
];

const PRIORITY_FIELDS = [
  ["smallInfant", "Small infant (under 6 months)"],
  ["severePallor", "Severe palmar pallor"],
  ["respiratoryDistress", "Respiratory distress"],
  ["restlessIrritable", "Restless / irritable"],
];

// ---------- disposition engine ----------
function disposition(p) {
  // 1. Emergency override
  const eReasons = EMERGENCY_FIELDS
    .filter(([k]) => p.emergency[k])
    .map(([, label]) => label);
  if (eReasons.length) {
    return { level: "emergency", reasons: eReasons, ward: "Resuscitation / emergency bay — call clinician now" };
  }

  // 2. Not yet fully assessed
  if (!p.assessed) {
    return { level: "pending", reasons: ["Awaiting full assessment"], ward: "—" };
  }

  // 3. Inpatient (ITP) triggers
  const reasons = [];
  DANGER_FIELDS.forEach(([k, label]) => { if (p.danger[k]) reasons.push("Danger sign: " + label.toLowerCase()); });
  PRIORITY_FIELDS.forEach(([k, label]) => { if (p.priority[k]) reasons.push("Priority sign: " + label.toLowerCase()); });
  if (p.oedema === "+++") reasons.push("Severe bilateral oedema (+++)");
  if (p.appetite === "fail") reasons.push("Failed appetite test");

  const v = p.vitals;
  if (band("bloodSugar", v.bloodSugar) === "red") reasons.push("Hypoglycaemia (low blood sugar)");
  if (band("temp", v.temp) === "red") reasons.push(Number(v.temp) < 35 ? "Hypothermia" : "High fever");
  if (band("rr", v.rr, p.ageMonths) === "red") reasons.push("Severe respiratory rate");
  if (band("hr", v.hr) === "red") reasons.push("Abnormal heart rate");
  if (band("spo2", v.spo2) === "red") reasons.push("Hypoxaemia (low oxygen)");

  if (reasons.length) {
    return { level: "itp", reasons, ward: "Admit — inpatient stabilisation (ITP)" };
  }

  // 4. Step-down candidate
  return {
    level: "stepdown",
    reasons: ["No inpatient criteria met", "Appetite intact, clinically well & alert"],
    ward: "Step down to OTP — pending doctor sign-off",
  };
}

const LEVEL = {
  emergency: { label: "Emergency", bar: "bg-red-600", chip: "bg-red-600 text-white", soft: "bg-red-50 text-red-700 border-red-200", ring: "ring-red-200", order: 0 },
  pending:   { label: "Awaiting assessment", bar: "bg-slate-400", chip: "bg-slate-600 text-white", soft: "bg-slate-50 text-slate-600 border-slate-200", ring: "ring-slate-200", order: 1 },
  itp:       { label: "Confirmed ITP", bar: "bg-amber-500", chip: "bg-amber-500 text-white", soft: "bg-amber-50 text-amber-800 border-amber-200", ring: "ring-amber-200", order: 2 },
  stepdown:  { label: "Step-down candidate", bar: "bg-emerald-600", chip: "bg-emerald-600 text-white", soft: "bg-emerald-50 text-emerald-700 border-emerald-200", ring: "ring-emerald-200", order: 3 },
};

const bandClasses = {
  green: "bg-emerald-50 text-emerald-700 border-emerald-200",
  amber: "bg-amber-50 text-amber-800 border-amber-200",
  red: "bg-red-50 text-red-700 border-red-200",
  null: "bg-slate-50 text-slate-400 border-slate-200",
};

// ---------- seed data ----------
const now = Date.now();
const mins = (m) => new Date(now - m * 60000);
let _id = 0;
const nid = () => `p${++_id}`;

const seed = [
  {
    id: nid(), name: "Aisha B.", ageMonths: 14, sex: "F", arrival: mins(6),
    emergency: { airwayBreathing: false, shock: false, coma: false, convulsing: true, severeDehydration: false },
    danger: {}, priority: {}, oedema: "none", appetite: null, vitals: {}, assessed: false,
  },
  {
    id: nid(), name: "Musa A.", ageMonths: 9, sex: "M", arrival: mins(22),
    emergency: {}, danger: { lethargic: true }, priority: {}, oedema: "+", appetite: "fail",
    vitals: { bloodSugar: 2.4, temp: 35.8, hr: 168, rr: 56, spo2: 92, muac: 102, weight: 6.1 }, assessed: true,
  },
  {
    id: nid(), name: "Yusuf I.", ageMonths: 18, sex: "M", arrival: mins(15),
    emergency: {}, danger: {}, priority: {}, oedema: "none", appetite: null, vitals: {}, assessed: false,
  },
  {
    id: nid(), name: "Fatima S.", ageMonths: 30, sex: "F", arrival: mins(40),
    emergency: {}, danger: {}, priority: {}, oedema: "none", appetite: "pass",
    vitals: { bloodSugar: 5.1, temp: 37.0, hr: 120, rr: 30, spo2: 98, muac: 113, weight: 10.2 }, assessed: true,
  },
];

// ---------- small UI helpers ----------
function waitLabel(arrival) {
  const m = Math.max(0, Math.round((Date.now() - new Date(arrival).getTime()) / 60000));
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function Toggle({ active, onClick, title, sub, danger }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-xl border px-4 py-3 transition ${
        active
          ? danger
            ? "border-red-500 bg-red-50 ring-2 ring-red-200"
            : "border-amber-500 bg-amber-50 ring-2 ring-amber-200"
          : "border-slate-200 bg-white hover:border-slate-300"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className={`text-sm font-medium ${active ? (danger ? "text-red-800" : "text-amber-900") : "text-slate-800"}`}>{title}</div>
          {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
        </div>
        <div className={`h-5 w-5 shrink-0 rounded-md border-2 ${active ? (danger ? "border-red-500 bg-red-500" : "border-amber-500 bg-amber-500") : "border-slate-300"}`}>
          {active && <CheckCircle2 className="h-full w-full text-white" strokeWidth={2.5} />}
        </div>
      </div>
    </button>
  );
}

function VitalInput({ icon: Icon, label, unit, metric, value, onChange, ageMonths, hint }) {
  const b = band(metric, value, ageMonths);
  return (
    <div className={`rounded-xl border p-3 transition ${b ? bandClasses[b] : bandClasses.null}`}>
      <div className="flex items-center gap-1.5 text-xs font-medium opacity-80">
        <Icon className="h-3.5 w-3.5" /> {label}
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
        <span className="text-xs font-medium opacity-70">{unit}</span>
      </div>
      {hint && <div className="mt-0.5 text-[10px] leading-tight opacity-60">{hint}</div>}
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
    const buckets = { emergency: [], pending: [], itp: [], stepdown: [] };
    withDisp.forEach((p) => buckets[p.disp.level].push(p));
    return buckets;
  }, [patients]);

  const counts = {
    emergency: grouped.emergency.length,
    pending: grouped.pending.length,
    itp: grouped.itp.length,
    stepdown: grouped.stepdown.length,
  };

  function startArrival() {
    setDraft({
      id: nid(), name: "", ageMonths: "", sex: "", arrival: new Date(),
      emergency: {}, danger: {}, priority: {}, oedema: "none", appetite: null, vitals: {}, assessed: false,
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
  const total = counts.emergency + counts.pending + counts.itp + counts.stepdown;
  return (
    <div className="px-4 pt-4">
      {/* summary strip */}
      <div className="mb-4 grid grid-cols-4 gap-2">
        {[
          ["emergency", counts.emergency],
          ["pending", counts.pending],
          ["itp", counts.itp],
          ["stepdown", counts.stepdown],
        ].map(([lvl, n]) => (
          <div key={lvl} className={`rounded-xl border px-2 py-2 text-center ${LEVEL[lvl].soft}`}>
            <div className="text-xl font-bold tabular-nums">{n}</div>
            <div className="text-[10px] font-medium leading-tight opacity-80">{LEVEL[lvl].label}</div>
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
      <Section title="Confirmed ITP — admit" items={grouped.itp} onOpen={onOpen} />
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
          {p.disp.reasons.slice(0, 2).map((r, i) => (
            <span key={i} className={`rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${lvl.soft}`}>{r}</span>
          ))}
          {p.disp.reasons.length > 2 && (
            <span className="text-[10px] text-slate-400">+{p.disp.reasons.length - 2}</span>
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
function EmergencyGate({ draft, setDraft, onBack, onEmergency, onContinue }) {
  const any = EMERGENCY_FIELDS.some(([k]) => draft.emergency[k]);
  const toggle = (k) => setDraft({ ...draft, emergency: { ...draft.emergency, [k]: !draft.emergency[k] } });
  return (
    <FlowShell step={2} onBack={onBack} title="Emergency signs" subtitle="15-second check — no vitals needed">
      <div className="mb-4 flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2.5 text-xs text-red-700">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>If <strong>any one</strong> sign is present, the child goes straight to emergency — skip the rest.</span>
      </div>
      <div className="space-y-2">
        {EMERGENCY_FIELDS.map(([k, title, sub]) => (
          <Toggle key={k} danger active={!!draft.emergency[k]} onClick={() => toggle(k)} title={title} sub={sub} />
        ))}
      </div>
      {any ? (
        <PrimaryBtn danger onClick={onEmergency}>
          <AlertTriangle className="h-4 w-4" /> Log & send to emergency now
        </PrimaryBtn>
      ) : (
        <PrimaryBtn onClick={onContinue}>No emergency signs — continue assessment <ChevronRight className="h-4 w-4" /></PrimaryBtn>
      )}
    </FlowShell>
  );
}

// ---------- Full assessment ----------
function Assessment({ draft, setDraft, onBack, onFinish }) {
  const set = (patch) => setDraft({ ...draft, ...patch });
  const setVital = (k, v) => set({ vitals: { ...draft.vitals, [k]: v } });
  const toggleDanger = (k) => set({ danger: { ...draft.danger, [k]: !draft.danger[k] } });
  const togglePriority = (k) => set({ priority: { ...draft.priority, [k]: !draft.priority[k] } });
  const ok = draft.appetite != null;

  return (
    <FlowShell step={3} onBack={onBack} title="Full assessment" subtitle={`${draft.name || "Patient"} · ${draft.ageMonths}mo`}>
      <Group title="IMCI danger signs">
        <div className="space-y-2">
          {DANGER_FIELDS.map(([k, label]) => (
            <Toggle key={k} active={!!draft.danger[k]} onClick={() => toggleDanger(k)} title={label} />
          ))}
        </div>
      </Group>

      <Group title="Priority signs">
        <div className="space-y-2">
          {PRIORITY_FIELDS.map(([k, label]) => (
            <Toggle key={k} active={!!draft.priority[k]} onClick={() => togglePriority(k)} title={label} />
          ))}
        </div>
      </Group>

      <Group title="Bilateral pitting oedema">
        <div className="grid grid-cols-4 gap-2">
          {[["none", "None"], ["+", "+"], ["++", "++"], ["+++", "+++"]].map(([v, lab]) => {
            const active = draft.oedema === v;
            const red = active && v === "+++";
            return (
              <button key={v} onClick={() => set({ oedema: v })}
                className={`rounded-xl border py-3 text-sm font-semibold transition ${
                  active ? (red ? "border-red-500 bg-red-50 text-red-700" : "border-teal-600 bg-teal-50 text-teal-800") : "border-slate-200 text-slate-500"
                }`}>
                {lab}
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-[11px] text-slate-400">+++ (face & body) is an automatic inpatient trigger.</p>
      </Group>

      <Group title="Appetite test (RUTF)">
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => set({ appetite: "pass" })}
            className={`rounded-xl border py-3.5 text-sm font-semibold transition ${draft.appetite === "pass" ? "border-emerald-600 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-500"}`}>
            Passed
          </button>
          <button onClick={() => set({ appetite: "fail" })}
            className={`rounded-xl border py-3.5 text-sm font-semibold transition ${draft.appetite === "fail" ? "border-red-500 bg-red-50 text-red-700" : "border-slate-200 text-slate-500"}`}>
            Failed
          </button>
        </div>
        <p className="mt-1.5 text-[11px] text-slate-400">A failed appetite test = inpatient care. This is the key sieve question.</p>
      </Group>

      <Group title="Vitals & measurements">
        <div className="grid grid-cols-2 gap-2">
          <VitalInput icon={Droplet} label="Blood sugar" unit="mmol/L" metric="bloodSugar" value={draft.vitals.bloodSugar} onChange={(v) => setVital("bloodSugar", v)} />
          <VitalInput icon={Thermometer} label="Temp" unit="°C" metric="temp" value={draft.vitals.temp} onChange={(v) => setVital("temp", v)} />
          <VitalInput icon={Heart} label="Heart rate" unit="bpm" metric="hr" value={draft.vitals.hr} onChange={(v) => setVital("hr", v)} />
          <VitalInput icon={Wind} label="Resp. rate" unit="/min" metric="rr" value={draft.vitals.rr} onChange={(v) => setVital("rr", v)} ageMonths={draft.ageMonths} />
          <VitalInput icon={Gauge} label="SpO₂" unit="%" metric="spo2" value={draft.vitals.spo2} onChange={(v) => setVital("spo2", v)} hint="if oximeter available" />
          <VitalInput icon={Ruler} label="MUAC" unit="mm" metric="muac" value={draft.vitals.muac} onChange={(v) => setVital("muac", v)} hint="context, not a trigger alone" />
        </div>
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
  const icon = { emergency: AlertTriangle, itp: ArrowDownCircle, stepdown: ArrowDownCircle, pending: Clock }[disp.level];
  const Icon = disp.level === "stepdown" ? ArrowDownCircle : icon;
  const v = draft.vitals;
  const vitalRows = [
    ["Blood sugar", v.bloodSugar, "mmol/L", band("bloodSugar", v.bloodSugar)],
    ["Temperature", v.temp, "°C", band("temp", v.temp)],
    ["Heart rate", v.hr, "bpm", band("hr", v.hr)],
    ["Resp. rate", v.rr, "/min", band("rr", v.rr, draft.ageMonths)],
    ["SpO₂", v.spo2, "%", band("spo2", v.spo2)],
    ["MUAC", v.muac, "mm", band("muac", v.muac)],
  ].filter((r) => r[1] != null && r[1] !== "");

  return (
    <div className="px-4 pt-4">
      <button onClick={onBack} className="mb-3 flex items-center gap-1 text-sm font-medium text-slate-500">
        <ArrowLeft className="h-4 w-4" /> Board
      </button>

      {/* disposition banner */}
      <div className={`rounded-2xl border-2 p-5 ${lvl.soft.replace("50", "50")} ${disp.level === "emergency" ? "border-red-400" : disp.level === "itp" ? "border-amber-400" : disp.level === "stepdown" ? "border-emerald-400" : "border-slate-300"}`}>
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

        <h3 className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Why this disposition</h3>
        <ul className="mt-2 space-y-1.5">
          {disp.reasons.map((r, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
              <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${lvl.bar}`} />
              {r}
            </li>
          ))}
        </ul>

        {vitalRows.length > 0 && (
          <>
            <h3 className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Vitals</h3>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {vitalRows.map(([label, val, unit, b]) => (
                <div key={label} className={`rounded-lg border px-2.5 py-2 ${b ? bandClasses[b] : bandClasses.null}`}>
                  <div className="text-[10px] font-medium opacity-70">{label}</div>
                  <div className="text-base font-semibold tabular-nums">{val}<span className="ml-0.5 text-[10px] font-normal opacity-60">{unit}</span></div>
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
