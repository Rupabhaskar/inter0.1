# Firestore Usage Estimation – College Test Page

One test attempt = **load test (reads)** + **submit (1 write)**. No other Firestore calls during the test.

---

## Per user (one test attempt)

| Step | Operation | Reads | Writes |
|------|-----------|-------|--------|
| Load | Student lookup (`collectionGroup` "ids", limit 1) | 1 | 0 |
| Load | Test metadata (`getDoc` test doc) | 1 | 0 |
| Load | Questions (`getDocs` questions subcollection) | **N** | 0 |
| Submit | Save result (`addDoc` to results) | 0 | **1** |
| **Total per user** | | **2 + N** | **1** |

**N** = number of question documents fetched (e.g. 50, 100, or 1000).

### Examples (per user)

| Test size | Fetch strategy | Reads | Writes | Total ops |
|-----------|----------------|-------|--------|-----------|
| 50 questions | Fetch all | 2 + 50 = **52** | **1** | 53 |
| 100 questions | Fetch all | 2 + 100 = **102** | **1** | 103 |
| 200 questions | Fetch all | 2 + 200 = **202** | **1** | 203 |
| 1000 questions | Fetch all | 2 + 1000 = **1002** | **1** | 1003 |
| 1000 questions | Fetch 100 per page, user sees 1 page only | 2 + 100 = **102** | **1** | 103 |
| 1000 questions | Fetch 100 per page, user loads all 10 pages | 2 + 1000 = **1002** | **1** | 1003 |

---

## For 1000 users

Assume each of 1000 users takes **one test attempt** (load once, submit once).

| Test size | Fetch strategy | Reads (1000 users) | Writes (1000 users) | Total (1000 users) |
|-----------|----------------|---------------------|----------------------|----------------------|
| 50 questions | All | 52,000 | 1,000 | **53,000** |
| 100 questions | All | 102,000 | 1,000 | **103,000** |
| 200 questions | All | 202,000 | 1,000 | **203,000** |
| 1000 questions | All | 1,002,000 | 1,000 | **1,003,000** |
| 1000 questions | 100 per page, 1 page only | 102,000 | 1,000 | **103,000** |

### Formula

- **Reads (1000 users)** = 1000 × (2 + N) = **2000 + 1000×N**
- **Writes (1000 users)** = 1000 × 1 = **1000**

---

## Quick reference

| Test Size (Questions) | Fetch Strategy            | Reads (1000 users) | Writes (1000 users) | **Total (1000 users)** |
| --------------------- | ------------------------- | ------------------ | ------------------- | ---------------------- |
| 50                    | All                       | 52,000             | 1,000               | **53,000**             |
| 100                   | All                       | 102,000            | 1,000               | **103,000**            |
| 200                   | All                       | 202,000            | 1,000               | **203,000**            |
| 1000                  | All                       | 1,002,000          | 1,000               | **1,003,000**          |
| 1000                  | 100 per page, 1 page only | 102,000            | 1,000               | **103,000**            |


---

## Notes

- **No extra reads** on Prev/Next or palette clicks (data is already in state).
- **Image cache** is a separate API call (your Next.js/Sheets), not Firestore.
- Firestore free tier (as of 2025): 50K reads, 20K writes per day. For 1000 users × 100 questions: 102K reads + 1K writes → above free tier for reads.
