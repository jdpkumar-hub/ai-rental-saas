"use client";

import { useState } from "react";

// ----------------------------------------------------------------------------
// Public landing page, now served as the actual root page of the app
// (see src/app/page.tsx) instead of always redirecting straight to
// /login. Visitors who aren't logged in see this; existing customers
// with a valid session still get redirected straight to their dashboard.
//
// This is the same design you provided as a static HTML file, converted
// to a real React component so the "Book a walkthrough" CTAs can submit
// to a real API route (/api/inquiries) instead of being dead `href="#"`
// links. Per your Path B choice, this does NOT create an account — it
// just records the inquiry for you to review and manually onboard via
// the platform-admin dashboard.
// ----------------------------------------------------------------------------
export default function LandingPage() {
  return (
    <div className="landing-page">
      <style>{landingStyles}</style>

      <header>
        <div className="wrap header-row">
          <a href="#" className="logo">
            <span className="logo-mark">R</span>
            AI Rental Office Assistant
          </a>
          <nav>
            <div className="nav-links">
              <a href="#problem">The Problem</a>
              <a href="#how">How It Works</a>
              <a href="#agent">The Agent</a>
              <a href="#pricing">Pricing</a>
            </div>
            <a href="#book" className="btn btn-ghost" style={{ marginLeft: 8 }}>
              Book a walkthrough
            </a>
          </nav>
        </div>
      </header>

      <section className="hero">
        <div className="wrap hero-inner">
          <p className="eyebrow">For property &amp; rental management companies</p>
          <h1>
            Every unread
            <br />
            inquiry is a unit
            <br />
            that stays <em>vacant</em>.
          </h1>
          <p className="hero-sub">
            AI Rental Office Assistant answers every call, text, and listing inquiry
            in seconds, qualifies the renter, and puts a showing on your calendar —
            at 11pm on a Sunday or noon on a Tuesday, doesn't matter.
          </p>
          <div className="hero-actions">
            <a href="#book" className="btn btn-clay">
              Book a walkthrough <span className="btn-arrow">→</span>
            </a>
            <a href="#how" className="btn btn-ghost">
              See how it answers a lead
            </a>
          </div>
          <p className="hero-note" style={{ marginTop: 22 }}>
            No long-term contract on the first portfolio · live in under a week
          </p>
        </div>

        <div className="ledger-strip">
          <div className="wrap">
            <div className="ledger-row-head">
              <span>Unit</span>
              <span>Inquiry</span>
              <span>Received</span>
              <span>Response time</span>
              <span>Outcome</span>
            </div>
            <div className="ledger-row">
              <span className="ledger-unit">#214</span>
              <span>"Is the 2BR on Elm still open?"</span>
              <span>Fri, 9:42 PM</span>
              <span>11 sec</span>
              <span>
                <span className="tag tag-caught">Showing booked</span>
              </span>
            </div>
            <div className="ledger-row">
              <span className="ledger-unit">#108</span>
              <span>"Do you allow large dogs?"</span>
              <span>Sat, 7:15 AM</span>
              <span>8 sec</span>
              <span>
                <span className="tag tag-caught">Qualified</span>
              </span>
            </div>
            <div className="ledger-row">
              <span className="ledger-unit">#331</span>
              <span>"Move-in date for the loft?"</span>
              <span>Sun, 11:03 PM</span>
              <span>14 sec</span>
              <span>
                <span className="tag tag-caught">Showing booked</span>
              </span>
            </div>
            <div className="ledger-row" style={{ opacity: 0.55 }}>
              <span className="ledger-unit">#077</span>
              <span>Voicemail, no callback logged</span>
              <span>Last month</span>
              <span>—</span>
              <span>
                <span className="tag tag-missed">Lost to competitor</span>
              </span>
            </div>
          </div>
        </div>
      </section>

      <section id="problem">
        <div className="wrap">
          <span className="kicker">The actual cost of slow response</span>
          <h2>
            Your leasing team isn't slow. They're just one team covering every
            unit, every hour.
          </h2>
          <p className="lede">
            A renter calls four listings at once and tours whoever answers first.
            Every minute your team spends on a lease renewal, a maintenance call,
            or just being asleep is a minute a competing property has the lead
            instead.
          </p>

          <div className="problem-grid">
            <div className="problem-card">
              <span className="problem-num">01</span>
              <h3>After-hours goes unanswered</h3>
              <p>
                Inquiries on evenings, weekends, and holidays sit until Monday
                morning — by which point the renter has already toured somewhere
                else.
              </p>
              <div className="problem-stat">
                Roughly <b>40%</b> of rental inquiries arrive outside business
                hours.
              </div>
            </div>
            <div className="problem-card">
              <span className="problem-num">02</span>
              <h3>Unqualified showings eat the calendar</h3>
              <p>
                Leasing agents drive out for tours with renters who don't meet
                income or move-in requirements, found out only in person.
              </p>
              <div className="problem-stat">
                Pre-qualifying by phone cuts <b>no-show tours</b> before they're
                booked.
              </div>
            </div>
            <div className="problem-card">
              <span className="problem-num">03</span>
              <h3>Follow-up just doesn't happen</h3>
              <p>
                A renter who didn't book on the first call rarely gets a second
                touch — not from neglect, just from volume.
              </p>
              <div className="problem-stat">
                Most leads convert on the <b>2nd–4th</b> contact, not the first.
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="how" className="section-dark">
        <div className="wrap">
          <span className="kicker">From first call to signed lease</span>
          <h2>What happens after a renter calls your leasing office</h2>
          <p className="lede">
            This is the actual sequence, in order — because the order is what
            determines whether the unit gets filled this week or sits another
            month.
          </p>

          <div className="sequence">
            <div className="seq-row">
              <div className="seq-num">01</div>
              <div className="seq-body">
                <h3>Call lands, AI answers</h3>
                <p>
                  Every call to your number is answered immediately by an
                  assistant trained on your unit details, pricing, and
                  availability — no hold music, no voicemail.
                </p>
                <span className="seq-time">Median response: under 1 second</span>
              </div>
            </div>
            <div className="seq-row">
              <div className="seq-num">02</div>
              <div className="seq-body">
                <h3>Renter gets qualified, conversationally</h3>
                <p>
                  Name, budget, move-in date, apartment size — asked naturally in
                  conversation, captured structurally, so your team only sees
                  renters worth a callback.
                </p>
                <span className="seq-time">
                  No application fee collected at this stage
                </span>
              </div>
            </div>
            <div className="seq-row">
              <div className="seq-num">03</div>
              <div className="seq-body">
                <h3>Lead lands in your dashboard</h3>
                <p>
                  Full transcript, recording, and structured details appear in
                  your Call History the moment the call ends — no manual data
                  entry.
                </p>
                <span className="seq-time">Visible to your team in real time</span>
              </div>
            </div>
            <div className="seq-row">
              <div className="seq-num">04</div>
              <div className="seq-body">
                <h3>Your team follows up and closes</h3>
                <p>
                  Your leasing agents pick up a qualified, already-screened lead
                  and spend their hours on tours and signings — not on triage.
                </p>
                <span className="seq-time">
                  Handoff includes full conversation history
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="agent">
        <div className="wrap">
          <span className="kicker">What's actually running behind the scenes</span>
          <h2>One assistant, configured for how your office actually leases</h2>
          <p className="lede">
            Each capability below is built against your real property data —
            current vacancies, pricing, your greeting, your voice — not a generic
            script.
          </p>

          <div className="cap-table">
            <div className="cap-row">
              <div className="cap-name">Inquiry response</div>
              <div className="cap-desc">
                Answers calls about your units — pricing, availability, square
                footage, pet policy — with your own custom greeting, day or night.
              </div>
              <div className="cap-meta">Phone · 24/7</div>
            </div>
            <div className="cap-row">
              <div className="cap-name">Renter qualification</div>
              <div className="cap-desc">
                Asks the questions your application would ask anyway — budget,
                move-in timeline, apartment size — before a callback is ever
                needed.
              </div>
              <div className="cap-meta">Configurable per property</div>
            </div>
            <div className="cap-row">
              <div className="cap-name">Call History dashboard</div>
              <div className="cap-desc">
                Every call shows up with its full transcript, recording, and the
                lead it produced — searchable, playable, all in one place.
              </div>
              <div className="cap-meta">Live as calls happen</div>
            </div>
            <div className="cap-row">
              <div className="cap-name">Multi-property support</div>
              <div className="cap-desc">
                Each property gets its own phone number, its own greeting, and
                its own data — fully separated, even when one team runs several.
              </div>
              <div className="cap-meta">One dashboard, every property</div>
            </div>
            <div className="cap-row">
              <div className="cap-name">Lead &amp; analytics dashboard</div>
              <div className="cap-desc">
                Hot leads, cold leads, peak call times, and conversion trends —
                so you can see what the assistant is actually doing for your
                office.
              </div>
              <div className="cap-meta">Updated continuously</div>
            </div>
            <div className="cap-row">
              <div className="cap-name">Team &amp; role management</div>
              <div className="cap-desc">
                Admins and leasing agents get their own logins, with the right
                access to leads, calls, and settings for their role.
              </div>
              <div className="cap-meta">Unlimited users per plan</div>
            </div>
          </div>
        </div>
      </section>

      <section id="pricing" className="section-dark">
        <div className="wrap">
          <span className="kicker">Setup &amp; monthly management</span>
          <h2>Priced like a leasing hire, not a software subscription</h2>
          <p className="lede">
            A one-time setup against your current property and phone number, then
            a flat monthly fee to run and maintain it. No per-lead charges, no
            long contract on the first property.
          </p>

          <div className="price-grid">
            <div className="price-card">
              <span className="price-label">Single property</span>
              <h3>Starter</h3>
              <p className="desc">
                For one building or a small portfolio testing the assistant on
                real inquiries.
              </p>
              <div className="price-amount">
                $1,200 <span>setup</span>
              </div>
              <div className="price-amount" style={{ fontSize: 26 }}>
                $650 <span>/month</span>
              </div>
              <ul className="price-list">
                <li>One property, up to 50 units</li>
                <li>24/7 phone coverage</li>
                <li>Renter qualification &amp; Call History</li>
                <li>One admin + one agent login</li>
              </ul>
              <a
                href="#book"
                className="btn btn-ghost"
                style={{ width: "100%", justifyContent: "center" }}
              >
                Start with one property
              </a>
            </div>
            <div className="price-card featured">
              <span className="price-label">Multi-property portfolio</span>
              <h3>Portfolio</h3>
              <p className="desc">
                For management companies running several properties under one
                leasing operation.
              </p>
              <div className="price-amount">
                $2,500 <span>setup</span>
              </div>
              <div className="price-amount" style={{ fontSize: 26 }}>
                $1,400 <span>/month</span>
              </div>
              <ul className="price-list">
                <li>Up to 6 properties, unlimited units</li>
                <li>Everything in Starter</li>
                <li>Lead &amp; analytics dashboard</li>
                <li>Unlimited team logins &amp; roles</li>
                <li>Quarterly strategy review</li>
              </ul>
              <a
                href="#book"
                className="btn btn-clay"
                style={{ width: "100%", justifyContent: "center" }}
              >
                Book a walkthrough
              </a>
            </div>
          </div>
          <p
            style={{
              marginTop: 28,
              fontFamily: "var(--mono)",
              fontSize: 13,
              color: "rgba(251,248,243,0.5)",
            }}
          >
            Larger portfolios (7+ properties) — ask for a custom rate based on
            unit count.
          </p>
        </div>
      </section>

      <section className="cta-band" id="book">
        <div className="wrap">
          <InquiryForm />
        </div>
      </section>

      <footer>
        <div className="wrap foot-row">
          <span>
            AI Rental Office Assistant — AI leasing assistants for rental &amp;
            property management companies
          </span>
          <a href="mailto:hello@yourdomain.com">hello@yourdomain.com</a>
        </div>
      </footer>
    </div>
  );
}

// ----------------------------------------------------------------------------
// InquiryForm
//
// The actual working replacement for the old dead "Book a walkthrough"
// link. Submits to /api/inquiries (public, no auth) — see that route for
// why this intentionally does NOT create an account: per your Path B
// choice, you review inquiries yourself in the platform-admin dashboard
// and manually onboard whoever you decide to take on.
// ----------------------------------------------------------------------------
function InquiryForm() {
  const [form, setForm] = useState({
    contact_name: "",
    company_name: "",
    email: "",
    phone: "",
    message: "",
  });
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">(
    "idle"
  );
  const [error, setError] = useState<string | null>(null);

  function update(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("submitting");
    setError(null);
    try {
      const res = await fetch("/api/inquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong. Please try again.");
        setStatus("error");
        return;
      }
      setStatus("success");
    } catch {
      setError("Could not reach the server. Please try again.");
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div className="center" style={{ maxWidth: 560, margin: "0 auto" }}>
        <h2 className="center">Thanks — we've got it.</h2>
        <p className="lede center">
          We'll follow up by email shortly to set up a time to walk through your
          last 30 days of calls and what the assistant would catch.
        </p>
      </div>
    );
  }

  return (
    <>
      <h2 className="center">
        Let's look at what your last 30 days of calls actually cost you.
      </h2>
      <p className="lede center">
        Tell us a bit about your property and we'll follow up to set up a 20
        minute walkthrough — bring your call log or voicemail history and we'll
        show you exactly where leads went cold.
      </p>

      <form onSubmit={handleSubmit} className="inquiry-form">
        <div className="inquiry-grid">
          <input
            type="text"
            placeholder="Your name"
            value={form.contact_name}
            onChange={(e) => update("contact_name", e.target.value)}
            required
            className="inquiry-input"
          />
          <input
            type="text"
            placeholder="Company / property name"
            value={form.company_name}
            onChange={(e) => update("company_name", e.target.value)}
            required
            className="inquiry-input"
          />
          <input
            type="email"
            placeholder="Email"
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
            required
            className="inquiry-input"
          />
          <input
            type="tel"
            placeholder="Phone (optional)"
            value={form.phone}
            onChange={(e) => update("phone", e.target.value)}
            className="inquiry-input"
          />
        </div>
        <textarea
          placeholder="Anything else we should know? (optional)"
          value={form.message}
          onChange={(e) => update("message", e.target.value)}
          className="inquiry-textarea"
          rows={3}
        />

        {error && <div className="inquiry-error">{error}</div>}

        <button type="submit" disabled={status === "submitting"} className="btn btn-clay">
          {status === "submitting" ? "Sending…" : "Book a walkthrough"}
          {status !== "submitting" && <span className="btn-arrow">→</span>}
        </button>
      </form>
    </>
  );
}

const landingStyles = `
  :root{
    --ink:#1C1815;
    --charcoal:#241B14;
    --charcoal-soft:#2F241B;
    --paper:#FBF8F3;
    --paper-dim:#F0EAE0;
    --clay:#B5562F;
    --clay-bright:#E0875A;
    --rust:#8F4322;
    --line: rgba(251,248,243,0.14);
    --line-dark: rgba(28,24,21,0.13);
    --display: 'Source Serif 4', Georgia, serif;
    --body: 'Archivo', sans-serif;
    --mono: 'IBM Plex Mono', monospace;
  }

  .landing-page *{margin:0;padding:0;box-sizing:border-box;}
  .landing-page{
    background:var(--paper);
    color:var(--ink);
    font-family:var(--body);
    line-height:1.5;
    -webkit-font-smoothing:antialiased;
  }
  .landing-page img{max-width:100%;display:block;}
  .landing-page a{color:inherit;}

  .landing-page .wrap{max-width:1180px;margin:0 auto;padding:0 32px;}
  @media(max-width:640px){.landing-page .wrap{padding:0 20px;}}

  .landing-page .btn{
    display:inline-flex;align-items:center;gap:10px;
    font-family:var(--body);font-weight:700;font-size:15px;
    padding:15px 28px;border-radius:4px;
    text-decoration:none;cursor:pointer;border:1.5px solid transparent;
    transition:transform .15s ease, background .2s ease, color .2s ease, border-color .2s ease;
    letter-spacing:0.01em;
  }
  .landing-page .btn:focus-visible{outline:3px solid var(--clay-bright);outline-offset:2px;}
  .landing-page .btn-clay{background:var(--clay);color:var(--paper);}
  .landing-page .btn-clay:hover{background:var(--clay-bright);transform:translateY(-1px);}
  .landing-page .btn-clay:disabled{opacity:0.6;cursor:default;transform:none;}
  .landing-page .btn-ghost{background:transparent;color:var(--paper);border-color:var(--line);}
  .landing-page .btn-ghost:hover{border-color:var(--clay-bright);color:var(--clay-bright);}
  .landing-page .btn-arrow{transition:transform .2s ease;}
  .landing-page .btn:hover .btn-arrow{transform:translateX(3px);}

  .landing-page header{
    position:sticky;top:0;z-index:50;
    background:var(--charcoal);
    border-bottom:1px solid var(--line);
  }
  .landing-page .header-row{
    display:flex;align-items:center;justify-content:space-between;
    padding:18px 0;
  }
  .landing-page .logo{
    display:flex;align-items:center;gap:10px;
    font-family:var(--display);font-weight:700;font-size:20px;
    color:var(--paper);letter-spacing:0;
    text-decoration:none;
  }
  .landing-page .logo-mark{
    width:30px;height:30px;flex:none;
    border-radius:6px;
    background:var(--clay);
    display:flex;align-items:center;justify-content:center;
    font-family:var(--display);font-weight:700;font-size:16px;
    color:var(--paper);
  }
  .landing-page nav{display:flex;gap:32px;align-items:center;}
  .landing-page nav a{
    color:var(--paper);opacity:0.75;text-decoration:none;
    font-size:14.5px;font-weight:500;
    transition:opacity .2s ease;
  }
  .landing-page nav a:hover{opacity:1;color:var(--clay-bright);}
  .landing-page .nav-links{display:flex;gap:32px;}
  @media(max-width:780px){.landing-page .nav-links{display:none;}}

  .landing-page .hero{
    background:var(--charcoal);
    color:var(--paper);
    position:relative;
    overflow:hidden;
    padding:88px 0 0;
  }
  .landing-page .hero::before{
    content:"";
    position:absolute; inset:0;
    background-image:
      repeating-linear-gradient(0deg, transparent, transparent 27px, var(--line) 27px, var(--line) 28px);
    opacity:0.5;
    pointer-events:none;
  }
  .landing-page .hero-inner{position:relative;z-index:1;}
  .landing-page .eyebrow{
    font-family:var(--mono);
    font-size:12.5px;letter-spacing:0.14em;text-transform:uppercase;
    color:var(--clay-bright);
    display:flex;align-items:center;gap:10px;
    margin-bottom:28px;
  }
  .landing-page .eyebrow::before{content:"";width:7px;height:7px;border-radius:50%;background:var(--clay-bright);box-shadow:0 0 0 3px rgba(224,135,90,0.25);}

  .landing-page h1{
    font-family:var(--display);
    font-weight:700;
    font-size:clamp(40px, 6vw, 76px);
    line-height:1.04;
    letter-spacing:-0.01em;
    max-width:880px;
  }
  .landing-page h1 em{
    font-style:normal;
    color:var(--clay-bright);
  }
  .landing-page .hero-sub{
    margin-top:26px;
    font-size:19px;
    max-width:560px;
    color:rgba(251,248,243,0.78);
    font-weight:400;
  }
  .landing-page .hero-actions{
    margin-top:38px;
    display:flex;gap:16px;flex-wrap:wrap;
    align-items:center;
  }
  .landing-page .hero-note{
    font-family:var(--mono);font-size:12.5px;color:rgba(251,248,243,0.55);
  }

  .landing-page .ledger-strip{
    margin-top:72px;
    border-top:1px solid var(--line);
    background:var(--charcoal-soft);
    position:relative;z-index:1;
  }
  .landing-page .ledger-row-head, .landing-page .ledger-row{
    display:grid;
    grid-template-columns: 90px 1.4fr 1fr 1fr 110px;
    gap:18px;
    padding:16px 0;
    align-items:center;
  }
  .landing-page .ledger-row-head{
    font-family:var(--mono);font-size:11px;letter-spacing:0.08em;text-transform:uppercase;
    color:rgba(251,248,243,0.45);
    border-bottom:1px solid var(--line);
  }
  .landing-page .ledger-row{
    font-family:var(--mono);font-size:13.5px;
    color:rgba(251,248,243,0.85);
    border-bottom:1px solid var(--line);
  }
  .landing-page .ledger-row:last-child{border-bottom:none;}
  .landing-page .ledger-unit{color:var(--clay-bright);font-weight:500;}
  .landing-page .tag{
    display:inline-flex;align-items:center;gap:6px;
    font-size:11px;letter-spacing:0.06em;text-transform:uppercase;
    padding:4px 9px;border-radius:3px;
  }
  .landing-page .tag-missed{background:rgba(143,67,34,0.22);color:#E08A63;}
  .landing-page .tag-caught{background:rgba(224,135,90,0.16);color:var(--clay-bright);}
  @media(max-width:780px){
    .landing-page .ledger-row-head{display:none;}
    .landing-page .ledger-row{grid-template-columns:1fr;gap:4px;padding:14px 0;}
    .landing-page .ledger-row span:nth-child(1){color:var(--clay-bright);font-weight:600;}
  }

  .landing-page section{padding:96px 0;}
  @media(max-width:640px){.landing-page section{padding:64px 0;}}
  .landing-page .section-dark{background:var(--charcoal);color:var(--paper);}
  .landing-page .kicker{
    font-family:var(--mono);font-size:12.5px;letter-spacing:0.12em;text-transform:uppercase;
    color:var(--clay);
    margin-bottom:16px;
    display:block;
  }
  .landing-page .section-dark .kicker{color:var(--clay-bright);}
  .landing-page h2{
    font-family:var(--display);font-weight:700;
    font-size:clamp(30px, 4vw, 46px);
    line-height:1.1;
    letter-spacing:-0.005em;
    max-width:760px;
  }
  .landing-page .lede{
    font-size:17.5px;
    max-width:600px;
    margin-top:18px;
    color:rgba(28,24,21,0.68);
  }
  .landing-page .section-dark .lede{color:rgba(251,248,243,0.7);}

  .landing-page .problem-grid{
    margin-top:56px;
    display:grid;grid-template-columns:repeat(3,1fr);gap:1px;
    background:var(--line-dark);
    border:1px solid var(--line-dark);
  }
  @media(max-width:880px){.landing-page .problem-grid{grid-template-columns:1fr;}}
  .landing-page .problem-card{
    background:var(--paper);
    padding:34px 30px;
  }
  .landing-page .problem-num{
    font-family:var(--mono);font-size:13px;color:var(--clay);
    margin-bottom:18px;display:block;
  }
  .landing-page .problem-card h3{
    font-family:var(--display);font-weight:700;font-size:21px;
    margin-bottom:10px;letter-spacing:0;
  }
  .landing-page .problem-card p{
    font-size:15px;color:rgba(28,24,21,0.62);
  }
  .landing-page .problem-stat{
    margin-top:18px;
    font-family:var(--mono);font-size:12.5px;
    color:var(--ink);
    padding-top:14px;border-top:1px solid var(--line-dark);
  }
  .landing-page .problem-stat b{color:var(--clay);font-weight:600;}

  .landing-page .sequence{margin-top:64px;}
  .landing-page .seq-row{
    display:grid;
    grid-template-columns:64px 1fr;
    gap:28px;
    padding:34px 0;
    border-top:1px solid var(--line);
    position:relative;
  }
  .landing-page .seq-row:first-child{border-top:1px solid var(--line);}
  .landing-page .seq-num{
    font-family:var(--display);font-weight:700;font-size:36px;
    color:var(--clay-bright);
    line-height:1;
  }
  .landing-page .seq-body h3{
    font-family:var(--display);font-weight:700;font-size:22px;
    color:var(--paper);margin-bottom:8px;letter-spacing:0;
  }
  .landing-page .seq-body p{color:rgba(251,248,243,0.65);font-size:15.5px;max-width:600px;}
  .landing-page .seq-time{
    font-family:var(--mono);font-size:12px;color:var(--clay-bright);
    margin-top:10px;display:inline-block;
  }
  @media(max-width:640px){.landing-page .seq-row{grid-template-columns:1fr;gap:10px;}}

  .landing-page .cap-table{margin-top:56px;border-top:1px solid var(--line-dark);}
  .landing-page .cap-row{
    display:grid;
    grid-template-columns: 1.1fr 1.6fr 0.9fr;
    gap:24px;
    padding:28px 0;
    border-bottom:1px solid var(--line-dark);
    align-items:start;
  }
  @media(max-width:780px){.landing-page .cap-row{grid-template-columns:1fr;gap:8px;}}
  .landing-page .cap-name{
    font-family:var(--display);font-weight:700;font-size:19px;
    letter-spacing:0;
  }
  .landing-page .cap-desc{font-size:15px;color:rgba(28,24,21,0.64);}
  .landing-page .cap-meta{
    font-family:var(--mono);font-size:12.5px;color:var(--clay);
    text-align:right;
  }
  @media(max-width:780px){.landing-page .cap-meta{text-align:left;}}

  .landing-page .price-grid{
    margin-top:56px;
    display:grid;grid-template-columns:1fr 1fr;gap:24px;
  }
  @media(max-width:780px){.landing-page .price-grid{grid-template-columns:1fr;}}
  .landing-page .price-card{
    background:var(--charcoal-soft);
    border:1px solid var(--line);
    padding:38px 34px;
    position:relative;
  }
  .landing-page .price-card.featured{
    border-color:var(--clay);
    background:linear-gradient(165deg, var(--charcoal-soft), #3A2B1F);
  }
  .landing-page .price-card.featured::before{
    content:"MOST COMMON";
    position:absolute;top:-1px;right:24px;
    background:var(--clay);color:var(--paper);
    font-family:var(--mono);font-size:10.5px;letter-spacing:0.08em;
    padding:5px 10px;
  }
  .landing-page .price-label{
    font-family:var(--mono);font-size:12.5px;letter-spacing:0.08em;text-transform:uppercase;
    color:var(--clay-bright);margin-bottom:14px;display:block;
  }
  .landing-page .price-card h3{
    font-family:var(--display);font-weight:700;font-size:27px;
    color:var(--paper);margin-bottom:6px;
  }
  .landing-page .price-amount{
    font-family:var(--display);font-weight:700;font-size:44px;color:var(--paper);
    margin:18px 0 6px;
  }
  .landing-page .price-amount span{font-family:var(--mono);font-size:15px;font-weight:400;color:rgba(251,248,243,0.5);}
  .landing-page .price-card p.desc{color:rgba(251,248,243,0.62);font-size:14.5px;margin-bottom:24px;}
  .landing-page .price-list{list-style:none;margin:0 0 28px;padding:0;}
  .landing-page .price-list li{
    font-size:14.5px;color:rgba(251,248,243,0.82);
    padding:9px 0;border-top:1px solid var(--line);
    display:flex;gap:10px;
  }
  .landing-page .price-list li:first-child{border-top:none;}
  .landing-page .price-list li::before{content:"—";color:var(--clay-bright);flex:none;}

  .landing-page .cta-band{
    background:var(--clay);
    color:var(--paper);
    padding:80px 0;
    text-align:center;
  }
  .landing-page .cta-band h2{margin:0 auto;color:var(--paper);}
  .landing-page .cta-band .lede{margin:18px auto 36px;color:rgba(251,248,243,0.9);}
  .landing-page .cta-band .btn-clay{background:var(--charcoal);color:var(--clay-bright);}
  .landing-page .cta-band .btn-clay:hover{background:var(--ink);color:var(--clay-bright);}

  .landing-page .inquiry-form{
    max-width:560px;margin:0 auto;text-align:left;
  }
  .landing-page .inquiry-grid{
    display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;
  }
  @media(max-width:640px){.landing-page .inquiry-grid{grid-template-columns:1fr;}}
  .landing-page .inquiry-input, .landing-page .inquiry-textarea{
    width:100%;
    font-family:var(--body);font-size:14.5px;
    padding:12px 14px;border-radius:4px;
    border:1.5px solid rgba(251,248,243,0.3);
    background:rgba(251,248,243,0.08);
    color:var(--paper);
  }
  .landing-page .inquiry-input::placeholder, .landing-page .inquiry-textarea::placeholder{
    color:rgba(251,248,243,0.5);
  }
  .landing-page .inquiry-textarea{margin-bottom:16px;resize:vertical;font-family:var(--body);}
  .landing-page .inquiry-error{
    background:rgba(28,24,21,0.3);
    border:1px solid rgba(251,248,243,0.3);
    color:var(--paper);
    padding:10px 14px;border-radius:4px;
    font-size:13.5px;margin-bottom:16px;
  }

  .landing-page footer{
    background:var(--charcoal);color:rgba(251,248,243,0.5);
    padding:48px 0 36px;
    font-size:13.5px;
  }
  .landing-page .foot-row{display:flex;justify-content:space-between;flex-wrap:wrap;gap:16px;align-items:center;}
  .landing-page .foot-row a{text-decoration:none;opacity:0.85;}
  .landing-page .foot-row a:hover{color:var(--clay-bright);}

  .landing-page .center{text-align:center;margin-left:auto;margin-right:auto;}
`;
