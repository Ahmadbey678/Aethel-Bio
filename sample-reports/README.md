# 🧪 Sample Pathology Reports for Testing

This folder contains synthetic, publication-quality pathology and Next-Generation Sequencing (NGS) PDF reports designed to test the **Aethel Bio** precision oncology matching engine.

Each report represents a unique clinical case from a top cancer center, featuring distinct genomic profiles, lab parameters, and protocol edge cases.

---

## 📄 Available Test Cases

### 1. `Sample_NSCLC_EGFR_Borderline_eGFR.pdf`
* **Institution:** Metropolitan Comprehensive Cancer Center
* **Diagnosis:** Stage IV Non-Small Cell Lung Cancer (NSCLC)
* **Key Mutation:** `EGFR T790M`
* **Test Case Focus:** **Protocol Waiver Sensitivity.** Features a borderline kidney clearance rate ($54\text{ mL/min}$ eGFR against a standard $\ge 60\text{ mL/min}$ threshold) to test the waiver tolerance slider[cite: 3].

### 2. `Sample_Ovarian_BRCA2_MSK.pdf`
* **Institution:** Memorial Sloan Kettering Cancer Center
* **Diagnosis:** Stage IV High-Grade Serous Ovarian Carcinoma
* **Key Mutation:** `BRCA2 c.5946delT` (Germline) & `CCNE1` Amplification
* **Test Case Focus:** **Renal Waiver & HRD Matching.** Tests PARP inhibitor protocol sensitivity under compromised renal function ($42\text{ mL/min}$ eGFR).

### 3. `Sample_Prostate_ATM_JohnsHopkins.pdf`
* **Institution:** Johns Hopkins Medicine
* **Diagnosis:** Metastatic Castration-Resistant Prostate Cancer (mCRPC)
* **Key Mutation:** `ATM` Frameshift Mutation & `PTEN` Loss
* **Test Case Focus:** **Cytopenia & Lab Offset.** Tests eligibility scoring against borderline platelet levels ($88\text{ K/}\mu\text{L}$).

### 4. `Sample_Pancreatic_KRAS_MDAnderson.pdf`
* **Institution:** UT MD Anderson Cancer Center
* **Diagnosis:** Locally Advanced Unresectable Pancreatic Adenocarcinoma (PDAC)
* **Key Mutation:** `KRAS G12D`
* **Test Case Focus:** **Targeted Phase I/II Arms & Hepatic Tolerance.** Tests Phase I targeted inhibitor matching with mild hyperbilirubinemia ($2.4\text{ mg/dL}$).

### 5. `Sample_Melanoma_BRAF_DanaFarber.pdf`
* **Institution:** Dana-Farber Cancer Institute
* **Diagnosis:** Metastatic Cutaneous Melanoma
* **Key Mutation:** `BRAF V600E` (TMB-High: $18.2\text{ Mut/Mb}$)
* **Test Case Focus:** **CNS Metastases Criteria & High TMB.** Tests inclusion criteria for treated stable brain lesions and immunotherapy/TIL protocols.

---

## 🚀 How to Use These Files in Aethel Bio

1. Click on any `.pdf` file above and download it to your local machine.
2. Open the **[Aethel Bio Live App](https://ea20athvsq9epqjwpzsqtnm7v.nativelyai.app)**.
3. Drag & drop the downloaded PDF directly into the **Report Processing / Ingestion** drop zone on the Home page.
4. Watch the AI extract structured biomarkers, lab metrics, and perform real-time ClinicalTrials.gov matching in seconds!
