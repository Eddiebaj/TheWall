import type { VercelRequest, VercelResponse } from '@vercel/node';

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>TheWall for Venues — Reach Toronto's Nightlife Crowd</title>
  <meta name="description" content="Get your venue seen by thousands of Toronto nightlife users. List events, boost visibility, and grow your crowd — all in one place." />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --accent: #FF3B5C;
      --gold: #FFD700;
      --bg: #0a0a0a;
      --surface: #111111;
      --border: rgba(255,255,255,0.08);
      --text: #ffffff;
      --text-muted: rgba(255,255,255,0.45);
      --text-dim: rgba(255,255,255,0.3);
    }

    html { scroll-behavior: smooth; }

    body {
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
    }

    a { color: inherit; text-decoration: none; }

    .container {
      width: 100%;
      max-width: 1080px;
      margin: 0 auto;
      padding: 0 24px;
    }

    /* ── Divider ── */
    .divider {
      height: 1px;
      background: var(--border);
      margin: 0 24px;
    }

    /* ── Hero ── */
    .hero {
      padding: 100px 0 80px;
    }

    .pill {
      display: inline-block;
      background: rgba(255, 59, 92, 0.13);
      border: 1px solid rgba(255, 59, 92, 0.33);
      border-radius: 100px;
      padding: 5px 14px;
      margin-bottom: 24px;
      font-size: 11px;
      font-weight: 800;
      color: var(--accent);
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }

    .hero-title {
      font-size: clamp(32px, 5vw, 48px);
      font-weight: 900;
      line-height: 1.15;
      margin-bottom: 20px;
      max-width: 680px;
    }

    .hero-title .highlight { color: var(--accent); }

    .hero-sub {
      font-size: 18px;
      color: var(--text-muted);
      line-height: 1.6;
      max-width: 540px;
      margin-bottom: 40px;
    }

    .btn {
      display: inline-block;
      background: var(--accent);
      color: #fff;
      border-radius: 12px;
      padding: 16px 32px;
      font-size: 16px;
      font-weight: 800;
      letter-spacing: 0.3px;
      cursor: pointer;
      border: none;
      transition: opacity 0.15s;
    }

    .btn:hover { opacity: 0.88; }

    /* ── Sections ── */
    .section { padding: 80px 0; }

    .section-label {
      font-size: 11px;
      font-weight: 800;
      color: var(--accent);
      text-transform: uppercase;
      letter-spacing: 1.5px;
      margin-bottom: 12px;
    }

    .section-title {
      font-size: clamp(24px, 3vw, 32px);
      font-weight: 800;
      color: var(--text);
      margin-bottom: 12px;
      max-width: 560px;
    }

    .section-sub {
      font-size: 16px;
      color: var(--text-muted);
      line-height: 1.6;
      max-width: 480px;
      margin-bottom: 48px;
    }

    /* ── Steps ── */
    .steps-row {
      display: flex;
      flex-wrap: wrap;
      gap: 20px;
      margin-top: 48px;
    }

    .step-card {
      flex: 1 1 240px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 28px;
    }

    .step-number {
      font-size: 13px;
      font-weight: 800;
      color: var(--accent);
      letter-spacing: 1px;
      margin-bottom: 16px;
    }

    .step-title {
      font-size: 18px;
      font-weight: 700;
      color: var(--text);
      margin-bottom: 10px;
    }

    .step-desc {
      font-size: 14px;
      color: rgba(255,255,255,0.5);
      line-height: 1.6;
    }

    /* ── Pricing ── */
    .pricing-row {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
    }

    .pricing-card {
      flex: 1 1 260px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 18px;
      padding: 28px;
      display: flex;
      flex-direction: column;
    }

    .pricing-card.featured { border-color: var(--gold); border-width: 1.5px; }

    .plan-badge {
      display: inline-block;
      border: 1px solid;
      border-radius: 6px;
      padding: 3px 8px;
      margin-bottom: 20px;
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.8px;
    }

    .plan-badge-spacer { height: 27px; margin-bottom: 20px; }

    .plan-name {
      font-size: 20px;
      font-weight: 800;
      color: var(--text);
      margin-bottom: 8px;
    }

    .plan-name.gold { color: var(--gold); }

    .price-row {
      display: flex;
      align-items: baseline;
      gap: 2px;
      margin-bottom: 24px;
    }

    .plan-price {
      font-size: 40px;
      font-weight: 900;
      line-height: 1.1;
    }

    .plan-period {
      font-size: 14px;
      color: rgba(255,255,255,0.4);
      margin-bottom: 2px;
    }

    .feature-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-bottom: 28px;
      flex: 1;
    }

    .feature-row {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .feature-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .feature-text {
      font-size: 14px;
      color: rgba(255,255,255,0.7);
      line-height: 1.4;
    }

    .plan-cta {
      display: block;
      text-align: center;
      border-radius: 12px;
      padding: 14px;
      font-size: 15px;
      font-weight: 800;
      color: #fff;
      margin-top: auto;
      transition: opacity 0.15s;
    }

    .plan-cta:hover { opacity: 0.88; }
    .plan-cta.dark-text { color: #000; }

    /* ── Social proof ── */
    .venue-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }

    .venue-chip {
      display: flex;
      align-items: center;
      gap: 8px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 100px;
      padding: 10px 16px;
    }

    .venue-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--accent);
      flex-shrink: 0;
    }

    .venue-name {
      font-size: 14px;
      font-weight: 500;
      color: rgba(255,255,255,0.75);
    }

    /* ── Final CTA ── */
    .final-cta {
      background: #0f0f0f;
      border-top: 1px solid var(--border);
    }

    .final-cta-title {
      font-size: clamp(28px, 4vw, 36px);
      font-weight: 900;
      color: var(--text);
      margin-bottom: 12px;
      max-width: 480px;
    }

    .final-cta-sub {
      font-size: 16px;
      color: var(--text-muted);
      line-height: 1.6;
      max-width: 400px;
      margin-bottom: 36px;
    }

    /* ── Footer ── */
    .footer {
      border-top: 1px solid var(--border);
      padding: 32px 0;
    }

    .footer-inner {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }

    .footer-brand {
      font-size: 16px;
      font-weight: 900;
      color: var(--text);
      letter-spacing: 0.5px;
    }

    .footer-copy {
      font-size: 13px;
      color: var(--text-dim);
    }

    .footer-contact {
      font-size: 13px;
      color: rgba(255,255,255,0.4);
    }

    .footer-contact a:hover { color: var(--text); }

    @media (max-width: 600px) {
      .hero { padding: 64px 0 56px; }
      .section { padding: 56px 0; }
      .hero-sub { font-size: 16px; }
    }
  </style>
</head>
<body>

  <!-- ── Hero ── -->
  <section class="hero">
    <div class="container">
      <div class="pill">Toronto's #1 nightlife app</div>
      <h1 class="hero-title">
        Get your venue seen by <span class="highlight">thousands</span> of Toronto nightlife users
      </h1>
      <p class="hero-sub">
        TheWall connects venue owners with Toronto's most active nightlife audience.
        List your events, boost your visibility, and grow your crowd — all in one place.
      </p>
      <a href="#pricing" class="btn">Get Started</a>
    </div>
  </section>

  <div class="divider"></div>

  <!-- ── How it works ── -->
  <section class="section">
    <div class="container">
      <div class="section-label">How it works</div>
      <h2 class="section-title">Simple. Powerful. Automatic.</h2>
      <div class="steps-row">
        <div class="step-card">
          <div class="step-number">01</div>
          <div class="step-title">Automatic event listings</div>
          <p class="step-desc">We list your events automatically via Ticketmaster — no manual uploads needed.</p>
        </div>
        <div class="step-card">
          <div class="step-number">02</div>
          <div class="step-title">Discovery on map &amp; feed</div>
          <p class="step-desc">Users discover your venue on our interactive map and curated nightlife feed.</p>
        </div>
        <div class="step-card">
          <div class="step-number">03</div>
          <div class="step-title">Priority placement</div>
          <p class="step-desc">Featured venues get priority placement in search results, the map, and more RSVPs.</p>
        </div>
      </div>
    </div>
  </section>

  <div class="divider"></div>

  <!-- ── Pricing ── -->
  <section class="section" id="pricing">
    <div class="container">
      <div class="section-label">Pricing</div>
      <h2 class="section-title">One flat monthly rate. No surprises.</h2>
      <p class="section-sub">Cancel anytime. Billed monthly via Stripe.</p>
      <div class="pricing-row">

        <!-- Basic -->
        <div class="pricing-card">
          <div class="plan-badge-spacer"></div>
          <div class="plan-name">Basic</div>
          <div class="price-row">
            <span class="plan-price" style="color: #FF3B5C;">$49</span>
            <span class="plan-period">/mo</span>
          </div>
          <div class="feature-list">
            <div class="feature-row">
              <div class="feature-dot" style="background: #FF3B5C;"></div>
              <span class="feature-text">Featured badge on map</span>
            </div>
            <div class="feature-row">
              <div class="feature-dot" style="background: #FF3B5C;"></div>
              <span class="feature-text">Algorithm priority boost</span>
            </div>
          </div>
          <a href="/business/signup" class="plan-cta" style="background: #FF3B5C;">Get Started</a>
        </div>

        <!-- Pro -->
        <div class="pricing-card">
          <div class="plan-badge" style="color: #FF3B5C; background: rgba(255,59,92,0.13); border-color: rgba(255,59,92,0.33);">POPULAR</div>
          <div class="plan-name">Pro</div>
          <div class="price-row">
            <span class="plan-price" style="color: #FF3B5C;">$99</span>
            <span class="plan-period">/mo</span>
          </div>
          <div class="feature-list">
            <div class="feature-row">
              <div class="feature-dot" style="background: #FF3B5C;"></div>
              <span class="feature-text">Everything in Basic</span>
            </div>
            <div class="feature-row">
              <div class="feature-dot" style="background: #FF3B5C;"></div>
              <span class="feature-text">Analytics dashboard</span>
            </div>
            <div class="feature-row">
              <div class="feature-dot" style="background: #FF3B5C;"></div>
              <span class="feature-text">RSVP, saves &amp; views data</span>
            </div>
          </div>
          <a href="/business/signup" class="plan-cta" style="background: #FF3B5C;">Get Started</a>
        </div>

        <!-- Featured -->
        <div class="pricing-card featured">
          <div class="plan-badge" style="color: #FFD700; background: rgba(255,215,0,0.13); border-color: rgba(255,215,0,0.33);">BEST</div>
          <div class="plan-name gold">Featured</div>
          <div class="price-row">
            <span class="plan-price" style="color: #FFD700;">$149</span>
            <span class="plan-period">/mo</span>
          </div>
          <div class="feature-list">
            <div class="feature-row">
              <div class="feature-dot" style="background: #FFD700;"></div>
              <span class="feature-text">Everything in Pro</span>
            </div>
            <div class="feature-row">
              <div class="feature-dot" style="background: #FFD700;"></div>
              <span class="feature-text">Strongest algorithm boost</span>
            </div>
            <div class="feature-row">
              <div class="feature-dot" style="background: #FFD700;"></div>
              <span class="feature-text">Featured badge on event cards</span>
            </div>
          </div>
          <a href="/business/signup" class="plan-cta dark-text" style="background: #FFD700;">Get Started</a>
        </div>

      </div>
    </div>
  </section>

  <div class="divider"></div>

  <!-- ── Social proof ── -->
  <section class="section">
    <div class="container">
      <div class="section-label">Social proof</div>
      <h2 class="section-title">Join venues already on TheWall</h2>
      <p class="section-sub">Toronto's top nightlife destinations trust TheWall to reach their audience.</p>
      <div class="venue-grid">
        <div class="venue-chip"><div class="venue-dot"></div><span class="venue-name">Rebel Entertainment Complex</span></div>
        <div class="venue-chip"><div class="venue-dot"></div><span class="venue-name">Coda Nightclub</span></div>
        <div class="venue-chip"><div class="venue-dot"></div><span class="venue-name">Toybox</span></div>
        <div class="venue-chip"><div class="venue-dot"></div><span class="venue-name">Nest Nightclub</span></div>
        <div class="venue-chip"><div class="venue-dot"></div><span class="venue-name">Orchid Nightclub</span></div>
        <div class="venue-chip"><div class="venue-dot"></div><span class="venue-name">Bar None</span></div>
        <div class="venue-chip"><div class="venue-dot"></div><span class="venue-name">Bisha Hotel Rooftop</span></div>
        <div class="venue-chip"><div class="venue-dot"></div><span class="venue-name">Wildflower</span></div>
      </div>
    </div>
  </section>

  <div class="divider"></div>

  <!-- ── Final CTA ── -->
  <section class="section final-cta">
    <div class="container">
      <h2 class="final-cta-title">Ready to grow your venue?</h2>
      <p class="final-cta-sub">Join TheWall and start reaching Toronto's nightlife crowd today.</p>
      <a href="/business/signup" class="btn">Get Started</a>
    </div>
  </section>

  <!-- ── Footer ── -->
  <footer class="footer">
    <div class="container footer-inner">
      <span class="footer-brand">TheWall</span>
      <span class="footer-copy">© 2026 TheWall. All rights reserved.</span>
      <a href="mailto:hello@thewall.app" class="footer-contact">hello@thewall.app</a>
    </div>
  </footer>

</body>
</html>`;

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(HTML);
}
