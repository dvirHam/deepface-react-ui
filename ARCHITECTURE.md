# DeepFace React UI — Architecture

This document describes the current system architecture of **deepface-react-ui** using flowcharts. The UI is a React client that captures webcam frames and calls a separate DeepFace HTTP service for face verification and demography analysis.

---

## 1. System Overview

Two services run together: the React UI (port `3000`) and the DeepFace backend API (port `5005` → container `5000`). The facial identity database is configured in the UI via environment variables, not stored on the backend.

```mermaid
flowchart TB
  subgraph Client["Browser"]
    User["User"]
    Webcam["Webcam / MediaDevices API"]
    UI["DeepFace React UI<br/>localhost:3000"]
  end

  subgraph Config["UI Configuration (.env)"]
    EnvModel["REACT_APP_FACE_RECOGNITION_MODEL"]
    EnvDetector["REACT_APP_DETECTOR_BACKEND"]
    EnvMetric["REACT_APP_DISTANCE_METRIC"]
    EnvEndpoint["REACT_APP_SERVICE_ENDPOINT"]
    EnvAntiSpoof["REACT_APP_ANTI_SPOOFING"]
    EnvUsers["REACT_APP_USER_* base64 images"]
  end

  subgraph Backend["DeepFace Service"]
    API["DeepFace HTTP API<br/>localhost:5005"]
    VerifyEP["POST /verify"]
    AnalyzeEP["POST /analyze"]
    Models["Recognition models<br/>detectors · distance metrics<br/>optional anti-spoofing"]
  end

  User --> UI
  Webcam --> UI
  Config --> UI
  UI -->|"JSON + base64 images"| API
  API --> VerifyEP
  API --> AnalyzeEP
  VerifyEP --> Models
  AnalyzeEP --> Models
  Models -->|"verified / identity / demography"| UI
  UI --> User
```

---

## 2. Deployment Architecture

The project can be started as separate processes or via Docker Compose. Compose builds the sibling `deepface` repo and this UI image, then wires ports and dependency order.

```mermaid
flowchart LR
  subgraph Host["Host Machine"]
    Compose["docker-compose<br/>scripts/compose.sh"]
  end

  subgraph Containers["Docker Compose Stack"]
    DF["deepface<br/>build: ../deepface<br/>:5005 → :5000<br/>CUDA_VISIBLE_DEVICES=-1"]
    UI["deepface-react-ui<br/>build: .<br/>:3000 → :3000<br/>depends_on: deepface"]
  end

  Compose --> DF
  Compose --> UI
  UI -.->|"HTTP REACT_APP_SERVICE_ENDPOINT"| DF

  Browser["Browser"] -->|"http://localhost:3000"| UI
  Browser -.->|"optional direct API"| DF
```

### Alternate run paths

```mermaid
flowchart TD
  Start["Start services"] --> Choice{How to run?}

  Choice -->|"Compose"| C1["scripts/compose.sh"]
  C1 --> C2["docker-compose up --build"]
  C2 --> Both["UI :3000 + DeepFace :5005"]

  Choice -->|"Separate Docker"| D1["deepface/scripts/dockerize.sh"]
  D1 --> D2["deepface-react-ui/scripts/dockerize.sh"]
  D2 --> Both

  Choice -->|"Local npm / Python"| L1["deepface/scripts/service.sh"]
  L1 --> L2["deepface-react-ui/scripts/service.sh → npm start"]
  L2 --> Both
```

---

## 3. Frontend Component Structure

The app is a Create React App project. Almost all application logic lives in a single `App` component: webcam capture, facial DB loading, verification, and analysis.

```mermaid
flowchart TB
  subgraph Entry["Bootstrap"]
    IndexHTML["public/index.html"]
    IndexJS["src/index.js"]
    App["src/App.js"]
  end

  subgraph State["React State"]
    base64Image["base64Image"]
    isVerified["isVerified"]
    identity["identity"]
    isAnalyzed["isAnalyzed"]
    analysis["analysis[]"]
    facialDb["facialDb {}"]
  end

  subgraph Refs["DOM Refs"]
    videoRef["videoRef → &lt;video&gt;"]
    canvasRef["canvasRef → hidden &lt;canvas&gt;"]
  end

  subgraph Effects["useEffect hooks"]
    LoadDb["Load REACT_APP_USER_* → facialDb"]
    WebcamInit["getUserMedia → video stream"]
  end

  subgraph Actions["User Actions"]
    VerifyBtn["Verify button"]
    AnalyzeBtn["Analyze button"]
    Capture["captureImage(task)"]
  end

  IndexHTML --> IndexJS --> App
  App --> State
  App --> Refs
  App --> Effects
  VerifyBtn --> Capture
  AnalyzeBtn --> Capture
  Capture --> videoRef
  Capture --> canvasRef
  Capture -->|"task=verify"| VerifyFn["verify()"]
  Capture -->|"task=analyze"| AnalyzeFn["analyze()"]
```

---

## 4. Face Verification Flow

On **Verify**, the UI captures a frame, then sequentially compares it against each identity in the env-based facial database via `POST /verify` until a match is found or all identities are exhausted.

```mermaid
flowchart TD
  A["User clicks Verify"] --> B["Reset isVerified / identity"]
  B --> C["Draw video frame onto canvas"]
  C --> D["canvas.toDataURL → base64 PNG"]
  D --> E{base64Image ready?}
  E -->|No — first click warm-up| F["Return early"]
  E -->|Yes| G["verify(base64Image)"]

  G --> H["For each key in facialDb"]
  H --> I["Build request body:<br/>model_name, detector_backend,<br/>distance_metric, align,<br/>img1=capture, img2=db image,<br/>enforce_detection, anti_spoofing"]
  I --> J["POST {SERVICE_ENDPOINT}/verify"]
  J --> K{HTTP 200?}
  K -->|No| L["setIsVerified(false) · stop"]
  K -->|Yes| M{data.verified === true?}
  M -->|Yes| N["setIsVerified(true)<br/>setIdentity(key)<br/>setIsAnalyzed(false)<br/>break loop"]
  M -->|No| O{More identities?}
  O -->|Yes| H
  O -->|No| P["If still null → setIsVerified(false)"]

  N --> Q["UI: green 'Verified. Welcome {identity}'"]
  L --> R["UI: red 'Not Verified'"]
  P --> R
```

---

## 5. Facial Attribute Analysis Flow

On **Analyze**, a single captured frame is sent to `POST /analyze`. The UI formats age, race, gender, and emotion results into human-readable summaries.

```mermaid
flowchart TD
  A["User clicks Analyze"] --> B["captureImage('analyze')"]
  B --> C["Capture frame → base64"]
  C --> D["analyze(base64Image)"]
  D --> E["setIsAnalyzed(false)"]
  E --> F["Build request body:<br/>detector_backend, align,<br/>img, enforce_detection,<br/>anti_spoofing"]
  F --> G["POST {SERVICE_ENDPOINT}/analyze"]
  G --> H{HTTP 200?}
  H -->|No| I["Log error · return"]
  H -->|Yes| J["For each instance in data.results"]
  J --> K["Build summary string:<br/>'{age} years old {race} {gender}<br/>with {emotion} mood.'"]
  K --> L{Any summaries?}
  L -->|Yes| M["setIsAnalyzed(true)<br/>setIsVerified(null)<br/>setAnalysis(result)"]
  L -->|No| N["Leave analysis empty"]
  M --> O["UI: green analysis text"]
```

---

## 6. Configuration & Facial Database

Identity images are embedded at build/runtime as `REACT_APP_USER_<NAME>` env vars (base64 data URLs). Model and detector choices are also env-driven and sent with every API request.

```mermaid
flowchart LR
  subgraph EnvFile[".env"]
    EP["REACT_APP_SERVICE_ENDPOINT<br/>default http://localhost:5005"]
    Model["REACT_APP_FACE_RECOGNITION_MODEL<br/>default Facenet"]
    Detector["REACT_APP_DETECTOR_BACKEND<br/>default opencv"]
    Metric["REACT_APP_DISTANCE_METRIC<br/>default cosine"]
    Spoof["REACT_APP_ANTI_SPOOFING<br/>0 or 1"]
    Users["REACT_APP_USER_ALICE=...<br/>REACT_APP_USER_BOB=..."]
  end

  subgraph Runtime["App.js runtime"]
    Load["Scan process.env for<br/>REACT_APP_USER_* prefix"]
    Map["Map → facialDb<br/>{ ALICE: base64, BOB: base64 }"]
    Req["Include model / detector /<br/>metric / anti_spoofing<br/>in API payloads"]
  end

  Users --> Load --> Map
  Model --> Req
  Detector --> Req
  Metric --> Req
  Spoof --> Req
  EP --> Fetch["fetch(endpoint + path)"]
  Map --> VerifyLoop["verify() iterates facialDb"]
  Req --> Fetch
```

---

## 7. Request / Response Contracts

High-level contracts used by the UI today (fields the client sends and the outcomes it consumes).

```mermaid
flowchart TB
  subgraph VerifyReq["POST /verify — request"]
    V1["model_name"]
    V2["detector_backend"]
    V3["distance_metric"]
    V4["align: true"]
    V5["img1: captured frame"]
    V6["img2: enrolled identity image"]
    V7["enforce_detection: false"]
    V8["anti_spoofing: bool"]
  end

  subgraph VerifyRes["POST /verify — UI uses"]
    VR1["verified: boolean"]
    VR2["error on non-200"]
  end

  subgraph AnalyzeReq["POST /analyze — request"]
    A1["detector_backend"]
    A2["align: true"]
    A3["img: captured frame"]
    A4["enforce_detection: false"]
    A5["anti_spoofing: bool"]
  end

  subgraph AnalyzeRes["POST /analyze — UI uses"]
    AR1["results[].age"]
    AR2["results[].dominant_race"]
    AR3["results[].dominant_gender"]
    AR4["results[].dominant_emotion"]
  end

  VerifyReq --> VerifyRes
  AnalyzeReq --> AnalyzeRes
```

---

## 8. End-to-End Sequence

Typical happy-path interaction from page load through verification.

```mermaid
sequenceDiagram
  participant U as User
  participant B as Browser / App.js
  participant Cam as Webcam
  participant Env as .env / process.env
  participant DF as DeepFace API :5005

  U->>B: Open http://localhost:3000
  B->>Env: Read REACT_APP_* config
  B->>Env: Load REACT_APP_USER_* facial DB
  B->>Cam: getUserMedia({ video: true })
  Cam-->>B: MediaStream → &lt;video&gt;

  U->>B: Click Verify
  B->>B: Draw frame to canvas → base64
  loop Each identity in facialDb
    B->>DF: POST /verify {img1, img2, model, ...}
    DF-->>B: { verified: true|false }
    alt Match found
      B-->>U: Verified. Welcome {identity}
    end
  end

  U->>B: Click Analyze
  B->>B: Draw frame to canvas → base64
  B->>DF: POST /analyze {img, detector, ...}
  DF-->>B: { results: [{age, race, gender, emotion}] }
  B-->>U: Demography summary text
```

---

## 9. Repository Layout (architecture-relevant)

| Path | Role |
|------|------|
| `src/App.js` | Webcam UI, facial DB load, `/verify` & `/analyze` clients |
| `src/index.js` | React root bootstrap |
| `.env` / `.env.example` | Service endpoint, models, anti-spoofing, enrolled faces |
| `Dockerfile` | Node 14 Alpine image; `npm start` on `:3000` |
| `docker-compose.yml` | Orchestrates `deepface` + `deepface-react-ui` |
| `scripts/compose.sh` | `docker-compose up --build` |
| `scripts/dockerize.sh` | Run prebuilt UI container |
| `scripts/service.sh` | Local `npm start` |
| Sibling `../deepface` | Backend facial recognition / analysis service |

---

## Summary

| Layer | Technology | Responsibility |
|-------|------------|----------------|
| Presentation | React 18 (CRA) | Webcam preview, capture, verify/analyze UX |
| Config | `REACT_APP_*` env vars | Models, detectors, endpoint, enrolled faces |
| Transport | `fetch` + JSON | Base64 images to DeepFace HTTP API |
| Backend | DeepFace service | Face match, anti-spoofing, demography |
| Ops | Docker / Compose | Package and run UI + API together |
