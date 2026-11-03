# BIAS-0 Assurance

**Independent, reproducible fairness evidence for automated decisions in lending, hiring and insurance.**

One-line promise: **upload a log of decisions, get a verdict with an error bar, the release it lines up with, and a
report your regulator can check.**
BIAS-0 audits the decisions your system actually made, puts an honest error bar on every number, and
produces a report your model-risk committee, auditor or regulator can check.

## Name

We keep **BIAS-0**. People already know it, and it reads as a baseline ("audit from zero"), not a promise.
We never say "bias-free" or "certified fair". Every verdict reads "tested against X, on data Y, on date Z,
with this uncertainty". The product line is **BIAS-0 Assurance**. The hallmark (the stamp in the logo
and the report seal) refers to the assay offices that test a metal and stamp what they found.

## Who it's for (ICP)

| Segment | Buyer | Why now |
|---|---|---|
| **Indian HR-tech / AI-screening vendors selling to the US and EU** (beachhead) | Founder, CTO, Head of Compliance | NYC Local Law 144 bias audits for their US customers; EU AI Act Annex III (employment is high-risk); vendor liability (*Mobley v. Workday*) |
| **Digital lenders, NBFCs, fintechs** | CRO, Head of Model Risk | RBI FREE-AI recommendations on fairness audits; digital-lending scrutiny; EU AI Act Annex III (credit scoring) for cross-border lenders |
| **Insurers** (pricing, claims triage) | Model risk management, actuarial | Same model-risk validation cycle as banks, with insurance-specific Annex III cases |
| **Audit firms and law firms** (channel) | Partners running AI-audit practices | Need a reproducible tool. LL144 requires the auditor to be independent, so they sign and BIAS-0 is the instrument |

## The problem

1. **Decisions are bought, not built.** The lender or employer usually runs a vendor's LOS, ATS or
   screening model and cannot hand over model weights. Tools that need the model file are locked out.
2. **Fairness numbers are reported without error bars.** A disparity measured on 23 applicants is shown
   with the same confidence as one measured on 2,300. Regulators and plaintiffs' experts notice this.
3. **Evidence lives in spreadsheets.** Validation reports are hand-built in Excel and PDF, can't be
   reproduced, and go stale the day after sign-off.
4. **India's protected attributes are not the West's.** Caste, religion, region and language matter here,
   and most of them reach a model through proxies (pincode, surname, institution).

## What BIAS-0 does

- **Outcome audit (Mode A), new.** Upload a decision log (one row per decision, with the decision and the
  group columns, plus optional outcome, score and timestamp). There's no model access and no surrogate
  model. You get LL144 impact ratios, selection-rate gaps with bootstrap CIs and Wilson intervals,
  error-rate gaps when outcomes are known, and intersectional cells with small-sample guards.
- **Assurance verdict.** A three-way call for each attribute, based on the confidence interval and not the
  point estimate: *disparity evidenced*, *no material disparity*, or *inconclusive*. It comes with a
  plain-language explanation and a published grading rule.
- **Fairness drift.** The same log, bucketed by month or week, shows each period's impact ratio with a
  CI band. Periods are flagged *breach* (CI entirely below 0.8), *watch* (point below 0.8, CI spans it) or
  *insufficient data*.
- **Framework-mapped assurance report.** A self-contained HTML/print-to-PDF report. It covers scope, data
  window and sizes, the input SHA-256 and methods, then findings mapped to EU AI Act Art. 10/12/15/72,
  NYC LL144 (6 RCNY 5-301), RBI FREE-AI and DPDP. It also states limitations and has a sign-off block.
- **Change attribution, new.** BIAS-0 looks for columns whose dominant value switches between periods (a model,
  screener or policy version) and links a drift run that starts within one period of the switch, with the impact
  ratio before and after ("region_tier 0.96 on v2.2, 0.62 on v2.3"). It is worded as a lead, never as a cause.
- **What to do next, new.** Every audit ends with an ordered action plan for a non-specialist reviewer: act now
  (review the release, investigate the worst intersection), next (settle inconclusive verdicts, with a rough count
  of the extra decisions needed; do not rank small groups; add an outcome column), and for the record (publish
  unknown-category counts, independent sign-off). The same list opens the report.
- **NYC LL144 public summary, new.** For the HR-tech beachhead: the 5-303 page an employer posts, drafted from
  the same audit (selection and scoring rates, impact ratios, the sex × race/ethnicity intersection, unknown
  counts), with the auditor and distribution date left as blanks to fill. It is the artefact a vendor's customer
  actually asks for.
- **Reproduce a report, new.** Each report carries a fingerprint of its settings and headline numbers. Whoever
  receives it (auditor, regulator, enterprise customer) uploads the report and the CSV; BIAS-0 checks the SHA-256
  and re-runs the audit, number by number. "Reproducible" becomes something a counterparty can check, not a claim.
- **Paired test (Mode B, offline), new.** The strategy's standout, in its first shippable form: the customer
  runs name-swap (or any one-signal) probes against a vendor API or LLM screener and uploads the results;
  BIAS-0 gives the flip rate, an exact McNemar test and CIs on rate and score differences. Generating the probes
  (Indian name and identity corpora, API runners) is the next step.
- **Fairness gate for ML teams, new.** `python -m cli audit log.csv --fail-on disparity` runs the same audit
  in CI with no server, prints the act-now steps and fails the build on an evidenced disparity; `cli verify`
  reproduces a report.
- **Two bundled audits.** A 6,000-row Indian lending log and a 4,000-row NYC hiring-screen log (scores, no outcome,
  EEO race categories), each with a planted problem, so a visitor sees a real finding in 30 seconds.
- **Mitigation trade-off.** Accuracy versus impact ratio for group thresholds, measured on a holdout half
  and focused on the period since a drift breach, with an explicit disparate-treatment caveat.
- **Audit ledger.** Every audit is appended to a per-user SHA-256 chain, with a "since the last audit"
  comparison, so the history of what the company knew can be checked later.
- **Model workbench (Mode C, existing).** Train or load a model to get SHAP, proxy detection,
  counterfactual flips, stress tests, a mitigation sandbox, calibration by group and signed-hash
  evidence bundles.

## Positioning: where BIAS-0 sits next to the open-source toolkits

| | BIAS-0 | Fairlearn | AIF360 | What-If Tool |
|---|---|---|---|---|
| Who runs it | Compliance, model risk, auditors; no code | Data scientists (Python) | Data scientists (Python, R) | ML engineers (notebook, TensorBoard) |
| Input | A CSV of decisions; no model | Labels, predictions, groups as arrays | A dataset object with predictions | A model or its predictions |
| Uncertainty | Interval on every gap; verdict read from it | Point metrics; intervals are yours to add | Point metrics | Point metrics, explored interactively |
| Over time | Drift, breach alerts, version-change attribution | Not in scope | Not in scope | Not in scope |
| Output | Signed-off report (LL144 fields, AI Act / RBI mapping, action plan) | Python objects, plots | Python objects, plots | Interactive dashboard |
| Fixing the model | Threshold trade-off from logs; sandbox in the workbench | Reductions, threshold optimiser | Widest set of pre/in/post-processing | Manual threshold what-ifs |

The toolkits are excellent and free, and they are libraries for the person building the model. BIAS-0 is the
evidence workflow for the people who sign the fairness claim, often without the model. We position as
complementary: "BIAS-0 for the audit, a toolkit for the fix". The landing page carries the same table, with a
note to check each project's current release (summarised from public docs, Nov 2026).

## Differentiators

1. **Audits without model access, and without code.** It works from logs, which matches how the market actually
   buys models, and the person running it does not need Python.
2. **Honest statistics as the product.** Every metric has a CI, small groups are flagged instead of
   ranked, and the verdict is "inconclusive" when the data cannot decide.
3. **Regulator-shaped output.** LL144 fields (unknown-category counts, the 5-301(d) exclusion with
   justification, scoring rates) and the AI Act articles come out of the box.
4. **India-first.** Caste, region tier and pincode proxies are treated as first-class attributes.
5. **It says what to do.** Drift is linked to the release it coincides with, and every audit ends with an
   owner-tagged action plan, so the report leads to a decision instead of a shrug.
6. **Reproducible, and checkable by the other side.** The input hash, metric versions and seeded bootstrap mean the same file gives the
   same report.

## Pricing sketch (hypotheses to test in discovery, not market research)

| Plan | For | Shape |
|---|---|---|
| **Open core** | Data scientists | Free. Metrics library, CLI, self-host |
| **Audit** | One decision system per year | Fixed fee per system (tiered: tabular vs LLM, number of attributes). Includes the report and a readout |
| **Assure** | Continuous | Annual SaaS per monitored system plus a volume band. Monthly drift reports, alerts, evidence archive |
| **Partner** | Audit and law firms | Per-audit or per-seat white-label licence; the partner signs as independent auditor |

## Roadmap

| Now (this build) | Next (1 quarter) | Later |
|---|---|---|
| Outcome audit, verdict, drift, change attribution, action plan, report reproduction, mitigation trade-off, framework report, hash-chained audit ledger, lending and hiring samples | Warehouse connectors (Postgres, BigQuery, Snowflake); scheduled ingestion and alerts; reviewer/approver sign-off workflow with dates | **Mode B probe generation and runners** for vendor APIs and LLM screeners using Indian name and identity corpora (the offline analysis ships now); "BIAS-0 Audited" public verification page; privacy-preserving group inference (research, legal review first) |

## Where this diverges from `docs/strategy/case-study-and-strategy.md`

- **Same direction:** the evidence platform, three audit modes, the HR-tech beachhead, the independence
  warning, "never certified unbiased".
- **Order changed:** the strategy puts Mode B (black-box/LLM probes) as the standout. This build ships
  Mode A first, plus Mode B's offline analysis (upload probe results) because every customer can use it on day one, and its statistics (CIs, guards, verdicts,
  drift) are the same engine Mode B will need for flip-rate significance.
- **Single score demoted:** the strategy keeps a headline grade. Here the headline is the three-way verdict.
  The A–E grade is secondary, and it is capped when the evidence is inconclusive, so a small sample can't
  earn an A.
- **Monitoring:** the strategy wants scheduled warehouse pulls. This build derives drift from timestamps
  in an uploaded log, the same maths without the connector.
- **Regulatory dates and status** (EU high-risk obligations reportedly moving to Dec 2027, whether RBI
  FREE-AI becomes binding) are stated as "verify before quoting" in the report, as the strategy asks.
