// config.example.js
// ✅ SAFE TO COMMIT — no real secrets in this file.
//
// Setup:
//   cp config.example.js config.js
//   then fill in config.js with your real values.

const config = {

  // ── Firebase ─────────────────────────────────────────────────────
  // Firebase Console → Project Settings → Your Apps → SDK setup & config
  firebase: {
    apiKey:            "YOUR_FIREBASE_API_KEY",
    authDomain:        "YOUR_PROJECT_ID.firebaseapp.com",
    projectId:         "YOUR_PROJECT_ID",
    storageBucket:     "YOUR_PROJECT_ID.appspot.com",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId:             "YOUR_APP_ID",
  },

  // ── Gemini (NLP search query parsing) ────────────────────────────
  // Google AI Studio → https://aistudio.google.com/app/apikey
  gemini: {
    apiKey: "YOUR_GEMINI_API_KEY",
  },
  
  // ── EmailJS (OTP emails) ──────────────────────────────────────────
  // 1. Sign up at https://emailjs.com (free — 200 emails/month)
  // 2. Add an Email Service (Gmail, Outlook, etc.)
  // 3. Create a Template — use these variables in the body:
  //      {{otp_code}}   {{to_email}}   {{app_name}}
  // 4. Copy Service ID, Template ID, and Public Key below
  emailjs: {
    serviceId:  "YOUR_EMAILJS_SERVICE_ID",
    templateId: "YOUR_EMAILJS_TEMPLATE_ID",
    publicKey:  "YOUR_EMAILJS_PUBLIC_KEY",
  },

};

export default config;
