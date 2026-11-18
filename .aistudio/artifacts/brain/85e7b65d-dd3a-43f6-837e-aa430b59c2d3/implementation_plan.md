# MAMO CLINICAL SIMULATOR AI

**MAMO CLINICAL SIMULATOR AI** is a bilingual (Arabic RTL / English LTR) medical education and clinical decision-making simulation platform where medical students, residents, and physicians interview virtual AI patients, perform targeted physical exams, order and interpret virtual labs and imaging, formulate differential diagnoses and treatment plans, and receive structured 100-point rubric feedback.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> The confirmed choices from our clarification round are locked into this blueprint, alongside two platform-alignment notes for your review before build execution.

- **Confirmed Decision 1 — Bilingual Medical Experience**: Full bilingual Arabic (RTL) and English (LTR) interface switching, paired with standardized English medical terminology (vital signs, lab units, ICD-aligned diagnoses, ECG/imaging terminology) across both languages.
- **Confirmed Decision 2 — Dual-Provider Server AI Engine**: Primary powered by the server-side Gemini SDK (`gemini-4-hydrogen` with SSE streaming and structured JSON evaluation) plus an interchangeable server-side Groq API adapter (configured via server environment variables when enabled, with automatic error propagation and retry logic).
- **Confirmed Decision 3 — 3D Visualization Scope (Three.js)**: Full 3D MAMO Splash Screen (4–5 seconds, animated 3D emblem, blue rim illumination, `Train Your Clinical Mind.`) plus an interactive 3D anatomical/cardiac organ explorer inside the Virtual Patient Room for spatial exam inspection.
- **Confirmed Decision 4 — Firebase Auth & Protected Admin Portal**: Firebase Authentication supporting Google Sign-In (`signInWithPopup`) and Email/Password registration/login, backed by Firestore role verification (`/admins/{uid}`) and hardened Zero-Trust Security Rules. *(Note: Provisioning automatically configures Google Sign-In; Email/Password UI will be built cleanly and includes a guided setup notice if Email/Password provider needs enabling in the Firebase Console).*
- **Platform Architecture Note**: This workspace is configured with **Vite + React 19 + TypeScript + Express (`server.ts`)** on port 3000 rather than Next.js. We will build the full-stack application on this native React + Express + Firebase architecture—preserving every server-side `/api/*` AI streaming endpoint, SSR-free instant interactivity, and clean deployment compatibility—while keeping all 17 screens, Three.js scenes, and Firestore integrations intact.
- **Security Note on API Keys**: Per security best practices, raw API keys are never entered or exposed in frontend forms; the Admin Dashboard monitors AI token/request telemetry and toggles active server-side provider presets (`Gemini` / `Groq` via environment configuration) without exposing credentials in the UI.

---

## 1. Overview & Core Concept

- **What It Does**: Delivers progressive-disclosure hospital clinical simulations across 22 medical specialties and 7 simulation modes. Each session spawns a medically coherent virtual patient whose history, physical exam findings, 13-panel virtual laboratory results, ECG waveforms, and radiographic interpretations unlock only when the learner actively asks questions or orders tests. Upon submission, an AI clinical evaluator scores the encounter out of 100 points across 6 rubric domains and awards XP, levels, and achievement badges.
- **Target Audience / Persona**: Medical students preparing for OSCEs, clinical interns/residents sharpening diagnostic reasoning under time pressure (ABCDE Emergency Mode), and attending specialists exploring complex multi-morbid or misleading diagnostic cases.
- **Key Value**: Replaces passive multiple-choice study with active, realistic clinical reasoning—preventing premature closure, rewarding cost-effective investigation ordering, and explaining both correct clinical pathways and diagnostic/therapeutic errors against real evidence-based guidelines.

---

## 2. User Experience & Visual Design

### Key User Flows

1. **Arrival & 3D Splash (4–5s)**: User sees a WebGL Three.js 3D MAMO emblem rotating in deep medical navy with cyan/turquoise rim lighting, smoothly revealing **MAMO CLINICAL SIMULATOR AI** and **Train Your Clinical Mind.** (with an immediate skip option for returning clinicians).
2. **Authentication & Role Onboarding**: User signs in via Google or Email/Password, selects their clinical role (`Student`, `Doctor`, `Specialist`) and preferred language (`العربية` / `English`), and lands on the **Main Dashboard** showing XP level, active streak, Daily Challenge, and Free/Pro status.
3. **Specialty, Mode & Case Selection**: User navigates the **22-Specialty Matrix** or picks one of the **7 Modes** (`Beginner`, `Clinical Practice`, `Emergency ABCDE`, `Advanced Specialist`, `OSCE Timed`, `Random Case`, `Daily Challenge`) from the **Case Library**.
4. **Progressive Clinical Encounter (Virtual Patient Room)**:
   - **Intake & Vitals Header**: Displays patient demographics, Chief Complaint, live tabular Vital Signs (`HR`, `BP`, `RR`, `SpO2`, `Temp`), ABCDE emergency alert banner (when critical), and OSCE/Emergency countdown timer when active.
   - **Interactive 3D Organ Core & Physical Exam**: Users rotate/inspect the 3D anatomical/cardiac model and click body systems (Cardiovascular, Respiratory, Abdominal, Neurological, HEENT, Musculoskeletal, Skin) to uncover real-time auscultation/palpation findings.
   - **Streaming History Taking**: Bilingual conversational interview with the virtual patient (HPI, PMH/PSH, Meds/Allergies, Family/Social History) powered by SSE streaming AI responses strictly consistent with hidden case ground truth.
   - **Virtual Lab & Imaging Suite**: Order from 13 lab panels (`CBC`, `CRP/ESR`, `Renal`, `Liver`, `Electrolytes`, `Glucose`, `Thyroid`, `Coagulation`, `Urinalysis`, `ABG`, `Cardiac Markers`, `Microbiology`, `Hormones`) with tabular units, reference ranges, and high/low flags, plus `ECG` (interactive SVG/canvas rhythm strip), `X-Ray`, `CT/MRI`, `Echocardiogram`, and `Specialized Tests` with educational AI interpretation.
5. **Clinical Decision & 100-Point Evaluation**: User ranks **Differential Diagnoses**, selects the **Final Diagnosis**, writes/selects the **Treatment Plan**, and submits to receive the **Final Evaluation Report** (15+15+15+20+15+20 = 100 pts), highlighting essential clues missed, unnecessary tests ordered, medical errors, evidence-based guidelines, and XP/badge unlocks.
6. **Progression, Subscriptions & Administration**: Users inspect their **Past Cases Logbook**, **Analytics & Progress**, **Subscriptions (Free vs. Pro)**, and **Settings** (Dark/Light mode, Arabic/English), while verified Admins manage users, cases, specialties, error reports, Pro activations, and AI usage in the **Admin Dashboard**.

### Visual Identity & Theme

- **Aesthetic Direction**: Futuristic Clinical Precision — high-legibility hospital command workspace combining deep medical navy, clean porcelain-white light surfaces, glassmorphic 3D overlays, and crisp cyan/turquoise clinical accents without decorative clutter or fake telemetry tickers.
- **Color Palette & 60-30-10 Mood**:
  - *Light Mode*: 60% crisp clinical canvas (`#F8FAFC`), 30% structural slate-white cards with 1px hairline borders (`#FFFFFF` / `#E2E8F0`), 10% medical navy (`#0B162C`), sky blue (`#0284C7`), and turquoise (`#0D9488`) focal actions.
  - *Dark Mode (`@custom-variant dark`)*: 60% deep medical navy canvas (`#071021`), 30% elevated slate-navy surfaces (`#0F1D36` with `rgba(56,189,248,0.14)` hairline borders), 10% luminous sky-cyan (`#38BDF8`) and clinical turquoise (`#14B8A6`) accents.
  - *Semantic Clinical States* (always paired with explicit text/icon labels, never hue-only): Nominal (`#059669`), Warning/Abnormal (`#D97706`), Critical/Emergency (`#DC2626`).
- **Typography & Tabular Discipline**:
  - *Display & Headings*: `Plus Jakarta Sans` (English) paired with `Cairo` (Arabic) with `text-wrap: balance`.
  - *Body Prose*: `DM Sans` (English) paired with `IBM Plex Sans Arabic` (Arabic).
  - *Vitals, Lab Ranges & Timers*: `JetBrains Mono` with `tabular-nums` for crisp decimal alignment.
- **Component Styling & Restraint**: Single-elevation surfaces, clean unboxed inline metadata separated by `·` or `/`, no thick left accent stripes, no pulsing decorative status dots, 3-zone top bar contract, and responsive mobile-first drawer navigation keeping sticky mobile height under 15%.

### Interactive Feedback & Motion

- Sub-200ms hover/focus transitions (`cubic-bezier(0.16, 1, 0.3, 1)`), smooth RTL/LTR layout mirroring, Framer Motion (`motion/react`) view transitions, streaming token typing indicators during patient interviews, and a collapsible bottom control dock for the 3D anatomical viewport so controls never occlude the 3D scene.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1 — Progressive Clinical Truth State (Anti-Contradiction Engine)**
  - *Chosen Approach*: Every simulation session generates or loads a complete hidden `CaseTruth` JSON object (vital signs, physical findings per system, full 13-panel lab values, imaging impressions, critical actions, and contraindications) stored in the session state and injected as grounded server context into every patient-chat and lab-interpretation AI prompt.
  - *Why*: Guarantees the virtual patient never contradicts earlier answers across 20+ interview turns and ensures lab results match the exact pathology.
  - *Alternatives Considered*: Stateless prompt-only chat, which frequently hallucinates shifting vitals or conflicting histories mid-case.

- **Decision 2 — Hybrid Curated Seed Bank + AI Dynamic Case Synthesizer**
  - *Chosen Approach*: Seed Firestore with rich, guideline-aligned clinical cases across all 22 specialties and difficulty tiers, paired with an AI Case Synthesizer endpoint that generates fresh structured cases on demand (tagged clearly as AI-generated educational content vs. curated reference cases).
  - *Why*: Meets the requirement for immediate multi-specialty depth while delivering endless unique patients and Daily Challenges without static-only data.
  - *Alternatives Considered*: Pure static JSON (violates dynamic session variety) or pure AI generation on every click (adds unnecessary latency for standard library browsing).

- **Decision 3 — Split PII User Profiles & Firestore-Backed Admin Claims**
  - *Chosen Approach*: Separate public leaderboard/progress metrics (`users/{uid}`) from private PII (`users/{uid}/private/info`) and govern Admin privileges via `/admins/{uid}` + bootstrapped admin email verification inside hardened `firestore.rules` and server-side token checks.
  - *Why*: Enforces Zero-Trust PII isolation, prevents client-side role spoofing, and meets all Eight Pillars Firestore security constraints.
  - *Alternatives Considered*: Flat user documents with client-editable `role: "admin"` flags (vulnerable to privilege escalation).

- **Decision 4 — Procedural Three.js Medical Assets**
  - *Chosen Approach*: Build the 3D MAMO emblem and the 3D interactive cardiac/thoracic anatomy explorer as 3–12 part procedural `THREE.Group` models using `MeshPhysicalMaterial`, `RoomEnvironment` IBL, and a software-WebGL guard (`isSoftwareGl`).
  - *Why*: Zero external 404 asset dependencies, fast load times, and crisp rendering across both GPU browsers and headless environments.
  - *Alternatives Considered*: External `.glb` model downloads (risk of network failure or broken CORS in sandboxed environments).

---

## 4. Technical Architecture & Data Strategy

### Architecture & Component Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                       CLIENT WORKSPACE (React + TypeScript)                  │
│                                                                              │
│  ┌─────────────────────┐  ┌──────────────────────┐  ┌─────────────────────┐  │
│  │  3D Splash & Auth   │  │  Navigation & Theme  │  │   Clinical Views    │  │
│  │  - Three.js Emblem  │  │  - AR (RTL)/EN (LTR) │  │  - 22 Specialties   │  │
│  │  - Google & Email   │  │  - Dark/Light Mode   │  │  - 7 Sim Modes      │  │
│  └──────────┬──────────┘  └──────────┬───────────┘  └──────────┬──────────┘  │
│             └────────────────────────┼─────────────────────────┘             │
│                                      ▼                                       │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │               ACTIVE SIMULATION WORKBENCH (17 Core Views)              │  │
│  │  [Patient Room + 3D Organ] ◄─► [Streaming HPI Chat] ◄─► [Exam Panel]   │  │
│  │  [13-Panel Virtual Lab + ECG/X-ray/CT/Echo] ◄─► [DDx + Treatment Plan] │  │
│  │  [100-Pt Rubric Report + XP/Badges]  |  [Logbook / Analytics / Admin]  │  │
│  └───────────────┬─────────────────────────────────────────┬──────────────┘  │
└──────────────────┼─────────────────────────────────────────┼─────────────────┘
                   │ Firebase SDK (Auth + Firestore)         │ HTTPS / SSE (/api/ai/*)
                   ▼                                         ▼
┌──────────────────────────────────────┐   ┌───────────────────────────────────┐
│        FIREBASE CLOUD BACKEND        │   │     EXPRESS SERVER (server.ts)    │
│                                      │   │                                   │
│  - Firebase Auth (Google + Email)    │   │  - /api/ai/patient-chat (SSE)     │
│  - Cloud Firestore (8-Pillar Rules): │   │  - /api/ai/generate-case (JSON)   │
│    • /users/{uid} & /private/info    │   │  - /api/ai/interpret-test (JSON)  │
│    • /clinical_cases/{caseId}        │   │  - /api/ai/evaluate-case (Rubric) │
│    • /sessions/{sessionId}           │   │  - Provider Router:               │
│    • /daily_challenges/{dateId}      │   │     Gemini (@google/genai) ◄──►   │
│    • /error_reports/{reportId}       │   │     Groq REST Adapter (Optional)  │
│    • /ai_usage_logs/{logId}          │   │  - Retry & Exponential Backoff    │
│    • /admins/{uid}                   │   │                                   │
└──────────────────────────────────────┘   └───────────────────────────────────┘
```

### Data Model & State

- **`UserProfile` (`/users/{uid}` & `/users/{uid}/private/info`)**: Stores display name, role (`student`, `doctor`, `specialist`), subscription tier (`free`, `pro`), XP, level, earned badge IDs, completed case count, preferred language (`ar` | `en`), theme (`dark` | `light`), and favorites—with email/account metadata isolated in `/private/info`.
- **`ClinicalCase` (`/clinical_cases/{caseId}`)**: Bilingual (`ar` / `en`) case metadata (specialty, difficulty `easy` | `medium` | `hard`, archetype `common` | `rare` | `emergency` | `multimorbid` | `misleading` | `urgent`, tier `free` | `pro`, published status, guideline references) plus hidden `CaseTruth` (patient demographics, vitals, progressive HPI/PMH/Meds/FH/SH, system-by-system physical exam, 13-panel lab values, ECG/imaging findings, required differential & treatment rubric).
- **`SimulationSession` (`/sessions/{sessionId}`)**: Tracks `userId`, `caseId`, `mode` (`beginner`..`daily`), `status` (`active` | `completed`), elapsed timer, unlocked history/exam/lab items, ordered tests (to compute unnecessary test penalties), conversation transcript, submitted differentials/final diagnosis/treatment plan, and the locked 100-point rubric breakdown (`history: 15`, `exam: 15`, `tests: 15`, `ddx: 20`, `diagnosis: 15`, `treatment: 20`).
- **`ErrorReport` & `AiUsageLog` (`/error_reports`, `/ai_usage_logs`)**: Tracks clinical content error flags submitted by learners and server-side AI request counts/latencies for Admin monitoring.

### Interactive Component & State Mapping

- **Global App Context**: Manages active view route across all 17 screens, bilingual dictionary (`ar` RTL / `en` LTR), Dark/Light class synchronization on `<html>`, Firebase Auth listener, and user profile subscription via `onSnapshot`.
- **Simulation Session State Machine**: Enforces progressive disclosure—ordering a lab panel appends it to `unlockedLabs` and triggers unit/reference-range rendering + abnormal flags; requesting a physical exam system unlocks that organ system's findings and focuses the 3D anatomical camera; submitting diagnosis/treatment transitions `status` from `active` to `completed` (immutable thereafter in Firestore rules).
- **Admin Control Flows**: Verified admins can toggle `isPublished`, change `difficulty` or `tier` (`free`/`pro`), create/edit `ClinicalCase` entries, toggle user `subscriptionTier` (`free`/`pro`) or `role`, resolve `error_reports`, and switch active AI provider preset (`gemini` / `groq` server capability check).

### Key Sequences & Integrations

1. **Streaming Patient Interview (`/api/ai/patient-chat`)**: Client posts the learner's question + session's `CaseTruth` summary + language (`ar`/`en`) + mode hints (`beginner` coaching vs. `osce` strict); Express server streams the patient's persona response via SSE using `@google/genai` (`gemini-4-hydrogen`) or Groq fallback with exponential backoff retry.
2. **Dynamic Case Generation & Rubric Grading (`/api/ai/generate-case`, `/api/ai/evaluate-case`)**: Uses structured `responseSchema` (`Type.OBJECT`) to synthesize coherent multi-system clinical cases or grade the learner's differential, final diagnosis, and treatment plan deterministically against the 100-point rubric, returning structured errors, missed clinical clues, and guideline citations.
3. **Firebase Provisioning & Rules Verification**: On build execution, we will invoke `show_aistudio_ui` (`firebase_setup`), verify terms via `GetFirebaseTos`, provision via `ProvisionFirebase`, author `firebase-blueprint.json`, `security_spec.md`, `firestore.rules.test.ts`, lint rules with `@firebase/eslint-plugin-security-rules`, and deploy `firestore.rules` via `DeployRules`.
