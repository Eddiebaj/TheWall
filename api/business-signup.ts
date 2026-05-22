import type { VercelRequest, VercelResponse } from '@vercel/node';

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Get Listed on affiche</title>
  <meta name="description" content="List your venue on affiche and reach Toronto's nightlife crowd." />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      background: #0a0a0a;
      color: #fff;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
      min-height: 100vh;
    }

    a { color: inherit; text-decoration: none; }

    .container {
      width: 100%;
      max-width: 640px;
      margin: 0 auto;
      padding: 0 24px;
    }

    /* Nav */
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
    .nav-back {
      font-size: 13px;
      color: rgba(255,255,255,0.45);
      font-weight: 500;
      transition: color 0.15s;
    }
    .nav-back:hover { color: #fff; }

    /* Page header */
    .page-header {
      padding: 48px 0 40px;
    }
    .page-eyebrow {
      font-size: 11px;
      font-weight: 700;
      color: rgba(255,255,255,0.4);
      text-transform: uppercase;
      letter-spacing: 1.2px;
      margin-bottom: 12px;
    }
    .page-title {
      font-size: clamp(24px, 4vw, 34px);
      font-weight: 800;
      line-height: 1.2;
      letter-spacing: -0.4px;
      margin-bottom: 10px;
    }
    .page-sub {
      font-size: 15px;
      color: #e5e5e5;
      line-height: 1.6;
    }

    /* Form */
    .form-section {
      padding-bottom: 80px;
    }

    .field-group {
      margin-bottom: 20px;
    }

    label {
      display: block;
      font-size: 12px;
      font-weight: 700;
      color: rgba(255,255,255,0.5);
      text-transform: uppercase;
      letter-spacing: 0.8px;
      margin-bottom: 8px;
    }

    input[type="text"],
    input[type="email"] {
      width: 100%;
      background: #1a1a1a;
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 10px;
      padding: 14px 16px;
      font-size: 15px;
      color: #fff;
      outline: none;
      transition: border-color 0.15s;
      -webkit-appearance: none;
    }
    input[type="text"]::placeholder,
    input[type="email"]::placeholder {
      color: rgba(255,255,255,0.2);
    }
    input[type="text"]:focus,
    input[type="email"]:focus {
      border-color: rgba(255,59,92,0.5);
    }
    input[type="text"].error,
    input[type="email"].error {
      border-color: #FF3B5C;
    }

    /* Field row */
    .field-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }
    @media (max-width: 480px) {
      .field-row { grid-template-columns: 1fr; }
    }

    /* Divider */
    .section-divider {
      border: none;
      border-top: 1px solid rgba(255,255,255,0.07);
      margin: 32px 0;
    }

    .section-label {
      font-size: 13px;
      font-weight: 700;
      color: rgba(255,255,255,0.5);
      margin-bottom: 16px;
    }

    /* Plan cards */
    .plan-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
    }
    @media (max-width: 540px) {
      .plan-grid { grid-template-columns: 1fr; }
    }

    .plan-card {
      position: relative;
      background: #1a1a1a;
      border: 1.5px solid rgba(255,255,255,0.08);
      border-radius: 12px;
      padding: 18px 16px;
      cursor: pointer;
      transition: border-color 0.15s;
      user-select: none;
    }
    .plan-card:hover {
      border-color: rgba(255,255,255,0.2);
    }
    .plan-card.selected {
      border-color: #FF3B5C;
      background: rgba(255,59,92,0.06);
    }
    .plan-card input[type="radio"] {
      position: absolute;
      opacity: 0;
      width: 0;
      height: 0;
    }

    .plan-name {
      font-size: 13px;
      font-weight: 700;
      color: #fff;
      margin-bottom: 2px;
    }
    .plan-price {
      font-size: 20px;
      font-weight: 800;
      color: #fff;
      margin-bottom: 12px;
      letter-spacing: -0.3px;
    }
    .plan-price span {
      font-size: 12px;
      font-weight: 500;
      color: rgba(255,255,255,0.4);
    }
    .plan-features {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .plan-features li {
      font-size: 12px;
      color: rgba(255,255,255,0.55);
      padding-left: 14px;
      position: relative;
    }
    .plan-features li::before {
      content: '+';
      position: absolute;
      left: 0;
      color: rgba(255,59,92,0.7);
      font-weight: 700;
    }
    .plan-badge {
      display: inline-block;
      background: #FF3B5C;
      color: #fff;
      font-size: 9px;
      font-weight: 800;
      letter-spacing: 0.6px;
      text-transform: uppercase;
      border-radius: 4px;
      padding: 2px 6px;
      margin-bottom: 8px;
    }

    /* Error message */
    .error-msg {
      display: none;
      background: rgba(255,59,92,0.1);
      border: 1px solid rgba(255,59,92,0.3);
      border-radius: 8px;
      padding: 12px 16px;
      font-size: 13px;
      color: #FF3B5C;
      margin-bottom: 20px;
    }
    .error-msg.visible { display: block; }

    /* Submit button */
    .submit-btn {
      width: 100%;
      background: #FF3B5C;
      color: #fff;
      border: none;
      border-radius: 10px;
      padding: 16px;
      font-size: 15px;
      font-weight: 700;
      cursor: pointer;
      transition: opacity 0.15s;
      letter-spacing: 0.1px;
    }
    .submit-btn:hover:not(:disabled) { opacity: 0.88; }
    .submit-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .form-note {
      margin-top: 14px;
      font-size: 12px;
      color: rgba(255,255,255,0.3);
      text-align: center;
      line-height: 1.5;
    }
  </style>
</head>
<body>

  <nav class="nav">
    <div class="container">
      <div class="nav-inner">
        <span class="nav-brand">affiche</span>
        <a href="/business" class="nav-back">Back to overview</a>
      </div>
    </div>
  </nav>

  <div class="container">
    <div class="page-header">
      <p class="page-eyebrow">Get listed</p>
      <h1 class="page-title">Create your venue account</h1>
      <p class="page-sub">Fill in your details and choose a plan. You'll be redirected to checkout to complete your subscription.</p>
    </div>

    <div class="form-section">
      <form id="signup-form" novalidate>

        <div class="field-row">
          <div class="field-group">
            <label for="business_name">Business name</label>
            <input type="text" id="business_name" name="business_name" placeholder="Your company or brand" autocomplete="organization" />
          </div>
          <div class="field-group">
            <label for="contact_name">Contact name</label>
            <input type="text" id="contact_name" name="contact_name" placeholder="Your full name" autocomplete="name" />
          </div>
        </div>

        <div class="field-group">
          <label for="email">Email address</label>
          <input type="email" id="email" name="email" placeholder="you@example.com" autocomplete="email" />
        </div>

        <div class="field-group">
          <label for="venue_name">Venue name</label>
          <input type="text" id="venue_name" name="venue_name" placeholder="e.g. The Drake Hotel" />
        </div>

        <hr class="section-divider" />

        <p class="section-label">Choose a plan</p>

        <div class="plan-grid" id="plan-grid">

          <label class="plan-card" id="card-basic">
            <input type="radio" name="plan" value="basic" />
            <p class="plan-name">Basic</p>
            <p class="plan-price">$49<span>/mo</span></p>
            <ul class="plan-features">
              <li>1 venue listing</li>
              <li>Event posting</li>
              <li>Basic analytics</li>
            </ul>
          </label>

          <label class="plan-card selected" id="card-pro">
            <input type="radio" name="plan" value="pro" checked />
            <div class="plan-badge">Popular</div>
            <p class="plan-name">Pro</p>
            <p class="plan-price">$99<span>/mo</span></p>
            <ul class="plan-features">
              <li>3 venue listings</li>
              <li>Priority placement</li>
              <li>Full analytics</li>
              <li>Social highlights</li>
            </ul>
          </label>

          <label class="plan-card" id="card-featured">
            <input type="radio" name="plan" value="featured" />
            <p class="plan-name">Featured</p>
            <p class="plan-price">$149<span>/mo</span></p>
            <ul class="plan-features">
              <li>Unlimited listings</li>
              <li>Top of feed placement</li>
              <li>Full analytics</li>
              <li>Dedicated support</li>
              <li>Co-marketing posts</li>
            </ul>
          </label>

        </div>

        <hr class="section-divider" />

        <div class="error-msg" id="error-msg"></div>

        <button type="submit" class="submit-btn" id="submit-btn">Continue to Payment</button>

        <p class="form-note">You'll be taken to Stripe to complete your subscription. Cancel anytime.</p>

      </form>
    </div>
  </div>

  <script>
    // Plan card selection highlight
    const planCards = document.querySelectorAll('.plan-card');
    planCards.forEach(function(card) {
      var radio = card.querySelector('input[type="radio"]');
      radio.addEventListener('change', function() {
        planCards.forEach(function(c) { c.classList.remove('selected'); });
        if (radio.checked) card.classList.add('selected');
      });
      card.addEventListener('click', function() {
        planCards.forEach(function(c) { c.classList.remove('selected'); });
        card.classList.add('selected');
      });
    });

    // Form submission
    var form = document.getElementById('signup-form');
    var submitBtn = document.getElementById('submit-btn');
    var errorMsg = document.getElementById('error-msg');

    function showError(msg) {
      errorMsg.textContent = msg;
      errorMsg.classList.add('visible');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Continue to Payment';
    }

    function clearError() {
      errorMsg.classList.remove('visible');
      errorMsg.textContent = '';
    }

    form.addEventListener('submit', function(e) {
      e.preventDefault();
      clearError();

      var businessName = document.getElementById('business_name').value.trim();
      var contactName = document.getElementById('contact_name').value.trim();
      var email = document.getElementById('email').value.trim();
      var venueName = document.getElementById('venue_name').value.trim();
      var planInput = form.querySelector('input[name="plan"]:checked');
      var plan = planInput ? planInput.value : null;

      // Clear previous error states
      ['business_name', 'contact_name', 'email', 'venue_name'].forEach(function(id) {
        document.getElementById(id).classList.remove('error');
      });

      // Validate
      var missing = [];
      if (!businessName) { missing.push('business name'); document.getElementById('business_name').classList.add('error'); }
      if (!contactName) { missing.push('contact name'); document.getElementById('contact_name').classList.add('error'); }
      if (!email) { missing.push('email address'); document.getElementById('email').classList.add('error'); }
      if (!venueName) { missing.push('venue name'); document.getElementById('venue_name').classList.add('error'); }
      if (!plan) { missing.push('a plan'); }

      if (missing.length > 0) {
        showError('Please fill in: ' + missing.join(', ') + '.');
        return;
      }

      // Basic email format check
      if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) {
        document.getElementById('email').classList.add('error');
        showError('Please enter a valid email address.');
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Loading...';

      fetch('/api/business/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_name: businessName,
          contact_name: contactName,
          email: email,
          venue_name: venueName,
          plan: plan
        })
      })
      .then(function(res) {
        return res.json().then(function(data) {
          return { ok: res.ok, data: data };
        });
      })
      .then(function(result) {
        if (!result.ok || !result.data.checkout_url) {
          showError(result.data.error || 'Something went wrong. Please try again.');
          return;
        }
        window.location.href = result.data.checkout_url;
      })
      .catch(function() {
        showError('Network error. Please check your connection and try again.');
      });
    });
  </script>

</body>
</html>`;

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(HTML);
}
