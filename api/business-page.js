const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>affiche for Venues — Reach Toronto's Nightlife Crowd</title>
  <meta name="description" content="Get your venue seen by thousands of Toronto nightlife users. List events, boost visibility, and grow your crowd — all in one place." />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      background: #0a0a0a;
      color: #fff;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
    }

    a { color: inherit; text-decoration: none; }

    .container {
      width: 100%;
      max-width: 1000px;
      margin: 0 auto;
      padding: 0 24px;
    }

    /* ── Nav ── */
    .nav {
      padding: 20px 0;
      border-bottom: 1px solid rgba(255,255,255,0.07);
    }
    .nav-inner {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .nav-brand {
      font-size: 15px;
      font-weight: 800;
      letter-spacing: 0.3px;
    }
    .nav-cta {
      display: inline-block;
      background: #FF3B5C;
      color: #fff;
      border-radius: 8px;
      padding: 8px 18px;
      font-size: 13px;
      font-weight: 700;
      transition: opacity 0.15s;
    }
    .nav-cta:hover { opacity: 0.85; }

    /* ── Hero ── */
    .hero {
      padding: 72px 0 56px;
    }
    .hero-eyebrow {
      font-size: 11px;
      font-weight: 700;
      color: rgba(255,255,255,0.4);
      text-transform: uppercase;
      letter-spacing: 1.2px;
      margin-bottom: 20px;
    }
    .hero-title {
      font-size: clamp(30px, 4.5vw, 46px);
      font-weight: 800;
      line-height: 1.15;
      letter-spacing: -0.5px;
      max-width: 620px;
      margin-bottom: 16px;
    }
    .hero-sub {
      font-size: 16px;
      color: #e5e5e5;
      line-height: 1.6;
      max-width: 480px;
      margin-bottom: 0;
    }

    /* ── Pricing ── */
    .pricing {
      padding: 48px 0 56px;
    }
    .pricing-meta {
      font-size: 13px;
      color: rgba(255,255,255,0.35);
      margin-bottom: 28px;
    }
    .pricing-row {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
    }
    .pricing-card {
      background: #1a1a1a;
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 14px;
      padding: 28px 24px;
      display: flex;
      flex-direction: column;
    }
    .pricing-card.featured {
      border-color: #FF3B5C;
    }
    .plan-name {
      font-size: 13px;
      font-weight: 700;
      color: rgba(255,255,255,0.5);
      text-transform: uppercase;
      letter-spacing: 0.8px;
      margin-bottom: 20px;
    }
    .plan-price {
      font-size: 38px;
      font-weight: 800;
      letter-spacing: -1px;
      line-height: 1;
      margin-bottom: 4px;
    }
    .plan-period {
      font-size: 13px;
      color: rgba(255,255,255,0.3);
      margin-bottom: 24px;
    }
    .feature-list {
      display: flex;
      flex-direction: column;
      gap: 9px;
      margin-bottom: 28px;
      flex: 1;
    }
    .feature-row {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 13px;
      color: #e5e5e5;
    }
    .feature-row::before {
      content: '';
      width: 4px;
      height: 4px;
      border-radius: 50%;
      background: rgba(255,255,255,0.3);
      flex-shrink: 0;
    }
    .plan-cta {
      display: block;
      text-align: center;
      border-radius: 8px;
      padding: 12px;
      font-size: 13px;
      font-weight: 700;
      transition: opacity 0.15s;
      margin-top: auto;
    }
    .plan-cta:hover { opacity: 0.85; }
    .plan-cta.primary {
      background: #FF3B5C;
      color: #fff;
    }
    .plan-cta.secondary {
      background: rgba(255,255,255,0.07);
      color: #fff;
    }

    /* ── Social proof ── */
    .venues {
      padding: 0 0 48px;
    }
    .venues-line {
      font-size: 13px;
      color: rgba(255,255,255,0.3);
      border-top: 1px solid rgba(255,255,255,0.07);
      padding-top: 24px;
    }
    .venues-line span {
      color: rgba(255,255,255,0.5);
    }

    /* ── Footer ── */
    .footer {
      border-top: 1px solid rgba(255,255,255,0.07);
      padding: 20px 0;
    }
    .footer-inner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      font-size: 12px;
      color: rgba(255,255,255,0.25);
    }
    .footer-inner a { transition: color 0.15s; }
    .footer-inner a:hover { color: rgba(255,255,255,0.6); }

    @media (max-width: 680px) {
      .pricing-row { grid-template-columns: 1fr; }
      .hero { padding: 48px 0 40px; }
      .pricing { padding: 32px 0 40px; }
    }
  </style>
</head>
<body>

  <nav class="nav">
    <div class="container nav-inner">
      <span class="nav-brand">affiche</span>
      <a href="/business/signup" class="nav-cta">Get Started</a>
    </div>
  </nav>

  <section class="hero">
    <div class="container">
      <div class="hero-eyebrow">Toronto Nightlife</div>
      <h1 class="hero-title">Get your venue in front of thousands of people every weekend</h1>
      <p class="hero-sub">affiche is where Toronto decides where to go out. List your events, boost your placement, and track what's working.</p>
    </div>
  </section>

  <section class="pricing">
    <div class="container">
      <p class="pricing-meta">Flat monthly pricing &mdash; cancel anytime</p>
      <div class="pricing-row">

        <div class="pricing-card">
          <div class="plan-name">Basic</div>
          <div class="plan-price">$49</div>
          <div class="plan-period">per month</div>
          <div class="feature-list">
            <div class="feature-row">Featured badge on map</div>
            <div class="feature-row">Algorithm priority boost</div>
          </div>
          <a href="/business/signup" class="plan-cta secondary">Get Started</a>
        </div>

        <div class="pricing-card featured">
          <div class="plan-name">Pro</div>
          <div class="plan-price">$99</div>
          <div class="plan-period">per month</div>
          <div class="feature-list">
            <div class="feature-row">Everything in Basic</div>
            <div class="feature-row">Analytics dashboard</div>
            <div class="feature-row">RSVP, saves &amp; views data</div>
          </div>
          <a href="/business/signup" class="plan-cta primary">Get Started</a>
        </div>

        <div class="pricing-card">
          <div class="plan-name">Featured</div>
          <div class="plan-price">$149</div>
          <div class="plan-period">per month</div>
          <div class="feature-list">
            <div class="feature-row">Everything in Pro</div>
            <div class="feature-row">Strongest algorithm boost</div>
            <div class="feature-row">Featured badge on event cards</div>
          </div>
          <a href="/business/signup" class="plan-cta secondary">Get Started</a>
        </div>

      </div>
    </div>
  </section>

  <section class="venues">
    <div class="container">
      <p class="venues-line">
        Venues on affiche &mdash;
        <span>Rebel</span>,
        <span>Coda</span>,
        <span>Toybox</span>,
        <span>Nest</span>,
        <span>Orchid</span>,
        <span>Bar None</span>,
        <span>Bisha Rooftop</span>,
        <span>Wildflower</span>
      </p>
    </div>
  </section>

  <footer class="footer">
    <div class="container footer-inner">
      <span>© 2026 affiche</span>
      <a href="mailto:hello@thewall.app">hello@thewall.app</a>
    </div>
  </footer>

</body>
</html>`;

module.exports = function handler(req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(HTML);
};
