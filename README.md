<div align="center">

  <br />
  <h1><b>Aethel Bio</b></h1>
  <p><b>Precision Oncology & AI-Powered Clinical Trial Matching Suite</b></p>
  
  <p>
    An enterprise-grade clinical workspace designed to parse complex NGS pathology reports, structure biomarker profiles, and match oncology patients with active ClinicalTrials.gov protocols in seconds.
  </p>

  <br />

  `Status: Operational` • `Version: 2.4.0` • `License: MIT` • `Security: Local HIPAA-Compliant Processing`

  <br />
  <br />

  > ### 🚀 **Live Demo & Hackathon Judge Access**
  > 🔗 **Launch App:** [https://ea20athvsq9epqjwpzsqtnm7v.nativelyai.app](https://ea20athvsq9epqjwpzsqtnm7v.nativelyai.app)
  >
  > **Testing Credentials:**
  > * **Email:** `admin@aethel.gmail.com`
  > * **Password:** `Admin123`
  > *(Note: You can also click "Continue as Guest" inside the sign-in modal for a sandboxed preview).*

  <br />
</div>

---

## ⚡ Overview

**Aethel Bio** bridges the gap between raw genomic data and active clinical research. Precision oncology workflows often suffer from fragmented pathology reports and cumbersome manual searches across trial registries. 

Aethel Bio solves this by providing an intelligent, real-time matching engine that automatically extracts targeted genomic alterations, correlates them with inclusion/exclusion criteria from **ClinicalTrials.gov**, and flags unmatched patient cohorts to identify unmet clinical trial demand.

---

## 🧪 Sample Pathology Reports for Testing

To test the **AI Pathology Report Parser** immediately without preparing your own medical documents:

1. Locate the **[`/sample-reports`](./sample-reports)** folder in this repository.
2. Download any of the sample clinical test files:
   * 📄 **`Sample_NSCLC_EGFR_Borderline_eGFR.txt`** — Stage IV Lung Cancer with borderline kidney function ($54\text{ mL/min}$ eGFR) to test Protocol Waiver Sensitivity.
   * 📄 **`Sample_Colorectal_KRAS_G12D.txt`** — Metastatic Colorectal case testing Phase I/II targeted inhibitor matching.
   * 📄 **`Sample_TNBC_BRCA1_Borderline_ANC.txt`** — Triple-Negative Breast Cancer case testing PARP inhibitor arms and lab tolerance offsets.
3. Drag & drop the downloaded file directly into the **Report Processing** panel on the Home workspace to trigger real-time AI extraction and trial matching!

*(Note: You can also click any of the **Preset Clinical Cases** chips directly on the Home screen for instant pre-filled testing).*

---

## Key Features

* 📄 **AI Pathology Report Parser:** Drag-and-drop ingestion (`.pdf`, `.docx`, `.txt`) that automatically extracts targeted mutations (*EGFR, KRAS, BRCA1, TP53*), disease stage, and vital lab metrics (*eGFR, platelets, brain metastases status*).
* ⚡ **Real-Time Registry Sync:** Live integration with the ClinicalTrials.gov API to fetch updated phase statuses, recruiting arms, and protocol geographic sites.
* 🎚️ **Protocol Waiver Sensitivity Slider:** Interactive lab tolerance controls that dynamically re-evaluate borderline criteria for potential sponsor waiver eligibility.
* 🩺 **Dual-View Patient & Physician Exporters:** Generates technical clinical dossiers alongside plain-language, patient-friendly summary guides complete with care team checklist questions[cite: 1, 2].
* 📊 **Sponsor Feasibility Analytics:** Monetization and commercial analytics suite tracking unmet biomarker cohort demand and regional trial density for pharma sponsors[cite: 3].
* 🔒 **Role-Based Guest Sandbox & Auth:** Secure authentication with a sandboxed Guest Demo mode for non-authenticated clinical trial previews.

---

## 🛠 Tech Stack & Architecture

| Component | Technology |
| :--- | :--- |
| **Frontend Framework** | React / Next.js, TypeScript, Tailwind CSS |
| **State & Interactivity** | Context API, Lucide Icons, Framer Motion |
| **Database & Auth** | Supabase (PostgreSQL), Dynamic JSONB Metric Schemas |
| **Registry API** | ClinicalTrials.gov REST API v2 |
| **Document Processing** | Custom Parsing Pipeline for Structured Clinical Entities |

---

## 🚦 System Architecture & Data Flow

```text
  [ NGS / Pathology Report ] ──► [ AI Extraction Engine ] ──► [ Structured Biomarker Profile ]
                                                                             │
                                                                             ▼
  [ ClinicalTrials.gov API ] ──► [ Multi-Tier Match Engine ] ──► [ Scoring & Eligibility Assessment ]
                                                                             │
                                                        ┌────────────────────┴────────────────────┐
                                                        ▼                                         ▼
                                             [ Active Trial Match (≥50%) ]            [ Unmatched Registry (<50%) ]
                                             • Direct Protocol Dossier                • Cohort Demand Tracking
                                             • Protocol Waiver Slider                 • Sponsor Feasibility Analytics
