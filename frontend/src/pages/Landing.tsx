import { Link } from "react-router-dom";
import { ArrowRight, FileCheck2 } from "lucide-react";
import Hallmark from "../components/brand/Hallmark";
import CiTrack from "../components/brand/CiTrack";
import "../styles/brand.css";

// Numbers in the specimen come from the bundled synthetic lending log
// (backend/samples/sample_lending_decisions.csv) run through the outcome audit.
const SPARK = [0.89, 0.887, 0.848, 0.877, 0.921, 0.89, 0.529, 0.621, 0.565, 0.673, 0.651, 0.602];

function Sparkline({ values, threshold }: { values: number[]; threshold: number }) {
  const w = 200;
  const h = 40;
  const y = (v: number) => h - ((v - 0.4) / 0.6) * h;
  const x = (i: number) => (i / (values.length - 1)) * w;
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} role="img" aria-label="Impact ratio by month, falling below 0.8 from May 2026">
      <line x1="0" x2={w} y1={y(threshold)} y2={y(threshold)} stroke="var(--verdict-bad)" strokeDasharray="3 3" strokeWidth="1" />
      <polyline points={pts} fill="none" stroke="var(--text-primary)" strokeWidth="1.5" />
      {values.map((v, i) => (
        <circle key={i} cx={x(i)} cy={y(v)} r="2.4" fill={v < threshold ? "var(--verdict-bad)" : "var(--verdict-good)"} />
      ))}
    </svg>
  );
}

const PROBLEMS = [
  {
    title: "Decisions are bought, not built.",
    body: "Your loan engine, ATS or screening model came from a vendor. Tools that need the model file never get to audit it. BIAS-0 works from the decisions you already log.",
  },
  {
    title: "Fairness numbers ship without error bars.",
    body: "A gap measured on 23 applicants is presented like one measured on 2,300. Regulators and opposing experts notice. Every BIAS-0 number carries its interval.",
  },
  {
    title: "Evidence lives in spreadsheets.",
    body: "Validation packs are rebuilt by hand each year and cannot be reproduced. A BIAS-0 report is tied to the SHA-256 of its input and a seeded method.",
  },
];

// Positioning against the open-source toolkits. Kept factual and modest: they are
// libraries for people who write code; BIAS-0 is the evidence workflow around them.
const COMPARE_TOOLS = ["BIAS-0", "Fairlearn", "AIF360", "What-If Tool"] as const;
const COMPARE: { row: string; cells: [string, string, string, string] }[] = [
  {
    row: "Who runs it",
    cells: ["Compliance, model risk, auditors. No code", "Data scientists, in Python", "Data scientists, in Python or R", "ML engineers, in a notebook or TensorBoard"],
  },
  {
    row: "Input",
    cells: ["A CSV of decisions. No model, no weights", "Labels, predictions and groups as arrays", "A dataset object with predictions", "A model, or its predictions, loaded in a notebook"],
  },
  {
    row: "Uncertainty",
    cells: ["An interval on every gap; the verdict is read from it", "Point metrics; intervals are yours to add", "Point metrics; intervals are yours to add", "Point metrics, explored interactively"],
  },
  {
    row: "Over time",
    cells: ["Monthly drift with breach alerts, linked to version changes", "Not in scope", "Not in scope", "Not in scope"],
  },
  {
    row: "Output",
    cells: ["A signed-off report: LL144 fields, AI Act and RBI mapping, action plan", "Python objects and plots", "Python objects and plots", "An interactive dashboard"],
  },
  {
    row: "Fixing the model",
    cells: ["Threshold trade-off from logs; sandbox in the workbench", "Reductions and threshold optimiser", "The widest set of pre-, in- and post-processing methods", "Manual threshold what-ifs"],
  },
];

const REGS = [
  {
    name: "EU AI Act",
    body: "Credit scoring and employment are Annex III high-risk uses.",
    refs: ["Art. 10(2)(f)-(g) bias examination", "Art. 12 record-keeping", "Art. 15 accuracy by group", "Art. 72 post-market monitoring"],
    status: "High-risk duties reportedly from Dec 2027",
  },
  {
    name: "NYC Local Law 144",
    body: "Annual independent bias audit of automated employment decision tools.",
    refs: ["5-301(b) selection rates and impact ratios", "5-301(b)(5) unknown categories", "5-301(c) scoring rates", "5-301(d) small-category exclusion"],
    status: "In force since July 2023",
  },
  {
    name: "RBI FREE-AI",
    body: "Recommendations for AI in Indian regulated finance.",
    refs: ["Fairness audits of credit models", "Ongoing model monitoring", "Board-approved AI policy (your step)"],
    status: "Recommendations; watch for directions",
  },
  {
    name: "DPDP Act 2023",
    body: "How sensitive attributes may be used for testing.",
    refs: ["Purpose limitation", "Data minimisation: aggregates only", "Notice and legitimate use"],
    status: "Phased in under the DPDP Rules",
  },
];

export default function Landing() {
  return (
    <div className="lp">
      <div className="lp-wrap">
        <nav className="lp-nav" aria-label="Main">
          <Link to="/" className="lp-brand" aria-label="BIAS-0 home">
            <Hallmark mark="0" size={34} ring="BIAS-0 · ASSURANCE · BIAS-0 · ASSURANCE ·" label="BIAS-0 hallmark" />
            <span>BIAS-0</span>
            <small>Assurance</small>
          </Link>
          <div className="lp-nav-links">
            <a href="#how">How it works</a>
            <a href="#method">Method</a>
            <a href="#regulations">Regulations</a>
            <a href="#compare">Compare</a>
            <Link to="/dashboard">Model workbench</Link>
            <Link to="/assurance" className="lp-btn lp-btn-small">Open the app</Link>
          </div>
        </nav>

        <header className="lp-hero">
          <div>
            <span className="mono-label">Fairness assurance for lending, hiring and insurance</span>
            <h1>
              Fairness evidence your <em>regulator</em> can check.
            </h1>
            <p className="lp-lede">
              BIAS-0 audits the decisions your system actually made. It needs no model access and puts an honest
              error bar on every number. The result is an audit-ready report mapped to the EU AI Act,
              NYC Local Law 144 and RBI FREE-AI, ending in what to do next.
            </p>
            <div className="lp-cta-row">
              <Link to="/assurance?sample=1" className="lp-btn lp-btn-primary">
                Run the sample audit <ArrowRight size={16} aria-hidden />
              </Link>
              <a href="#method" className="lp-btn">Read the method</a>
            </div>
            <p className="lp-fineprint">The sample is a synthetic Indian lending log: 6,000 decisions over 12 months. A NYC hiring-screen sample is one click away in the app. No real person is in either.</p>
          </div>

          <aside className="lp-specimen" aria-label="Example audit result">
            <div className="lp-specimen-head">
              <Hallmark mark="E" tone="bad" size={92} label="Grade E" />
              <div>
                <span className="mono-label">Verdict</span>
                <h3>Disparity evidenced</h3>
                <p>Personal-loan underwriting · 6,000 decisions · Nov 2025 to Oct 2026</p>
              </div>
            </div>
            <div className="lp-spec-row">
              <span className="lp-spec-name">region_tier, pooled 12 months</span>
              <span className="tone-pill tone-warn">Inconclusive</span>
              <div className="lp-spec-val">
                <span>0.79</span>
                <CiTrack lo={0.74} hi={0.83} point={0.79} threshold={0.8} min={0.4} max={1} />
                <span>0.74–0.83</span>
              </div>
            </div>
            <div className="lp-spec-row">
              <span className="lp-spec-name">region_tier × caste_category</span>
              <span className="tone-pill tone-bad">Disparity</span>
              <div className="lp-spec-val">
                <span>0.64</span>
                <CiTrack lo={0.5} hi={0.72} point={0.64} threshold={0.8} min={0.4} max={1} />
                <span>0.50–0.72</span>
              </div>
            </div>
            <div className="lp-spec-row">
              <span className="lp-spec-name">Drift: region_tier by month</span>
              <span className="tone-pill tone-bad">Breach since 2026-05</span>
              <div className="lp-spec-val">
                <Sparkline values={SPARK} threshold={0.8} />
              </div>
            </div>
            <div className="lp-spec-next">
              <span className="mono-label">Act now</span>
              <p>
                Review the <b>model_version</b> change to <b>v2.3</b> (2026-05): region_tier 0.96 → <em>0.62</em>.
              </p>
            </div>
          </aside>
        </header>
      </div>

      <div className="lp-strip" aria-label="Frameworks covered">
        <div className="lp-wrap lp-strip-inner">
          <span><b>§</b>EU AI Act Art. 10 · 12 · 15 · 72</span>
          <span><b>§</b>NYC LL144 · 6 RCNY 5-301</span>
          <span><b>§</b>RBI FREE-AI</span>
          <span><b>§</b>DPDP Act 2023</span>
          <span><b>§</b>EEOC four-fifths (as a heuristic only)</span>
        </div>
      </div>

      <div className="lp-wrap">
        <section className="lp-section" aria-labelledby="problem">
          <div className="lp-section-head">
            <div>
              <span className="mono-label">The problem</span>
              <h2 id="problem">Everyone has to prove their decisions are fair. Almost nobody can.</h2>
            </div>
            <p>
              Regulators in Brussels, New York and Mumbai are converging on one demand: show that you tested your
              automated decisions for bias, document it, and keep watching. Three things stand in the way.
            </p>
          </div>
          <div className="lp-problems">
            {PROBLEMS.map((p, i) => (
              <article className="lp-problem" key={p.title}>
                <div className="num">0{i + 1}</div>
                <h3>{p.title}</h3>
                <p>{p.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="lp-section" id="how" aria-labelledby="how-title">
          <div className="lp-section-head">
            <div>
              <span className="mono-label">How it works</span>
              <h2 id="how-title">From decision log to signed-off report in one sitting.</h2>
            </div>
            <p>
              No integration project and no model weights. Export the decisions you already keep and BIAS-0 does the
              statistics, the drift analysis and the regulatory mapping.
            </p>
          </div>
          <div className="lp-steps">
            <article className="lp-step">
              <span className="mono-label">Step 1 · Upload</span>
              <h3>Your decision log</h3>
              <p>One row per decision: the decision, the group columns, and optionally the outcome, the score and a timestamp.</p>
              <code>{"decision_date, gender, region_tier,\ncaste_category, model_score,\ndecision, repaid_12m"}</code>
            </article>
            <article className="lp-step">
              <span className="mono-label">Step 2 · Map</span>
              <h3>Columns detected for you</h3>
              <p>BIAS-0 suggests the decision, outcome, score, time and protected-attribute columns. You confirm or change them.</p>
              <code>{"decision    → decision\ngroups      → gender, region_tier, …\ntime        → decision_date (monthly)"}</code>
            </article>
            <article className="lp-step">
              <span className="mono-label">Step 3 · Evidence</span>
              <h3>Verdict, what changed, next steps</h3>
              <p>A verdict for each attribute and intersection, drift linked to the release it coincides with, a plain-language action plan, and an HTML report you can print, sign and file.</p>
              <code>{"verdict   Disparity evidenced (E)\nalerts    region_tier breach 2026-05\nchanged   model_version v2.2 → v2.3\nact now   review v2.3 (0.96 → 0.62)"}</code>
            </article>
            <article className="lp-step">
              <span className="mono-label">Step 4 · Verify</span>
              <h3>Anyone can re-run it</h3>
              <p>The report carries its own settings. Your auditor or customer drops it in with the CSV and BIAS-0 checks the hash and reproduces every number.</p>
              <code>{"sha256    matches the report\nverdict   disparity = disparity\ngrade     E = E\nresult    reproduced, 13/13 checks"}</code>
            </article>
          </div>
        </section>

        <section className="lp-section" id="method" aria-labelledby="method-title">
          <div className="lp-honest">
            <div>
              <span className="mono-label">Honest by design</span>
              <h2 id="method-title">"Inconclusive" is an answer.</h2>
              <p>
                Most dashboards turn a point estimate into a red or green light. BIAS-0 decides from the 95% confidence
                interval of the impact ratio. If the data cannot tell, it says so, and the grade is capped at C.
              </p>
              <p>
                Groups under 30 decisions are shown with their wide intervals but never ranked, unknown categories are
                excluded and counted as LL144 requires, and the four-fifths line is labelled what it is: a convention,
                not a legal pass mark.
              </p>
            </div>
            <div className="lp-verdict-list" aria-label="How a verdict is decided">
              <div className="lp-verdict-item">
                <span className="tone-pill tone-bad">Disparity evidenced</span>
                <CiTrack lo={0.5} hi={0.72} point={0.64} threshold={0.8} min={0.4} max={1} />
                <small>The whole interval is below 0.80.</small>
              </div>
              <div className="lp-verdict-item">
                <span className="tone-pill tone-warn">Inconclusive</span>
                <CiTrack lo={0.69} hi={0.85} point={0.78} threshold={0.8} min={0.4} max={1} />
                <small>The interval crosses 0.80, so more data is needed. Never shown as a pass.</small>
              </div>
              <div className="lp-verdict-item">
                <span className="tone-pill tone-good">No material disparity</span>
                <CiTrack lo={0.93} hi={1.0} point={0.97} threshold={0.8} min={0.4} max={1} />
                <small>The whole interval is at or above 0.80. Not a certificate of fairness.</small>
              </div>
            </div>
          </div>
        </section>

        <section className="lp-section" id="regulations" aria-labelledby="regs-title">
          <div className="lp-section-head">
            <div>
              <span className="mono-label">Regulations covered</span>
              <h2 id="regs-title">Mapped to the clauses your auditor will ask about.</h2>
            </div>
            <p>
              Each report lists every control as evidenced, partial or not evidenced. It never quietly claims
              coverage it doesn't have: human oversight and auditor independence are flagged as your steps.
            </p>
          </div>
          <div className="lp-regs">
            {REGS.map((r) => (
              <article className="lp-reg" key={r.name}>
                <h3>{r.name}</h3>
                <p>{r.body}</p>
                <ul>
                  {r.refs.map((ref) => (
                    <li key={ref}>{ref}</li>
                  ))}
                </ul>
                <div className="lp-reg-status">{r.status}. Verify before relying on it.</div>
              </article>
            ))}
          </div>
        </section>

        <section className="lp-section" id="compare" aria-labelledby="compare-title">
          <div className="lp-section-head">
            <div>
              <span className="mono-label">Where it fits</span>
              <h2 id="compare-title">Toolkits find the gap. BIAS-0 makes it evidence.</h2>
            </div>
            <p>
              Fairlearn, AIF360 and the What-If Tool are excellent libraries for the person building the model. BIAS-0
              is for the people who have to sign the fairness claim, often without the model. Use them together: BIAS-0
              for the audit, a toolkit for the fix.
            </p>
          </div>
          <div className="lp-compare-wrap" role="region" aria-label="Comparison with Fairlearn, AIF360 and the What-If Tool" tabIndex={0}>
            <table className="lp-compare">
              <thead>
                <tr>
                  <th scope="col"><span className="sr-only">Capability</span></th>
                  {COMPARE_TOOLS.map((t) => (
                    <th scope="col" key={t} className={t === "BIAS-0" ? "us" : undefined}>{t}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPARE.map((r) => (
                  <tr key={r.row}>
                    <th scope="row">{r.row}</th>
                    {r.cells.map((c, i) => (
                      <td key={COMPARE_TOOLS[i]} className={i === 0 ? "us" : undefined}>{c}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="lp-fineprint" style={{ marginTop: 14 }}>
            Summarised from each project's public documentation, November 2026. Fairlearn and AIF360 are open source and
            free; check their current releases before relying on this table.
          </p>
        </section>

        <section className="lp-section" aria-labelledby="who-title">
          <span className="mono-label">Built for</span>
          <h2 id="who-title" style={{ marginBottom: 28 }}>Teams who sign their name under a fairness claim.</h2>
          <div className="lp-who">
            <div>
              <h3>HR-tech and screening vendors</h3>
              <p>LL144 audits for US customers, AI Act evidence for EU buyers, one report reused across deals.</p>
            </div>
            <div>
              <h3>Digital lenders and NBFCs</h3>
              <p>Caste, region and pincode-proxy disparities, monitored month by month for the model-risk committee.</p>
            </div>
            <div>
              <h3>Insurers</h3>
              <p>Pricing and claims-triage decisions examined with the same validation discipline as credit.</p>
            </div>
            <div>
              <h3>Audit and law firms</h3>
              <p>A reproducible instrument. You stay the independent auditor who signs.</p>
            </div>
          </div>
        </section>

        <section className="lp-cta" aria-labelledby="cta-title">
          <div>
            <h2 id="cta-title">See your first verdict in under a minute.</h2>
            <p>Run the bundled lending log, or upload your own decision export. Nothing leaves your deployment.</p>
          </div>
          <div className="lp-cta-row" style={{ marginTop: 0 }}>
            <Link to="/assurance?sample=1" className="lp-btn lp-btn-primary">
              <FileCheck2 size={16} aria-hidden /> Run the sample audit
            </Link>
            <Link to="/assurance" className="lp-btn">Upload a log</Link>
          </div>
        </section>

        <footer className="lp-foot">
          <p>
            BIAS-0 never certifies a system as "unbiased". Reports state what was tested, on which data, on which date
            and with what uncertainty. This is a reporting aid, not legal advice.
          </p>
          <span>BIAS-0 Assurance · open-core fairness evidence</span>
        </footer>
      </div>
    </div>
  );
}
