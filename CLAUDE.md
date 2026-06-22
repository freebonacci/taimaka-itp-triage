# CLAUDE.md — Taimaka ITP Triage

Orientation for future sessions. This is a **concept prototype**, not production clinical
software. All clinical numbers are unvalidated placeholders (see below). Treat clinical
threshold values as data to be swapped, not invented — never substitute "real" numbers
without Taimaka's sign-off.

## Purpose

A front-door triage tool for Taimaka's **Inpatient Therapeutic Programme (ITP)** in Gombe,
Nigeria. Children arrive **already referred from outpatient (OTP)**, so the tool's job is to
**re-sieve** them — catch the genuinely critical immediately, sort who needs which level of
inpatient care, and step the over-referred back down to OTP. The tool advises; the clinician
decides.

Two-phase flow:
1. **Emergency gate** — an eyeball screen, no equipment. Four categories, each answered
   Yes/No with an expandable "what to look for". Any one Yes = Emergency, skip vitals.
2. **Vitals & assessment** — six vitals (live-coloured), appetite test, bilateral oedema,
   run through a tiered rule engine.

## Stack & architecture

- **React 19 + Vite + Tailwind v4.** In-memory only — **no database, no persistence.**
  Reloading the page resets to seed data.
- **Everything lives in `src/App.jsx`** — single file. Clinical config, the disposition
  engine, seed data, and all UI components are colocated.
- All clinical numbers, gate definitions, and the vitals list live in **one `CLINICAL CONFIG`
  block at the top of the file** (bounded by `=== CLINICAL CONFIG ===` comment rules), editable
  in one place. Units are defined alongside each threshold — keep them in sync.
- App is a single-screen view switcher (`view` state: `board | arrival | gate | assess |
  result`) over a `draft` patient object. `disposition()` is recomputed from patient data on
  every render — it is the single source of truth for routing.

## Disposition model (tiered rule engine — as implemented)

Every finding carries a **severity tier**: `transition < acute < emergency`
(`TIER_RANK` in the config). The engine collects **all** findings, then routes the child to
their **single highest-severity finding**. No findings → step-down.

`disposition(p)` at the top of the component section runs in order:

1. **Emergency gate override** — any `EMERGENCY_GATE` category answered Yes → `emergency`.
2. **Pending** — gate clear but `!p.assessed` (vitals not yet entered) → interim `pending`.
3. **Collect findings** from vitals + appetite + oedema, then route to the highest tier.
4. **No findings** → `stepdown`.

### Dispositions

| `level`      | UI label              | Ward / action |
|--------------|-----------------------|---------------|
| `emergency`  | ITP · Emergency       | ICU / resuscitation — call clinician now |
| `acute`      | ITP · Acute           | Admit — acute / Phase 1 stabilisation |
| `transition` | ITP · Transition      | Admit — transition phase |
| `stepdown`   | Step-down to OTP      | Step down to OTP — pending doctor sign-off (tool advises, clinician decides) |
| `pending`    | Awaiting assessment   | interim — gate clear, vitals not yet entered |

Board sort order: `emergency → pending → acute → transition → stepdown`, then longest-waiting
first. Emergency rows are pinned at top and highlighted (pulsing red bar, red ring).

### Finding → tier rules (ALL PLACEHOLDER VALUES)

Vitals (each `VITALS` entry has a `tier(value, ageMonths)` evaluator):

- **Heart rate** (bpm): `<80` emergency · `>180` emergency · `>160` acute · else none
- **Resp. rate** (/min): threshold = 50 if age <12 mo else 40 · `<20` emergency ·
  `≥threshold+20` emergency · `≥threshold` acute · else none
- **SpO₂** (%): `<90` emergency · `<94` acute · `<96` transition · else none
- **Temperature** (°C): `<35.0` emergency · `<36.0` acute · `<36.5` transition · `36.5–37.5`
  none · `<39.0` acute (fever) · `≥39.0` emergency
- **PCV** (%): `<12` emergency · `<18` acute · `<24` transition · else none
- **Random blood sugar** (mmol/L): `<2.2` emergency · `<3.0` acute · `<3.5` transition · else none

Other findings:

- **Appetite test** failed → acute
- **Bilateral oedema**: `+++` acute · `++` acute · `+` transition · none → no finding

Vitals cells colour live via `vitalBand()` (tier → green/amber/red: none→green,
transition→amber, acute/emergency→red).

## What is and isn't validated

- **Implemented and working:** the full tiered engine, the four-category emergency gate, six
  vitals with live colouring, automatic detection of severe anaemia (PCV), hypothermia (temp)
  and hypoglycaemia (blood sugar), all five dispositions, board bucketing/sorting, and the
  result screen tagging each finding with its tier.
- **NOT validated — the placeholder THRESHOLD VALUES.** Every number in the rules above is a
  standard WHO/IMCI-ish placeholder, to be replaced with Taimaka's real CMAM / IMCI /
  national-guideline values. The swap is mechanical and localised to the `CLINICAL CONFIG`
  block.
- **NOT validated — the acute-vs-transition weighting.** Which findings count as "acute"
  versus "transition" is a deliberate scaffold, not validated clinical logic. Expect the tier
  assignments themselves to change, not just the cut-off numbers.

## Where to edit clinical content

All in the `CLINICAL CONFIG` block at the top of `src/App.jsx`:

- `rrFastThreshold(ageMonths)` — IMCI fast-breathing cut-off by age.
- `VITALS` — the vitals list: each entry's `label`/`unit`/`icon`/`hint` and its `tier()`
  evaluator (thresholds + which tier each band maps to).
- `EMERGENCY_GATE` — the four gate categories, their "what to look for" bullets, and the
  finding label each produces.
- `APPETITE_FAIL`, `OEDEMA_TIER` — non-vital finding tiers.
- `TIER_RANK` — severity ordering used for routing.
- `LEVEL` — disposition labels, wards, colours, and board sort order.
- Seed demo patients live just below the config (`seed`), covering every disposition state.

## Dev / deploy workflow

- `npm run dev` — local preview, served under base path **`/taimaka-itp-triage/`** (set in
  `vite.config.js`).
- `npm run build` — production build to `dist/` (confirmed compiling).
- `npm run deploy` — `predeploy` builds, then `gh-pages -d dist` publishes to **GitHub Pages.**
- Vite `base` (`vite.config.js`) **must match the GitHub repo name**, and `homepage` in
  `package.json` still contains a `YOUR-GITHUB-USERNAME` placeholder — both need real values
  before Pages asset links resolve correctly.

## Working norms for this repo

- Do **not** alter threshold values or tier assignments unless explicitly asked — they are
  placeholders awaiting Taimaka's real numbers and clinical weighting.
- No tests, no backend, no persistence layer exist yet.
