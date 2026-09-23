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
   HTML email template for admin notification
   ──────────────────────────────────────────────────────────── */
const generateAdminEmailHtml = (feedback: FeedbackData): string => {
    const primary = '#FF6B35';
    const secondary = '#FF8B35';
    const dark = '#1a1a2e';
    const lightBg = '#f8f9fa';

    const stars = '★'.repeat(feedback.rating) + '☆'.repeat(5 - feedback.rating);
    const ratingLabel =
        ['Poor', 'Fair', 'Good', 'Great', 'Excellent'][feedback.rating - 1] || 'N/A';

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Feedback</title>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 0; background: ${lightBg}; }
    .container { max-width: 600px; margin: 20px auto; background: #fff; border-radius: 16px; box-shadow: 0 10px 40px rgba(0,0,0,0.08); overflow: hidden; }
    .header { background: linear-gradient(135deg, ${primary}, ${secondary}); padding: 25px; text-align: center; color: #fff; }
    .header h1 { margin: 0; font-size: 24px; }
    .content { padding: 25px; color: ${dark}; }
    .badge { display: inline-block; background: #dc2626; color: #fff; padding: 4px 14px; border-radius: 20px; font-size: 13px; font-weight: 600; }
    .section { margin-bottom: 20px; }
    .section-title { font-size: 16px; font-weight: 700; border-bottom: 2px solid ${primary}; padding-bottom: 6px; margin-bottom: 12px; }
    .info-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; font-size: 14px; }
    .info-label { color: #666; font-weight: 600; }
    .info-value { color: ${dark}; font-weight: 500; text-align: right; max-width: 60%; }
    .stars { color: #f59e0b; font-size: 22px; letter-spacing: 3px; }
    .message-box { background: ${lightBg}; border-left: 4px solid ${primary}; padding: 15px; border-radius: 4px; font-size: 14px; line-height: 1.6; white-space: pre-wrap; }
    .footer { text-align: center; padding: 15px; background: ${lightBg}; color: #888; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>💬 New Customer Feedback</h1>
      <p style="margin: 8px 0 0; opacity: 0.9;">Received via visionwanservices.com</p>
    </div>
    <div class="content">
      <div style="text-align: center; margin-bottom: 20px;">
        <span class="badge">${feedback.id}</span>
      </div>

      <div class="section">
        <div class="section-title">👤 From</div>
        <div class="info-row"><span class="info-label">Name</span><span class="info-value">${feedback.name}</span></div>
        <div class="info-row"><span class="info-label">Email</span><span class="info-value">${feedback.email}</span></div>
        ${feedback.phone ? `<div class="info-row"><span class="info-label">Phone</span><span class="info-value">${feedback.phone}</span></div>` : ''}
      </div>

      <div class="section">
        <div class="section-title">⭐ Rating</div>
        <div class="info-row">
          <span class="info-label">Score</span>
          <span class="info-value"><span class="stars">${stars}</span> (${feedback.rating}/5 — ${ratingLabel})</span>
        </div>
        <div class="info-row"><span class="info-label">Category</span><span class="info-value">${feedback.category}</span></div>
      </div>

      <div class="section">
        <div class="section-title">📝 Message</div>
        <div class="message-box">${feedback.message}</div>
      </div>

      <div style="text-align: center; margin-top: 25px;">
        <a href="mailto:${feedback.email}?subject=Re: Your feedback to Vision Wan"
           style="display: inline-block; background: ${primary}; color: #fff; padding: 12px 30px; border-radius: 8px; text-decoration: none; font-weight: 600;">
          Reply to Customer
        </a>
      </div>
    </div>
    <div class="footer">
      <p>Vision Wan Services — Feedback System</p>
      <p>Submitted: ${new Date(feedback.submittedAt || Date.now()).toLocaleString()}</p>
    </div>
  </div>
</body>
</html>
    `;
};

/* ────────────────────────────────────────────────────────────
   HTML email template for customer thank-you
   ──────────────────────────────────────────────────────────── */
const generateCustomerEmailHtml = (feedback: FeedbackData): string => {
    const primary = '#FF6B35';
    const secondary = '#FF8B35';
    const dark = '#1a1a2e';
    const lightBg = '#f8f9fa';

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Thank You for Your Feedback</title>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 0; background: ${lightBg}; }
    .container { max-width: 600px; margin: 20px auto; background: #fff; border-radius: 16px; box-shadow: 0 10px 40px rgba(0,0,0,0.08); overflow: hidden; }
    .header { background: linear-gradient(135deg, ${primary}, ${secondary}); padding: 40px 20px; text-align: center; color: #fff; }
    .header h1 { margin: 0 0 8px; font-size: 28px; }
    .header p { margin: 0; font-size: 15px; opacity: 0.95; }
    .content { padding: 30px; color: ${dark}; }
    .badge { display: inline-block; background: ${primary}; color: #fff; padding: 4px 14px; border-radius: 20px; font-size: 13px; font-weight: 600; }
    .box { background: ${lightBg}; border-left: 4px solid ${primary}; padding: 16px; border-radius: 4px; margin: 20px 0; font-size: 14px; line-height: 1.6; }
    .btn { display: inline-block; background: linear-gradient(135deg, ${primary}, ${secondary}); color: #fff; padding: 12px 30px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 12px; }
    .footer { text-align: center; padding: 20px; background: ${lightBg}; color: #888; font-size: 13px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <img src="https://www.visionwanservices.com/assets/images/logo.png"
           alt="Vision Wan Services"
           width="100" height="100"
           style="display: block; margin: 0 auto 16px; width: 90px; height: 90px; object-fit: contain; background: #fff; border-radius: 50%; padding: 6px; border: 4px solid rgba(255,255,255,0.75);" />
      <h1>Thank You, ${feedback.name.split(' ')[0]}! 🙏</h1>
      <p>We've received your feedback</p>
    </div>
    <div class="content">
      <div style="text-align: center; margin-bottom: 20px;">
        <span class="badge">Reference: ${feedback.id}</span>
      </div>

      <p style="font-size: 15px; line-height: 1.7;">
        Thank you for taking the time to share your experience with <strong>Vision Wan Services</strong>.
        Every message helps us improve our car hire and accommodation services.
      </p>

      <div class="box">
        <p style="margin: 0 0 8px; font-weight: 600; color: ${dark};">Your feedback summary:</p>
        <p style="margin: 0; color: #555;">
          <strong>Category:</strong> ${feedback.category}<br>
          <strong>Rating:</strong> ${feedback.rating}/5<br>
        </p>
      </div>

      <div class="box" style="background: #ecfdf5; border-left-color: #10b981;">
        <p style="margin: 0;"><strong>✓ What happens next:</strong></p>
        <ul style="margin: 8px 0 0; padding-left: 20px; color: #555;">
          <li>Our team reviews every piece of feedback personally.</li>
          <li>If a follow-up is needed, we'll reach out within 24 hours.</li>
          <li>Your insights directly shape how we serve you better.</li>
        </ul>
      </div>

      <p style="font-size: 14px; color: #666; text-align: center; margin-top: 25px;">
        Have more to share? We're always listening.
      </p>

      <div style="text-align: center;">
        <a href="https://www.visionwanservices.com" class="btn">Visit Our Website</a>
      </div>
    </div>
    <div class="footer">
      <p><strong>Vision Wan Services</strong><br>
      Kenya: +254 (705) 336 311 | UK: +44 (7397) 549 590<br>
      Email: visionwanservices@gmail.com</p>
      <p style="font-size: 12px; color: #aaa;">© ${new Date().getFullYear()} Vision Wan Services. All rights reserved.</p>
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