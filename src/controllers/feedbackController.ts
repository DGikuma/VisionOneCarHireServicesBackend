import { Request, Response } from 'express';
import nodemailer from 'nodemailer';
import { FeedbackData } from '../types/feedback';
import { appendFeedbackToExcel } from '../utils/feedbackStore';

/* ────────────────────────────────────────────────────────────
   Nodemailer Transporter (reused pattern from bookingController)
   ──────────────────────────────────────────────────────────── */
const createTransporter = () => {
    if (!process.env.EMAIL_HOST || !process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        throw new Error('Missing email configuration in environment variables');
    }

    return nodemailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: parseInt(process.env.EMAIL_PORT || '587'),
        secure: process.env.EMAIL_SECURE === 'true',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 10000,
    });
};

/* ────────────────────────────────────────────────────────────
   Shared design tokens & reusable fragments
   ──────────────────────────────────────────────────────────── */
const LOGO_URL = 'https://www.visionwanservices.com/assets/images/logo.png';

const BRAND = {
    primary: '#FF6B35',
    primaryDark: '#E85A25',
    secondary: '#FF8B35',
    accent: '#FF9B35',
    dark: '#0f172a',
    darkMuted: '#1e293b',
    text: '#1a1a2e',
    textMuted: '#64748b',
    border: '#e5e7eb',
    success: '#10b981',
    successLight: '#ecfdf5',
    warning: '#f59e0b',
    danger: '#dc2626',
    light: '#f8f9fa',
    lightAlt: '#fff7ed',
};

/* ────────────────────────────────────────────────────────────
   ADMIN EMAIL — Ultra HD, theme adaptive
   ──────────────────────────────────────────────────────────── */
const generateAdminEmailHtml = (feedback: FeedbackData): string => {
    const stars = '★'.repeat(feedback.rating) + '☆'.repeat(5 - feedback.rating);
    const ratingLabel =
        ['Poor', 'Fair', 'Good', 'Great', 'Excellent'][feedback.rating - 1] || 'N/A';
    const submittedDate = new Date(feedback.submittedAt || Date.now());
    const submittedFormatted = submittedDate.toLocaleString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });

    // Rating color based on score
    const ratingColor =
        feedback.rating >= 4 ? BRAND.success :
        feedback.rating === 3 ? BRAND.warning :
        BRAND.danger;

    return `
<!DOCTYPE html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>New Feedback — Vision Wan Services</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    /* ─────── Reset ─────── */
    * { box-sizing: border-box; }
    body, table, td, p, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; display: block; }

    /* ─────── Base ─────── */
    body {
      margin: 0; padding: 0;
      width: 100% !important;
      background: ${BRAND.light};
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      color: ${BRAND.text};
    }

    /* ─────── Container ─────── */
    .email-wrapper {
      width: 100%;
      background: ${BRAND.light};
      padding: 32px 16px;
    }
    .email-container {
      max-width: 600px;
      margin: 0 auto;
      background: #ffffff;
      border-radius: 20px;
      overflow: hidden;
      box-shadow: 0 20px 60px -15px rgba(15, 23, 42, 0.15),
                  0 0 0 1px rgba(15, 23, 42, 0.04);
    }

    /* ─────── Header ─────── */
    .header {
      position: relative;
      background: linear-gradient(135deg, ${BRAND.primary} 0%, ${BRAND.secondary} 100%);
      padding: 40px 24px 32px;
      text-align: center;
      overflow: hidden;
    }
    .header::after {
      content: '';
      position: absolute;
      top: -50%; right: -20%;
      width: 300px; height: 300px;
      background: radial-gradient(circle, rgba(255,255,255,0.2) 0%, transparent 70%);
      border-radius: 50%;
    }
    .logo-badge {
      display: inline-block;
      width: 88px; height: 88px;
      margin: 0 auto 18px;
      background: rgba(255,255,255,0.98);
      border-radius: 50%;
      padding: 8px;
      box-shadow: 0 12px 30px rgba(0,0,0,0.15);
    }
    .logo-badge img { width: 100%; height: 100%; object-fit: contain; border-radius: 50%; }
    .header h1 {
      margin: 0 0 6px;
      font-size: 24px;
      font-weight: 800;
      color: #ffffff;
      letter-spacing: -0.02em;
      position: relative; z-index: 1;
    }
    .header p {
      margin: 0;
      font-size: 14px;
      color: rgba(255,255,255,0.92);
      font-weight: 400;
      position: relative; z-index: 1;
    }

    /* ─────── Content ─────── */
    .content { padding: 32px 28px 8px; }

    /* ─────── Badge ─────── */
    .badge-wrap { text-align: center; margin-bottom: 28px; }
    .badge {
      display: inline-block;
      background: linear-gradient(135deg, ${BRAND.primary}, ${BRAND.secondary});
      color: #ffffff;
      padding: 7px 18px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      box-shadow: 0 4px 14px rgba(255,107,53,0.35);
    }

    /* ─────── Section ─────── */
    .section { margin-bottom: 28px; }
    .section-title {
      font-size: 13px;
      font-weight: 800;
      color: ${BRAND.text};
      letter-spacing: 0.1em;
      text-transform: uppercase;
      padding-bottom: 10px;
      margin-bottom: 14px;
      border-bottom: 2px solid ${BRAND.border};
      position: relative;
    }
    .section-title::after {
      content: '';
      position: absolute;
      left: 0; bottom: -2px;
      width: 48px; height: 2px;
      background: ${BRAND.primary};
      border-radius: 2px;
    }

    /* ─────── Info rows ─────── */
    .info-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      padding: 10px 0;
      border-bottom: 1px solid #f1f5f9;
      font-size: 14px;
    }
    .info-row:last-child { border-bottom: 0; }
    .info-label { color: ${BRAND.textMuted}; font-weight: 600; flex-shrink: 0; }
    .info-value { color: ${BRAND.text}; font-weight: 500; text-align: right; word-break: break-word; }

    /* ─────── Rating block ─────── */
    .rating-block {
      display: flex;
      align-items: center;
      gap: 14px;
      background: ${BRAND.light};
      padding: 14px 18px;
      border-radius: 12px;
      border-left: 4px solid ${ratingColor};
      margin-bottom: 12px;
    }
    .stars {
      color: ${BRAND.warning};
      font-size: 24px;
      letter-spacing: 3px;
      line-height: 1;
    }
    .rating-text { color: ${BRAND.text}; font-weight: 700; font-size: 15px; }
    .rating-sub { color: ${BRAND.textMuted}; font-size: 13px; margin-top: 2px; }

    /* ─────── Message box ─────── */
    .message-box {
      background: ${BRAND.lightAlt};
      border-left: 4px solid ${BRAND.primary};
      padding: 18px 20px;
      border-radius: 12px;
      font-size: 14px;
      line-height: 1.7;
      color: ${BRAND.text};
      white-space: pre-wrap;
      word-break: break-word;
    }

    /* ─────── CTA Button ─────── */
    .cta-wrap { text-align: center; padding: 8px 0 24px; }
    .btn {
      display: inline-block;
      background: linear-gradient(135deg, ${BRAND.primary} 0%, ${BRAND.primaryDark} 100%);
      color: #ffffff !important;
      padding: 14px 36px;
      border-radius: 12px;
      font-size: 15px;
      font-weight: 700;
      text-decoration: none;
      letter-spacing: 0.01em;
      box-shadow: 0 10px 25px -5px rgba(255,107,53,0.5);
      transition: all 0.2s ease;
    }
    .btn:hover {
      box-shadow: 0 15px 35px -5px rgba(255,107,53,0.65);
      transform: translateY(-1px);
    }

    /* ─────── Footer ─────── */
    .footer {
      text-align: center;
      padding: 24px 28px;
      background: ${BRAND.light};
      color: ${BRAND.textMuted};
      font-size: 12px;
      line-height: 1.6;
      border-top: 1px solid ${BRAND.border};
    }
    .footer strong { color: ${BRAND.text}; font-weight: 700; }
    .footer a { color: ${BRAND.primary}; text-decoration: none; font-weight: 600; }

    /* ─────── Mobile ─────── */
    @media (max-width: 600px) {
      .email-wrapper { padding: 16px 8px; }
      .content { padding: 24px 20px 8px; }
      .header { padding: 32px 20px 24px; }
      .header h1 { font-size: 21px; }
      .info-row { flex-direction: column; gap: 4px; }
      .info-value { text-align: left; }
      .stars { font-size: 20px; }
      .btn { padding: 12px 28px; font-size: 14px; }
    }

    /* ─────── Dark mode ─────── */
    @media (prefers-color-scheme: dark) {
      body { background: #0b1120 !important; color: #e5e7eb !important; }
      .email-wrapper { background: #0b1120 !important; }
      .email-container {
        background: #111827 !important;
        box-shadow: 0 20px 60px -15px rgba(0,0,0,0.6),
                    0 0 0 1px rgba(255,255,255,0.05) !important;
      }
      .header { background: linear-gradient(135deg, #d95a26 0%, #c14a1a 100%) !important; }
      .section-title { color: #f3f4f6 !important; border-bottom-color: #1f2937 !important; }
      .info-row { border-bottom-color: #1f2937 !important; }
      .info-label { color: #9ca3af !important; }
      .info-value { color: #f3f4f6 !important; }
      .rating-block { background: #1f2937 !important; }
      .rating-text { color: #f3f4f6 !important; }
      .rating-sub { color: #9ca3af !important; }
      .message-box {
        background: #1f2937 !important;
        color: #e5e7eb !important;
        border-left-color: ${BRAND.primary} !important;
      }
      .footer {
        background: #0b1120 !important;
        color: #9ca3af !important;
        border-top-color: #1f2937 !important;
      }
      .footer strong { color: #f3f4f6 !important; }
      .footer a { color: ${BRAND.secondary} !important; }
    }
  </style>
</head>
<body>
  <div class="email-wrapper">
    <div class="email-container">
      <!-- Header -->
      <div class="header">
        <div class="logo-badge">
          <img src="${LOGO_URL}" alt="Vision Wan Services" width="88" height="88" />
        </div>
        <h1>New Customer Feedback</h1>
        <p>Received via visionwanservices.com</p>
      </div>

      <!-- Content -->
      <div class="content">

        <!-- Badge -->
        <div class="badge-wrap">
          <span class="badge">Ref: ${feedback.id}</span>
        </div>

        <!-- From -->
        <div class="section">
          <div class="section-title">Customer</div>
          <div class="info-row">
            <span class="info-label">Name</span>
            <span class="info-value">${feedback.name}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Email</span>
            <span class="info-value">${feedback.email}</span>
          </div>
          ${feedback.phone ? `
          <div class="info-row">
            <span class="info-label">Phone</span>
            <span class="info-value">${feedback.phone}</span>
          </div>` : ''}
        </div>

        <!-- Rating -->
        <div class="section">
          <div class="section-title">Rating</div>
          <div class="rating-block">
            <div>
              <div class="stars">${stars}</div>
              <div class="rating-sub">${feedback.rating} out of 5</div>
            </div>
            <div style="margin-left: auto; text-align: right;">
              <div class="rating-text">${ratingLabel}</div>
              <div class="rating-sub">${feedback.category}</div>
            </div>
          </div>
        </div>

        <!-- Message -->
        <div class="section">
          <div class="section-title">Message</div>
          <div class="message-box">${feedback.message}</div>
        </div>

        <!-- CTA -->
        <div class="cta-wrap">
          <a href="mailto:${feedback.email}?subject=Re:%20Your%20feedback%20to%20Vision%20Wan" class="btn">
            Reply to ${feedback.name.split(' ')[0]}
          </a>
        </div>
      </div>

      <!-- Footer -->
      <div class="footer">
        <p style="margin: 0 0 6px;">
          <strong>Vision Wan Services</strong> — Feedback System
        </p>
        <p style="margin: 0;">
          Submitted: ${submittedFormatted}
        </p>
      </div>
    </div>
  </div>
</body>
</html>
    `;
};

/* ────────────────────────────────────────────────────────────
   CUSTOMER EMAIL — Ultra HD, theme adaptive
   ──────────────────────────────────────────────────────────── */
const generateCustomerEmailHtml = (feedback: FeedbackData): string => {
    const firstName = feedback.name.split(' ')[0];

    return `
<!DOCTYPE html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>Thank You for Your Feedback — Vision Wan Services</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    /* ─────── Reset ─────── */
    * { box-sizing: border-box; }
    body, table, td, p, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; display: block; }

    /* ─────── Base ─────── */
    body {
      margin: 0; padding: 0;
      width: 100% !important;
      background: ${BRAND.light};
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      color: ${BRAND.text};
    }

    /* ─────── Container ─────── */
    .email-wrapper {
      width: 100%;
      background: ${BRAND.light};
      padding: 32px 16px;
    }
    .email-container {
      max-width: 600px;
      margin: 0 auto;
      background: #ffffff;
      border-radius: 20px;
      overflow: hidden;
      box-shadow: 0 20px 60px -15px rgba(15, 23, 42, 0.15),
                  0 0 0 1px rgba(15, 23, 42, 0.04);
    }

    /* ─────── Header ─────── */
    .header {
      position: relative;
      background: linear-gradient(135deg, ${BRAND.primary} 0%, ${BRAND.secondary} 100%);
      padding: 44px 24px 36px;
      text-align: center;
      overflow: hidden;
    }
    .header::before {
      content: '';
      position: absolute;
      bottom: -60%; left: -20%;
      width: 300px; height: 300px;
      background: radial-gradient(circle, rgba(255,255,255,0.15) 0%, transparent 70%);
      border-radius: 50%;
    }
    .header::after {
      content: '';
      position: absolute;
      top: -50%; right: -20%;
      width: 300px; height: 300px;
      background: radial-gradient(circle, rgba(255,255,255,0.2) 0%, transparent 70%);
      border-radius: 50%;
    }
    .logo-badge {
      display: inline-block;
      width: 96px; height: 96px;
      margin: 0 auto 20px;
      background: rgba(255,255,255,0.98);
      border-radius: 50%;
      padding: 8px;
      box-shadow: 0 12px 30px rgba(0,0,0,0.15);
    }
    .logo-badge img { width: 100%; height: 100%; object-fit: contain; border-radius: 50%; }
    .header h1 {
      margin: 0 0 8px;
      font-size: 28px;
      font-weight: 800;
      color: #ffffff;
      letter-spacing: -0.02em;
      position: relative; z-index: 1;
    }
    .header p {
      margin: 0;
      font-size: 15px;
      color: rgba(255,255,255,0.95);
      font-weight: 400;
      position: relative; z-index: 1;
    }

    /* ─────── Content ─────── */
    .content { padding: 36px 28px 8px; }

    /* ─────── Badge ─────── */
    .badge-wrap { text-align: center; margin-bottom: 28px; }
    .badge {
      display: inline-block;
      background: linear-gradient(135deg, ${BRAND.primary}, ${BRAND.secondary});
      color: #ffffff;
      padding: 7px 18px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      box-shadow: 0 4px 14px rgba(255,107,53,0.35);
    }

    /* ─────── Paragraph ─────── */
    .lead {
      font-size: 15px;
      line-height: 1.75;
      color: ${BRAND.text};
      margin: 0 0 24px;
    }
    .lead strong { color: ${BRAND.primary}; font-weight: 700; }

    /* ─────── Boxes ─────── */
    .box {
      background: ${BRAND.light};
      border-left: 4px solid ${BRAND.primary};
      padding: 18px 20px;
      border-radius: 12px;
      margin: 20px 0;
      font-size: 14px;
      line-height: 1.7;
      color: ${BRAND.text};
    }
    .box.success {
      background: ${BRAND.successLight};
      border-left-color: ${BRAND.success};
    }
    .box-title {
      margin: 0 0 10px;
      font-size: 14px;
      font-weight: 700;
      color: ${BRAND.text};
    }
    .box ul {
      margin: 8px 0 0;
      padding-left: 20px;
      color: ${BRAND.textMuted};
    }
    .box ul li { margin-bottom: 6px; line-height: 1.6; }
    .box ul li:last-child { margin-bottom: 0; }

    /* ─────── CTA Button ─────── */
    .cta-wrap { text-align: center; padding: 16px 0 28px; }
    .btn {
      display: inline-block;
      background: linear-gradient(135deg, ${BRAND.primary} 0%, ${BRAND.primaryDark} 100%);
      color: #ffffff !important;
      padding: 15px 40px;
      border-radius: 12px;
      font-size: 15px;
      font-weight: 700;
      text-decoration: none;
      letter-spacing: 0.01em;
      box-shadow: 0 10px 25px -5px rgba(255,107,53,0.5);
      transition: all 0.2s ease;
    }
    .btn:hover {
      box-shadow: 0 15px 35px -5px rgba(255,107,53,0.65);
      transform: translateY(-1px);
    }

    /* ─────── Footer ─────── */
    .footer {
      text-align: center;
      padding: 26px 28px;
      background: ${BRAND.light};
      color: ${BRAND.textMuted};
      font-size: 13px;
      line-height: 1.7;
      border-top: 1px solid ${BRAND.border};
    }
    .footer strong { color: ${BRAND.text}; font-weight: 700; }
    .footer a { color: ${BRAND.primary}; text-decoration: none; font-weight: 600; }
    .footer .copyright {
      font-size: 11px;
      color: #9ca3af;
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid ${BRAND.border};
    }

    /* ─────── Mobile ─────── */
    @media (max-width: 600px) {
      .email-wrapper { padding: 16px 8px; }
      .content { padding: 28px 20px 8px; }
      .header { padding: 36px 20px 28px; }
      .header h1 { font-size: 24px; }
      .logo-badge { width: 80px; height: 80px; }
      .btn { padding: 13px 32px; font-size: 14px; }
    }

    /* ─────── Dark mode ─────── */
    @media (prefers-color-scheme: dark) {
      body { background: #0b1120 !important; color: #e5e7eb !important; }
      .email-wrapper { background: #0b1120 !important; }
      .email-container {
        background: #111827 !important;
        box-shadow: 0 20px 60px -15px rgba(0,0,0,0.6),
                    0 0 0 1px rgba(255,255,255,0.05) !important;
      }
      .header { background: linear-gradient(135deg, #d95a26 0%, #c14a1a 100%) !important; }
      .badge { background: linear-gradient(135deg, #d95a26, #c14a1a) !important; }
      .lead { color: #e5e7eb !important; }
      .lead strong { color: ${BRAND.secondary} !important; }
      .box {
        background: #1f2937 !important;
        color: #e5e7eb !important;
      }
      .box.success {
        background: rgba(16, 185, 129, 0.1) !important;
      }
      .box-title { color: #f3f4f6 !important; }
      .box ul { color: #9ca3af !important; }
      .footer {
        background: #0b1120 !important;
        color: #9ca3af !important;
        border-top-color: #1f2937 !important;
      }
      .footer strong { color: #f3f4f6 !important; }
      .footer a { color: ${BRAND.secondary} !important; }
      .footer .copyright {
        color: #6b7280 !important;
        border-top-color: #1f2937 !important;
      }
    }
  </style>
</head>
<body>
  <div class="email-wrapper">
    <div class="email-container">
      <!-- Header -->
      <div class="header">
        <div class="logo-badge">
          <img src="${LOGO_URL}" alt="Vision Wan Services" width="96" height="96" />
        </div>
        <h1>Thank You, ${firstName}! 🙏</h1>
        <p>We've received your feedback</p>
      </div>

      <!-- Content -->
      <div class="content">
        <!-- Badge -->
        <div class="badge-wrap">
          <span class="badge">Ref: ${feedback.id}</span>
        </div>

        <!-- Lead -->
        <p class="lead">
          Thank you for taking the time to share your experience with
          <strong>Vision Wan Services</strong>. Every message helps us improve
          our car hire and accommodation services.
        </p>

        <!-- Summary box -->
        <div class="box">
          <p class="box-title">📋 Your feedback summary</p>
          <p style="margin: 0; color: ${BRAND.textMuted};">
            <strong style="color: ${BRAND.text};">Category:</strong> ${feedback.category}<br>
            <strong style="color: ${BRAND.text};">Rating:</strong> ${feedback.rating}/5
          </p>
        </div>

        <!-- Next steps box -->
        <div class="box success">
          <p class="box-title">✓ What happens next</p>
          <ul>
            <li>Our team reviews every piece of feedback personally.</li>
            <li>If a follow-up is needed, we'll reach out within 24 hours.</li>
            <li>Your insights directly shape how we serve you better.</li>
          </ul>
        </div>

        <!-- CTA -->
        <p style="font-size: 14px; color: ${BRAND.textMuted}; text-align: center; margin: 28px 0 0; font-weight: 500;">
          Have more to share? We're always listening.
        </p>

        <div class="cta-wrap">
          <a href="https://www.visionwanservices.com" class="btn">Visit Our Website</a>
        </div>
      </div>

      <!-- Footer -->
      <div class="footer">
        <p style="margin: 0 0 4px;">
          <strong>Vision Wan Services</strong>
        </p>
        <p style="margin: 0 0 4px;">
          Kenya: <a href="tel:+254705336311">+254 (705) 336 311</a> &nbsp;·&nbsp;
          UK: <a href="tel:+447397549590">+44 (7397) 549 590</a>
        </p>
        <p style="margin: 0;">
          <a href="mailto:visionwanservices@gmail.com">visionwanservices@gmail.com</a>
        </p>
        <p class="copyright">
          © ${new Date().getFullYear()} Vision Wan Services. All rights reserved.
        </p>
      </div>
    </div>
  </div>
</body>
</html>
    `;
};

/* ────────────────────────────────────────────────────────────
   Send admin notification email
   ──────────────────────────────────────────────────────────── */
export const sendFeedbackAdminEmail = async (feedback: FeedbackData) => {
    const transporter = createTransporter();

    await transporter.sendMail({
        from: process.env.EMAIL_FROM || '"Vision Wan Services" <bookings@visiononecarhire.com>',
        to: process.env.ADMIN_EMAIL || 'visionwanservices@gmail.com',
        subject: `💬 New ${feedback.rating}★ Feedback — ${feedback.name} (${feedback.category})`,
        html: generateAdminEmailHtml(feedback),
    });

    console.log(`📧 Feedback admin email sent for ${feedback.id}`);
};

/* ────────────────────────────────────────────────────────────
   Send customer thank-you email
   ──────────────────────────────────────────────────────────── */
export const sendFeedbackCustomerEmail = async (feedback: FeedbackData) => {
    const transporter = createTransporter();

    await transporter.sendMail({
        from: process.env.EMAIL_FROM || '"Vision Wan Services" <bookings@visiononecarhire.com>',
        to: feedback.email,
        subject: `Thank you for your feedback — Vision Wan Services`,
        html: generateCustomerEmailHtml(feedback),
    });

    console.log(`📧 Feedback thank-you email sent to ${feedback.email}`);
};

/* ────────────────────────────────────────────────────────────
   Create feedback (main controller)
   ──────────────────────────────────────────────────────────── */
export const createFeedback = async (req: Request, res: Response) => {
    try {
        const feedbackData: FeedbackData = {
            name: req.body.name,
            email: req.body.email,
            phone: req.body.phone || '',
            category: req.body.category,
            rating: Number(req.body.rating),
            message: req.body.message,
            submittedAt: new Date().toISOString(),
            status: 'new',
            userAgent: req.body.userAgent || req.headers['user-agent'] || '',
            page: req.body.page || '',
        };

        // Validate
        const errors: { field: string; message: string }[] = [];
        if (!feedbackData.name?.trim()) errors.push({ field: 'name', message: 'Name is required' });
        if (!feedbackData.email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(feedbackData.email)) {
            errors.push({ field: 'email', message: 'Valid email is required' });
        }
        if (!feedbackData.category?.trim()) errors.push({ field: 'category', message: 'Category is required' });
        if (!feedbackData.rating || feedbackData.rating < 1 || feedbackData.rating > 5) {
            errors.push({ field: 'rating', message: 'Rating must be between 1 and 5' });
        }
        if (!feedbackData.message?.trim() || feedbackData.message.trim().length < 10) {
            errors.push({ field: 'message', message: 'Message must be at least 10 characters' });
        }

        if (errors.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors,
            });
        }

        // Generate ID
        const feedbackId = `FB-${Date.now().toString().slice(-8)}`;
        const feedbackWithId: FeedbackData = { ...feedbackData, id: feedbackId };

        // Store in Excel
        await appendFeedbackToExcel(feedbackWithId);

        console.log(`📝 New feedback: ${feedbackId} from ${feedbackData.name} (${feedbackData.rating}★)`);

        // Respond immediately
        res.status(201).json({
            success: true,
            message: 'Thank you for your feedback!',
            feedback: {
                id: feedbackId,
                name: feedbackData.name,
                rating: feedbackData.rating,
                category: feedbackData.category,
            },
        });

        // Send emails in background (non-blocking)
        setTimeout(async () => {
            try {
                await sendFeedbackAdminEmail(feedbackWithId);
                await sendFeedbackCustomerEmail(feedbackWithId);
                console.log(`✅ Feedback emails sent for ${feedbackId}`);
            } catch (emailErr) {
                console.error(`❌ Feedback email failed for ${feedbackId}:`, emailErr);
            }
        }, 0);

    } catch (error) {
        console.error('❌ Feedback creation error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to submit feedback',
            error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined,
        });
    }
};