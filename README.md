<div align="center">

  <br />
  <h1><b>Aethel Bio</b></h1>
  <p><b>Precision Oncology & AI-Powered Clinical Trial Matching Suite</b></p>
  
  <p>
    An enterprise-grade clinical workspace designed to parse complex NGS pathology reports, structure biomarker profiles, and match oncology patients with active ClinicalTrials.gov protocols in seconds.
  </p>

  <br />

  ![Clinical Platform Interface](https://img.shields.io/badge/Status-Operational-emerald?style=for-the-badge)
  ![Engine Version](https://img.shields.io/badge/Version-2.4.0-blue?style=for-the-badge)
  ![License](https://img.shields.io/badge/License-MIT-slate?style=for-the-badge)
  ![HIPAA Architecture](https://img.shields.io/badge/Security-Encrypted_Local_Processing-violet?style=for-the-badge)

  <br />
  <br />

  > ### 🚀 **Live Demo & Judge Access**
  > 🔗 **Launch App:** [https://ea20athvsq9epqjwpzsqtnm7v.nativelyai.app](https://ea20athvsq9epqjwpzsqtnm7v.nativelyai.app)
  >
  > **Testing Credentials:**
  > * **Email:** `admin@aethel.gmail.com`
  > * **Password:** `Admin123`
  > *(Note: You can also click "Continue as Guest" inside the sign-in modal to test sandboxed matching).*

  <br />
</div>

---

## ⚡ Overview

**Aethel Bio** bridges the gap between raw genomic data and active clinical research. Precision oncology workflows often suffer from fragmented pathology reports and cumbersome manual searches across trial registries. 

Aethel Bio solves this by providing an intelligent, real-time matching engine that automatically extracts targeted genomic alterations, correlates them with inclusion/exclusion criteria from **ClinicalTrials.gov**, and flags unmatched patient cohorts to identify unmet clinical trial demand.

---

## Key Features

* 📄 **AI Pathology Report Parser:** Drag-and-drop ingestion (`.pdf`, `.docx`, `.txt`) that automatically extracts targeted mutations (*EGFR, KRAS, BRCA1, TP53*), disease stage, and vital lab metrics (*eGFR, platelets, brain metastases status*).
* ⚡ **Real-Time Registry Sync:** Live integration with the ClinicalTrials.gov API to fetch updated phase statuses, recruiting arms, and protocol geographic sites.
* 🎯 **Deterministic Match Scoring Engine:** Multi-tier scoring algorithm evaluating biomarker alignment, prior treatment lines, and organ function constraints against active trial criteria.
* 📊 **Unmatched Patient Registry:** Automatically logs patients scoring below match thresholds to track cohort demand for prospective trial enrollment.
* 🔄 **Dynamic Query Re-runs:** One-click re-evaluation of logged patient dossiers against newly launched or reopened clinical trial arms.
* 🔒 **Role-Based Guest Sandbox & Auth:** Built-in secure authentication with a sandboxed Guest Demo mode for non-authenticated clinical trial previews.

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
                                             • Override Capabilities                  • Dynamic Re-run Trigger
