# PR 7 — EXISTING Preview / Print / Download Comparison

## Selected source

`TechnicalReportPrint.buildTechnicalReportOutput()` resolves the route from the canonical project identity, builds one `ExistingTechnicalReportModel`, converts it once to `buildExistingFinalTechnicalReportDocument(model)`, and renders one `buildExistingFinalTechnicalReportHtml({ document, company })`. The returned `DocumentPreviewPayload` is the single selected document source.

## Actions

| Action | Shared source | Save call | Workflow mutation | Classification mutation |
|---|---|---:|---:|---:|
| Preview | `buildTechnicalReportDocumentPayload(params)` | 0 | 0 | 0 |
| Print A4 | `buildTechnicalReportDocumentPayload(params)` | 0 | 0 | 0 |
| Download PDF | `buildTechnicalReportDocumentPayload(params)` → `downloadPdfDocument(payload.html, ...)` | 0 | 0 | 0 |

The downloaded artifact is generated as a real PDF by the existing trusted HTML-to-PDF path; it is not an HTML file renamed with a `.pdf` extension. No separate business-data generation path exists for EXISTING.

## Fixture comparison

- HTML source: `/tmp/existing-final-technical-report-pdf/official-technical-report.html`
- Download-equivalent PDF: `/tmp/pr7-existing-final-a4.pdf`
- PDF pages: 6
- Blank pages: 0
- Internal diagnostic terms: 0
- Page boundaries: semantic cover, TOC, section/table, and approval boundaries; no row split observed.

The fixture is local-only and contains no Production business data.
