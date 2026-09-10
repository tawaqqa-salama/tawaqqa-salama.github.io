# Saudi Code OCR (`saudi-code-ocr`)

Standalone **server-side** Arabic + English OCR HTTP service for Design Intelligence selective page fallback (PR #271 client contract).

- Engine: system **Tesseract** (`ara+eng`)
- PDF page raster: **Poppler** `pdftoppm` (single page only, ~250 DPI)
- Auth: `Authorization: Bearer <OCR_API_KEY>`
- No Supabase / tenant coupling
- No `NEXT_PUBLIC_*` secrets
- No LLM spell-correction of engineering text

## Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/health` | No | Liveness / capability probe |
| `POST` | `/ocr` | Bearer | OCR one page (image **or** PDF page) |

### Health

```http
GET /health
```

```json
{
  "ok": true,
  "service": "saudi-code-ocr",
  "ocrEngine": "tesseract",
  "languages": ["ara", "eng"]
}
```

### OCR (PR #271 client body)

```http
POST /ocr
Authorization: Bearer <OCR_API_KEY>
Content-Type: application/json
```

```json
{
  "pageNumber": 123,
  "languages": ["ara", "eng"],
  "languageHints": ["ara", "eng"],
  "digits": true,
  "imageBase64": null,
  "imageMimeType": null,
  "pdfBase64": "<base64 PDF bytes>"
}
```

Success `200`:

```json
{
  "text": "recognized text",
  "engine": "tesseract",
  "languages": ["ara", "eng"],
  "pageNumber": 123
}
```

Failure (`4xx` / `5xx`) — JSON only:

```json
{ "error": "machine_readable_reason" }
```

## Environment

| Variable | Required | Default | Notes |
|----------|----------|---------|-------|
| `OCR_API_KEY` | **Yes** | — | Shared secret; same value as Vercel `DI_OCR_API_KEY` |
| `PORT` | No | `8080` | Cloud Run sets this |
| `OCR_TIMEOUT_MS` | No | `40000` | Per-page Tesseract timeout |
| `OCR_MAX_BODY_BYTES` | No | ~18MB | Raw HTTP body limit |
| `OCR_MAX_DECODED_BYTES` | No | ~12MB | Decoded image/PDF limit |

## Local development

```bash
cd services/ocr
npm install
export OCR_API_KEY='dev-only-strong-secret'
npm run dev
# or: npm run build && npm start
```

```bash
curl -s http://127.0.0.1:8080/health
curl -s -X POST http://127.0.0.1:8080/ocr \
  -H "Authorization: Bearer $OCR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"pageNumber":1,"imageBase64":"'"$(base64 -w0 page.png)"'","imageMimeType":"image/png"}'
```

## Tests

```bash
cd services/ocr
npm test
```

Covers auth, validation, image/PDF paths, timeout, size limits, health, and log redaction (A–L).

## Docker

```bash
cd services/ocr
docker build -t saudi-code-ocr:local .
docker run --rm -p 8080:8080 -e OCR_API_KEY='strong-secret' saudi-code-ocr:local
```

---

# Google Cloud Run deployment (mobile-friendly checklist)

Do **not** auto-deploy from CI in this repo unless you intentionally wire it later. Do **not** change Production Vercel env from Cursor. Do **not** merge PR #271 from this workstream. Do **not** run Production reingest here.

### 1) Create / select a Google Cloud project

1. Open [Google Cloud Console](https://console.cloud.google.com/)
2. Project picker → **New Project** (or select existing)
3. Note the **Project ID**

```bash
gcloud config set project YOUR_PROJECT_ID
```

### 2) Enable APIs

```bash
gcloud services enable run.googleapis.com
gcloud services enable artifactregistry.googleapis.com
gcloud services enable cloudbuild.googleapis.com
```

### 3) Create Artifact Registry repository

```bash
gcloud artifacts repositories create saudi-ocr \
  --repository-format=docker \
  --location=me-central1 \
  --description="Saudi code OCR images"
```

(Use a region close to your users / Vercel if preferred, e.g. `europe-west1`.)

### 4) Build & push the container

From the **repository root** (or `services/ocr`):

```bash
cd services/ocr

gcloud builds submit --tag me-central1-docker.pkg.dev/YOUR_PROJECT_ID/saudi-ocr/saudi-code-ocr:v1
```

### 5) Create a strong OCR API key

Generate a long random secret (store in a password manager):

```bash
openssl rand -base64 48
```

Optional Secret Manager:

```bash
printf '%s' 'YOUR_STRONG_SECRET' | gcloud secrets create ocr-api-key --data-file=-
```

### 6) Deploy Cloud Run

```bash
gcloud run deploy saudi-code-ocr \
  --image me-central1-docker.pkg.dev/YOUR_PROJECT_ID/saudi-ocr/saudi-code-ocr:v1 \
  --region me-central1 \
  --platform managed \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 2 \
  --timeout 60 \
  --concurrency 5 \
  --max-instances 10 \
  --set-env-vars "OCR_TIMEOUT_MS=40000" \
  --set-secrets "OCR_API_KEY=ocr-api-key:latest"
```

Notes:

- `--allow-unauthenticated` makes the HTTPS URL reachable from Vercel; **application auth** is still required via Bearer `OCR_API_KEY`.
- Prefer secrets over plain env for the key.
- If not using Secret Manager, pass `--set-env-vars "OCR_API_KEY=...,OCR_TIMEOUT_MS=40000"` instead (less ideal).

### 7) Obtain the HTTPS service URL

```bash
gcloud run services describe saudi-code-ocr \
  --region me-central1 \
  --format='value(status.url)'
```

Example: `https://saudi-code-ocr-xxxxx-uc.a.run.app`

### 8) Test `/health`

```bash
curl -sS https://YOUR_CLOUD_RUN_URL/health
```

Expect JSON with `"ok": true` and `"service": "saudi-code-ocr"`.

### 9) Test authenticated `POST /ocr`

```bash
curl -sS -X POST https://YOUR_CLOUD_RUN_URL/ocr \
  -H "Authorization: Bearer YOUR_STRONG_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"pageNumber":1,"imageBase64":"'"$(base64 -w0 /path/to/page.png)"'","imageMimeType":"image/png","languages":["ara","eng"],"digits":true}'
```

Expect `{ "text": "...", "engine": "tesseract", ... }`.

Missing/wrong Bearer → `{ "error": "unauthorized" }` with HTTP 401.

### 10) Wire Vercel Production (manual — do not automate here)

In the Vercel project → **Settings → Environment Variables → Production**:

| Name | Value |
|------|-------|
| `DI_OCR_ENABLED` | `1` |
| `DI_OCR_PROVIDER` | `http` |
| `DI_OCR_ENDPOINT` | `https://YOUR_CLOUD_RUN_URL/ocr` |
| `DI_OCR_API_KEY` | *same* strong secret as `OCR_API_KEY` |
| `DI_OCR_TIMEOUT_MS` | `45000` |

Redeploy the Next.js app after saving env vars.

Then (separately, after ops approval) reingest **SBC-801/2018 only** so pages that fail the native quality gate can use OCR. Do **not** reingest NFPA. Do **not** run reingest from Cursor.

## Security checklist

- [ ] `OCR_API_KEY` / `DI_OCR_API_KEY` never committed
- [ ] Never placed in `NEXT_PUBLIC_*`
- [ ] Logs contain no bearer tokens, base64 payloads, or full OCR text
- [ ] Container runs as non-root (`ocruser`)
- [ ] No persistent document storage
