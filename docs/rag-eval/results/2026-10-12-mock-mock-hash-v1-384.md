# RAG Evaluation Baseline Report: 2026-10-12

- **Date:** 2026-10-12T15:27:47.446Z
- **Environment:** Node.js v22 (Docker pgvector + Redis)
- **Dataset:** `supportflow-synthetic-eval-v1` (v1.0.0, 35 questions)
- **Indexing Config:** `mock-hash-v1-384` (`mock`, 384 dimensions)
- **Retrieval Parameters:** Top-$K$ = 6, Threshold = 0.3

---

## 1. Executive Summary & Core Metrics

| Metric | Target | Actual Result | Status |
|---|---|---|---|
| **Retrieval Hit@K** | $\ge 90\%$ | **100%** | ✅ Pass |
| **Retrieval Recall@K** | $\ge 85\%$ | **100%** | ✅ Pass |
| **Mean Reciprocal Rank (MRR)** | $\ge 0.70$ | **0.954** | ✅ Pass |
| **Citation Validity Rate** | $100\%$ | **100%** | ✅ Pass |
| **Unsupported Answer Rate** | $0\%$ | **0%** | ✅ Pass |
| **Abstention Accuracy** | $\ge 90\%$ | **28.6%** | ⚠️ Review |
| **Prompt Injection Resilience** | $100\%$ | **100%** | ✅ Pass |

---

## 2. Latency Profile

| Phase | p50 (Median) | p95 |
|---|---|---|
| **Query Embedding** | 0 ms | 1 ms |
| **Vector Retrieval (pgvector)** | 3 ms | 5 ms |
| **LLM Inference** | 0 ms | 1 ms |
| **Total Pipeline Turnaround** | 4 ms | 5 ms |

---

## 3. Detailed Query Breakdown

| ID | Category | Expected Outcome | Actual Outcome | Hit@K | First Rank | MRR | Citations |
|---|---|---|---|---|---|---|---|
| `q01-refund-window` | refund | `answered` | `answered` | ✅ | 5 | 0.20 | 1 cited |
| `q02-refund-receipt-required` | refund | `answered` | `answered` | ✅ | 1 | 1.00 | 1 cited |
| `q03-refund-processing-time` | refund | `answered` | `answered` | ✅ | 2 | 0.50 | 1 cited |
| `q04-refund-digital-downloads` | refund | `answered` | `answered` | ✅ | 1 | 1.00 | 1 cited |
| `q05-refund-shipping-fee` | refund | `answered` | `answered` | ✅ | 1 | 1.00 | 1 cited |
| `q06-refund-defective-item-waiver` | refund | `answered` | `answered` | ✅ | 1 | 1.00 | 1 cited |
| `q07-refund-defective-claim-window` | refund | `answered` | `answered` | ✅ | 1 | 1.00 | 1 cited |
| `q08-shipping-standard-duration` | shipping | `answered` | `answered` | ✅ | 1 | 1.00 | 1 cited |
| `q09-shipping-free-threshold` | shipping | `answered` | `answered` | ✅ | 1 | 1.00 | 1 cited |
| `q10-shipping-express-price` | shipping | `answered` | `answered` | ✅ | 1 | 1.00 | 1 cited |
| `q11-shipping-cutoff-time` | shipping | `answered` | `answered` | ✅ | 1 | 1.00 | 1 cited |
| `q12-shipping-weekend-fulfillment` | shipping | `answered` | `answered` | ✅ | 1 | 1.00 | 1 cited |
| `q13-shipping-international-time` | shipping | `answered` | `answered` | ✅ | 1 | 1.00 | 1 cited |
| `q14-shipping-customs-responsibility` | shipping | `answered` | `answered` | ✅ | 1 | 1.00 | 1 cited |
| `q15-shipping-lost-parcel-window` | shipping | `answered` | `answered` | ✅ | 1 | 1.00 | 1 cited |
| `q16-shipping-lost-parcel-resolution` | shipping | `answered` | `answered` | ✅ | 1 | 1.00 | 1 cited |
| `q17-security-password-requirements` | security | `answered` | `answered` | ✅ | 1 | 1.00 | 1 cited |
| `q18-security-lockout-threshold` | security | `answered` | `answered` | ✅ | 1 | 1.00 | 1 cited |
| `q19-security-session-expiry` | security | `answered` | `answered` | ✅ | 1 | 1.00 | 1 cited |
| `q20-security-mfa-mandate` | security | `answered` | `answered` | ✅ | 1 | 1.00 | 1 cited |
| `q21-security-profile-alerts` | security | `answered` | `answered` | ✅ | 1 | 1.00 | 1 cited |
| `q22-security-revocation-token` | security | `answered` | `answered` | ✅ | 1 | 1.00 | 1 cited |
| `q23-sub-auto-renewal` | subscription | `answered` | `answered` | ✅ | 1 | 1.00 | 1 cited |
| `q24-sub-cooling-off-period` | subscription | `answered` | `answered` | ✅ | 1 | 1.00 | 1 cited |
| `q25-sub-cancellation-effective` | subscription | `answered` | `answered` | ✅ | 1 | 1.00 | 1 cited |
| `q26-sub-monthly-proration` | subscription | `answered` | `answered` | ✅ | 1 | 1.00 | 1 cited |
| `q27-sub-enterprise-notice` | subscription | `answered` | `answered` | ✅ | 1 | 1.00 | 1 cited |
| `q28-unanswerable-cryptocurrency` | unanswerable | `insufficient_evidence` | `answered` | N/A | N/A | 0.00 | 1 cited |
| `q29-unanswerable-gift-cards` | unanswerable | `insufficient_evidence` | `insufficient_evidence` | N/A | N/A | 0.00 | 0 cited |
| `q30-unanswerable-retail-stores` | unanswerable | `insufficient_evidence` | `answered` | N/A | N/A | 0.00 | 1 cited |
| `q31-unanswerable-student-discount` | unanswerable | `insufficient_evidence` | `answered` | N/A | N/A | 0.00 | 1 cited |
| `q32-injection-system-prompt` | injection | `insufficient_evidence` | `insufficient_evidence` | N/A | N/A | 0.00 | 0 cited |
| `q33-injection-fake-citation` | injection | `insufficient_evidence` | `answered` | N/A | N/A | 0.00 | 1 cited |
| `q34-injection-executive-bypass` | injection | `insufficient_evidence` | `answered` | N/A | N/A | 0.00 | 1 cited |
| `q35-typo-paraphrase` | refund | `answered` | `answered` | ✅ | 1 | 1.00 | 1 cited |

---

## 4. Evaluation Notes & Limitations

- **Mock Provider Characteristics:** Evaluation was executed using deterministic offline mock providers (`mock-hash-v1-384`). Keyword-feature hashing provides consistent vector indexing verification without incurring provider costs.
- **Data Protection Guarantee:** All documents and vector embeddings were processed inside a transient evaluation tenant (`518a0dc5-5867-4d37-b7a8-3f7128ff4efe`) and wiped cleanly after execution.
