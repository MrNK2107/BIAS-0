# BIAS-0 Assurance: 5-minute demo

**Audience:** a Head of Model Risk at a digital lender, or a compliance lead at an HR-tech vendor.
**Dataset:** `backend/samples/sample_lending_decisions.csv`. It holds 6,000 synthetic personal-loan
decisions from Nov 2025 to Oct 2026. No real person is in it.
**Setup:** `DEMO_MODE=1 uvicorn main:app --port 8000` in `backend/` and `npm run dev` in `frontend/`
(or `npm run build` and use `:8000`). Open the landing page.

The story the data holds: the lender switched to model `v2.3` in May 2026. The new model added
alternative-data features (device, SMS patterns), and those features quietly penalise rural and
Scheduled Tribe applicants. Nobody told compliance.

---

### 0:00 Landing: the problem (30 s)

> "Regulators in Brussels, New York and Mumbai now ask the same thing: prove you tested your automated
> decisions for bias, and keep watching. Most teams can't. Their model is a vendor's, their fairness numbers
> have no error bars, and their evidence is a spreadsheet."

Point at the specimen card. It shows real output from the sample: grade E, one *inconclusive* row and one
*disparity* row. Then point at the "Honest by design" section:
> "We decide from the confidence interval. If the data can't tell, we say *inconclusive*, never *pass*."

Scroll once to **Where it fits** (the comparison with Fairlearn, AIF360 and the What-If Tool):
> "Those are libraries for the person building the model. We're for the people who sign the claim."

Click **Run the sample audit**. (In the app, the empty audit page offers the same lending log and a NYC
hiring-screen log as one-click cards.)

### 0:45 Mapping (20 s)

The sample is loaded and the columns are detected: decision, `repaid_12m` as outcome, `model_score`, the
`decision_date` timestamp, and four protected attributes. The audit starts automatically.
> "With your own log you'd confirm these. There's no model file and no integration project."

### 1:05 Verdict (45 s)

Hallmark **E: Disparity evidenced**. Read the rule under it: the worst impact ratio is below 0.65.
Point at the meta line: 6,000 decisions, 1,000 bootstrap resamples with seed 42, the input SHA-256 and
ledger entry #1.

Key findings, most severe first:
- **region_tier × caste_category**: rural × ST applicants are approved at 39% versus 62% for metro × OBC.
  The impact ratio is 0.64, with the *whole* interval (0.50–0.72) below 0.80.
- **region_tier** on its own, pooled over 12 months, is only *inconclusive* (0.79, CI 0.74–0.83).
> "A pooled annual number would have let this through. Two things catch it: intersections, and time."

Reliability panel: `gender = other` has only 25 decisions, so it is shown but never ranked. 431 decisions have
no disclosed caste and are excluded and counted, as LL144 5-301(b)(5) requires.

### 1:35 What to do next (30 s)

Directly under the verdict, **What to do next** splits the follow-ups into *Act now*, *Next* and *For the
record*, each with an owner role.
- *Act now:* **Review the model_version change to v2.3.** region_tier 0.96 on v2.2 versus 0.62 on v2.3;
  caste_category 0.93 versus 0.65. "A coincidence in time, not proof of cause, but the first place to look."
- *Next:* settle the region_tier and caste_category verdicts. The text says the pooled figure mixes v2.2 and
  v2.3, so judge v2.3 on its own rather than wait for more data.
- *For the record:* publish the 431 unknown-category count, independent sign-off.
> "This is the page you forward to the CRO. Nobody has to read a confidence interval to know what happens
> on Monday."

### 2:05 Drift (45 s)

Scroll to **Impact ratio by month**.
- A gold vertical rule marks **v2.3** on the region_tier and caste_category charts, and the strip under each
  chart reads "model_version v2.2 → v2.3 in 2026-05: impact ratio 0.96 → 0.62".
- `region_tier` sits around 0.88 until April. From **2026-05** it drops to 0.53–0.67. In five of those six
  months the whole band is below the dashed 0.80 line (August's band crosses it, so it reads *watch*), and the
  badge reads *breach since 2026-05*.
- `caste_category` breaches in May and June, then partly recovers. The badge stays amber ("breached from
  2026-05 · latest ok"), because a past breach does not disappear.
- `gender` stays flat and clear. That is the control.
> "May is when v2.3 shipped. This view is EU AI Act Article 72 post-market monitoring, produced from a log
> you already keep."

### 2:35 Impact-ratio tables (30 s)

Open the `caste_category` tab: rates with Wilson intervals, n per category and impact ratios, with no pass mark
because LL144 sets none. Switch to **Scoring rate (5-301(c))** to show the score-based variant.

### 2:55 Mitigation trade-off (30 s)

Scroll to **What would closing the gap cost?** The panel opens on `caste_category`, the worst attribute,
using decisions since the drift breach (2026-05).
> "Strength 0.2 lifts the impact ratio from 0.69 to 0.81 for no loss of accuracy, measured on a holdout half.
> This gap is not the price of accuracy."

Read the caveat aloud: group thresholds are disparate treatment. The curve shows the fix belongs in v2.3's
features, not in a per-group cut-off.

### 3:25 Regulatory mapping (40 s)

Click through the four framework cards.
> "Every control is *evidenced*, *partial* or *not evidenced*. We never claim human oversight (Art. 14) or
> auditor independence (LL144). Those are yours, and the report says so."

### 3:45 The report (45 s)

Click **Open to print**. Walk the report: cover with the hallmark and SHA-256, findings, scope and method,
LL144 tables, intersections, error rates against `repaid_12m`, drift charts, regulatory mapping, limitations,
and the sign-off block for analyst, independent auditor and approver.
> "Same file, same settings, same report. The hash on the cover proves which data it was."

Then scroll to the bottom of the app, **Reproduce a report**: drop in the report you just downloaded and the
sample CSV, click **Reproduce**. "Reproduced. The file matches the report's SHA-256 and all N checks agree."
> "When a customer's auditor gets this report, they don't have to trust us or you. They re-run it."

### 4:30 History (30 s)

Back in the app, scroll to **Audit history**: *Chain verified*. Run the audit again (or upload a different
export) and the new entry links to the previous one with a "since audit #1" comparison.
> "Each audit is chained by SHA-256. If anyone edits or deletes a past entry, the chain breaks. Anchor the head
> hash in a ticket and you can prove later what you knew and when."

### 5:00 Close

> "BIAS-0 tells you what was tested, on what data, with what uncertainty. It never says 'unbiased'. Next on our
> roadmap: warehouse connectors and paired probes for vendor APIs and LLM screeners, using Indian name
> corpora."

---

---

## Variant: HR-tech audience, hiring sample (3 minutes)

Open `/assurance` and click **Run this audit** on the **AI resume screener** card (or go to
`/assurance?sample=hiring`). The log: 4,000 synthetic applications to a New York employer, Jan to Oct 2026,
screened by "TalentLens". Columns: `shortlisted` (the decision), `screen_score` (so LL144 scoring rates
apply), `sex`, `race_ethnicity` in EEO categories (9% undisclosed), and `screener_version`. No outcome column:
a screener rarely sees later job performance.

1. **Verdict: E, Disparity evidenced.** Pooled over ten months, sex reads only *inconclusive* (female 38% vs
   male 47%, impact ratio 0.80, CI 0.74–0.86). "A once-a-year LL144 summary table would show 0.80 and move on."
2. **What to do next.** *Act now:* review the screener_version change to s1.5: sex 0.96 on s1.4, 0.56 on s1.5.
   Then the worst intersection: female × Hispanic or Latino at 35% vs 58% (0.60, CI 0.44–0.69). *Next:* add an
   outcome column; do not rank Native Hawaiian or Other Pacific Islander (n=21). *For the record:* 347
   undisclosed race/ethnicity, which LL144 requires you to publish.
3. **Drift.** The sex chart is flat near 0.9 until June, then falls to 0.42 in July with the s1.5 rule on the
   chart. Breach in July, September and October.
   > "s1.5 added an employment-gap feature. Career breaks are far more common for women in this log. That's
   > the lead for the vendor's next release, and the action plan already says it."
4. **Impact-ratio tables → Scoring rate.** Share of each category above the median score: female 0.78 of male.
5. **LL144 summary.** Click **LL144 summary** next to the report buttons. A new tab shows the page the employer
   posts: 4,000 applicants, 347 unknown race/ethnicity, selection and scoring rates with impact ratios (female
   0.800 selection, 0.782 scoring), every sex × race/ethnicity category, and red blanks for the auditor and the
   tool's distribution date.
   > "Your customer's counsel asks for exactly this page. It took one click, and the numbers match the report."
6. **Report.** Same structure, with *What to do next* before the findings and a "What changed in the log"
   table under the drift charts.

---

## Variant: buying an LLM screener, paired test (90 seconds)

Click **Paired Test** in the sidebar, then **Run the LLM-screener sample**. The file holds 400 pairs of resumes
sent to a vendor's LLM screener; within each pair only the name differs (female-coded vs male-coded).
- The dial reads **9.3% flipped**: 37 pairs were decided differently.
- **Differential treatment evidenced**: 35 of those 37 favoured the male-coded version (exact McNemar p < 0.0001).
- The 2x2 table highlights the 35. Selection rate 46.0% vs 37.8% (difference +8.3%, CI 5.5% to 11.3%); the score
  is 0.052 higher for the male-coded copy of the same resume.
> "You can't open the vendor's model. You don't need to. Same resume, different name, different answer."

---

## Variant: ML team, 60 seconds in a terminal

```bash
cd backend
python -m cli audit samples/sample_lending_decisions.csv --report report.html --fail-on disparity; echo "exit $?"
python -m cli verify report.html samples/sample_lending_decisions.csv
```

The first command prints *Disparity evidenced (grade E)*, the act-now steps (review the v2.3 change, investigate
rural × ST) and exits 1, which fails a CI job. The second re-runs the report and prints *Reproduced*.
> "Put this after your monthly export and nobody ships a model whose decisions drifted without seeing it."

---

**If something goes wrong:** the audit needs no model training, so it takes a few seconds. If the page shows
"Cannot reach the backend", the API is not running on the port Vite proxies to (`API_PORT`, default 8000).
