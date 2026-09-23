import { Request, Response } from 'express';
import nodemailer from 'nodemailer';
import path from 'path';
import fs from 'fs';
import AdmZip from 'adm-zip';
import { ChatUpload, UploadedFileMeta } from '../types/chatUpload';
import { appendChatUploadToExcel } from '../utils/chatUploadStore';
import { getChatUploadDir } from '../middlewares/chatUpload';

/* ────────────────────────────────────────────────────────────
   Nodemailer Transporter
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
   Create ZIP of uploaded files for admin email attachment
   ──────────────────────────────────────────────────────────── */
const createUploadsZip = (upload: ChatUpload): string | null => {
    try {
        if (upload.files.length === 0) return null;

        const zip = new AdmZip();
        upload.files.forEach((f) => {
            if (fs.existsSync(f.storedPath)) {
                zip.addLocalFile(f.storedPath, undefined, f.originalName);
            }
        });

        const zipPath = path.join(getChatUploadDir(), `${upload.referenceId}.zip`);
        zip.writeZip(zipPath);
        return zipPath;
    } catch (err) {
        console.error('ZIP creation failed:', err);
        return null;
    }
};

/* ────────────────────────────────────────────────────────────
   Admin email HTML — Ultra HD, theme adaptive
   ──────────────────────────────────────────────────────────── */
const generateAdminEmailHtml = (upload: ChatUpload): string => {
    const primary = '#FF6B35';
    const secondary = '#FF8B35';
    const text = '#1a1a2e';
    const muted = '#64748b';
    const border = '#e5e7eb';
    const light = '#f8f9fa';

    const filesList = upload.files
        .map(
            (f) => `
        <tr>
          <td style="padding: 10px 0; border-bottom: 1px solid ${border}; font-size: 13px; color: ${text}; word-break: break-all;">
            ${f.originalName}
          </td>
          <td style="padding: 10px 0; border-bottom: 1px solid ${border}; font-size: 12px; color: ${muted}; text-align: right; white-space: nowrap;">
            ${(f.size / 1024).toFixed(1)} KB
          </td>
        </tr>`
        )
        .join('');

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>New Chat Upload — ${upload.referenceId}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 0; background: ${light}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; color: ${text}; }
    .wrapper { width: 100%; background: ${light}; padding: 32px 16px; }
    .container { max-width: 600px; margin: 0 auto; background: #fff; border-radius: 20px; overflow: hidden; box-shadow: 0 20px 60px -15px rgba(15,23,42,0.15); }
    .header { background: linear-gradient(135deg, ${primary}, ${secondary}); padding: 36px 24px; text-align: center; color: #fff; }
    .logo-badge { display: inline-block; width: 80px; height: 80px; background: #fff; border-radius: 50%; padding: 8px; margin-bottom: 16px; }
    .logo-badge img { width: 100%; height: 100%; object-fit: contain; border-radius: 50%; }
    .header h1 { margin: 0 0 6px; font-size: 22px; font-weight: 800; }
    .header p { margin: 0; font-size: 14px; opacity: 0.92; }
    .content { padding: 32px 28px; }
    .badge-wrap { text-align: center; margin-bottom: 24px; }
    .badge { display: inline-block; background: linear-gradient(135deg, ${primary}, ${secondary}); color: #fff; padding: 6px 16px; border-radius: 999px; font-size: 12px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
    .section { margin-bottom: 24px; }
    .section-title { font-size: 12px; font-weight: 800; color: ${text}; letter-spacing: 0.1em; text-transform: uppercase; padding-bottom: 8px; margin-bottom: 12px; border-bottom: 2px solid ${border}; position: relative; }
    .section-title::after { content: ''; position: absolute; left: 0; bottom: -2px; width: 42px; height: 2px; background: ${primary}; border-radius: 2px; }
    .info-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid ${border}; font-size: 14px; }
    .info-row:last-child { border-bottom: 0; }
    .label { color: ${muted}; font-weight: 600; }
    .value { color: ${text}; font-weight: 500; text-align: right; max-width: 60%; word-break: break-word; }
    .message-box { background: #fff7ed; border-left: 4px solid ${primary}; padding: 16px 18px; border-radius: 12px; font-size: 14px; line-height: 1.7; white-space: pre-wrap; }
    .files-table { width: 100%; border-collapse: collapse; }
    .btn-wrap { text-align: center; padding: 8px 0 24px; }
    .btn { display: inline-block; background: linear-gradient(135deg, ${primary}, #E85A25); color: #fff !important; padding: 13px 32px; border-radius: 12px; font-size: 14px; font-weight: 700; text-decoration: none; box-shadow: 0 10px 25px -5px rgba(255,107,53,0.5); }
    .footer { text-align: center; padding: 22px 28px; background: ${light}; color: ${muted}; font-size: 12px; line-height: 1.6; border-top: 1px solid ${border}; }
    .footer strong { color: ${text}; }
    @media (max-width: 600px) {
      .wrapper { padding: 16px 8px; }
      .content { padding: 24px 20px; }
      .info-row { flex-direction: column; gap: 4px; }
      .value { text-align: left; max-width: 100%; }
    }
    @media (prefers-color-scheme: dark) {
      body { background: #0b1120 !important; color: #e5e7eb !important; }
      .wrapper { background: #0b1120 !important; }
      .container { background: #111827 !important; }
      .content { color: #e5e7eb !important; }
      .section-title { color: #f3f4f6 !important; border-bottom-color: #1f2937 !important; }
      .info-row { border-bottom-color: #1f2937 !important; }
      .label { color: #9ca3af !important; }
      .value { color: #f3f4f6 !important; }
      .message-box { background: #1f2937 !important; color: #e5e7eb !important; }
      .footer { background: #0b1120 !important; color: #9ca3af !important; border-top-color: #1f2937 !important; }
      .footer strong { color: #f3f4f6 !important; }
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <div class="logo-badge">
          <img src="https://www.visionwanservices.com/assets/images/logo.png" alt="Vision Wan Services" />
        </div>
        <h1>New Chat Upload</h1>
        <p>Files received via visionwanservices.com</p>
      </div>

      <div class="content">
        <div class="badge-wrap">
          <span class="badge">Ref: ${upload.referenceId}</span>
        </div>

        <div class="section">
          <div class="section-title">From</div>
          <div class="info-row"><span class="label">Name</span><span class="value">${upload.name || 'Not provided'}</span></div>
          <div class="info-row"><span class="label">Email</span><span class="value">${upload.email || 'Not provided'}</span></div>
          ${upload.phone ? `<div class="info-row"><span class="label">Phone</span><span class="value">${upload.phone}</span></div>` : ''}
        </div>

        <div class="section">
          <div class="section-title">Message</div>
          <div class="message-box">${upload.message || '(no message)'}</div>
        </div>

        <div class="section">
          <div class="section-title">Attached Files (${upload.files.length})</div>
          ${
              upload.files.length > 0
                  ? `<table class="files-table">${filesList}</table>`
                  : `<p style="font-size: 13px; color: ${muted}; margin: 0;">No files attached</p>`
          }
        </div>

        <div class="btn-wrap">
          <a href="mailto:${upload.email}?subject=Re:%20Your%20message%20(${upload.referenceId})" class="btn">
            Reply to Customer
          </a>
        </div>
      </div>

      <div class="footer">
        <p style="margin: 0 0 4px;"><strong>Vision Wan Services</strong> — Chat Upload System</p>
        <p style="margin: 0;">Submitted: ${new Date(upload.submittedAt).toLocaleString()}</p>
      </div>
    </div>
  </div>
</body>
</html>
    `;
};

/* ────────────────────────────────────────────────────────────
   Customer confirmation email HTML
   ──────────────────────────────────────────────────────────── */
const generateCustomerEmailHtml = (upload: ChatUpload): string => {
    const firstName = (upload.name || 'there').split(' ')[0];
    const primary = '#FF6B35';
    const secondary = '#FF8B35';
    const text = '#1a1a2e';
    const muted = '#64748b';
    const border = '#e5e7eb';
    const light = '#f8f9fa';

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>We received your files — Vision Wan Services</title>
  <style>
    body { margin: 0; padding: 0; background: ${light}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; color: ${text}; }
    .wrapper { width: 100%; background: ${light}; padding: 32px 16px; }
    .container { max-width: 600px; margin: 0 auto; background: #fff; border-radius: 20px; overflow: hidden; box-shadow: 0 20px 60px -15px rgba(15,23,42,0.15); }
    .header { background: linear-gradient(135deg, ${primary}, ${secondary}); padding: 40px 24px; text-align: center; color: #fff; }
    .logo-badge { display: inline-block; width: 88px; height: 88px; background: #fff; border-radius: 50%; padding: 8px; margin-bottom: 16px; }
    .logo-badge img { width: 100%; height: 100%; object-fit: contain; border-radius: 50%; }
    .header h1 { margin: 0 0 6px; font-size: 24px; font-weight: 800; }
    .header p { margin: 0; font-size: 14px; opacity: 0.94; }
    .content { padding: 32px 28px; }
    .badge-wrap { text-align: center; margin-bottom: 24px; }
    .badge { display: inline-block; background: linear-gradient(135deg, ${primary}, ${secondary}); color: #fff; padding: 6px 16px; border-radius: 999px; font-size: 12px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
    p.lead { font-size: 15px; line-height: 1.75; margin: 0 0 22px; }
    .box { background: ${light}; border-left: 4px solid ${primary}; padding: 16px 18px; border-radius: 12px; margin: 18px 0; font-size: 14px; line-height: 1.7; }
    .box.success { background: #ecfdf5; border-left-color: #10b981; }
    .box-title { margin: 0 0 8px; font-weight: 700; }
    .btn-wrap { text-align: center; padding: 16px 0 24px; }
    .btn { display: inline-block; background: linear-gradient(135deg, ${primary}, #E85A25); color: #fff !important; padding: 14px 36px; border-radius: 12px; font-size: 15px; font-weight: 700; text-decoration: none; }
    .footer { text-align: center; padding: 24px 28px; background: ${light}; color: ${muted}; font-size: 12px; line-height: 1.7; border-top: 1px solid ${border}; }
    @media (prefers-color-scheme: dark) {
      body { background: #0b1120 !important; color: #e5e7eb !important; }
      .wrapper { background: #0b1120 !important; }
      .container { background: #111827 !important; }
      .lead { color: #e5e7eb !important; }
      .box { background: #1f2937 !important; color: #e5e7eb !important; }
      .box.success { background: rgba(16,185,129,0.1) !important; }
      .footer { background: #0b1120 !important; color: #9ca3af !important; border-top-color: #1f2937 !important; }
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <div class="logo-badge">
          <img src="https://www.visionwanservices.com/assets/images/logo.png" alt="Vision Wan Services" />
        </div>
        <h1>Thank You, ${firstName}!</h1>
        <p>We've received your files</p>
      </div>

      <div class="content">
        <div class="badge-wrap">
          <span class="badge">Ref: ${upload.referenceId}</span>
        </div>

        <p class="lead">
          Thanks for reaching out to <strong>Vision Wan Services</strong>. We've safely
          received <strong>${upload.files.length} file${upload.files.length === 1 ? '' : 's'}</strong>
          along with your message.
        </p>

        <div class="box">
          <p class="box-title">📎 What we received</p>
          <ul style="margin: 8px 0 0; padding-left: 20px;">
            ${upload.files.map((f) => `<li style="margin-bottom: 4px;">${f.originalName}</li>`).join('')}
          </ul>
        </div>

        <div class="box success">
          <p class="box-title">✓ What happens next</p>
          <ul style="margin: 8px 0 0; padding-left: 20px;">
            <li>Our team reviews your message and files.</li>
            <li>We'll reply on WhatsApp or by email within 24 hours.</li>
            <li>Keep this reference handy: <strong>${upload.referenceId}</strong></li>
          </ul>
        </div>

        <div class="btn-wrap">
          <a href="https://www.visionwanservices.com" class="btn">Visit Our Website</a>
        </div>
      </div>

      <div class="footer">
        <p style="margin: 0 0 4px;"><strong>Vision Wan Services</strong></p>
        <p style="margin: 0 0 4px;">Kenya: +254 (705) 336 311 &nbsp;·&nbsp; UK: +44 (7397) 549 590</p>
        <p style="margin: 0;">© ${new Date().getFullYear()} Vision Wan Services. All rights reserved.</p>
      </div>
    </div>
  </div>
</body>
</html>
    `;
};

/* ────────────────────────────────────────────────────────────
   Send admin notification email (with ZIP attached)
   ──────────────────────────────────────────────────────────── */
const sendAdminNotification = async (upload: ChatUpload, zipPath: string | null) => {
    const transporter = createTransporter();

    const attachments: any[] = [];
    if (zipPath && fs.existsSync(zipPath)) {
        attachments.push({
            filename: `${upload.referenceId}-attachments.zip`,
            path: zipPath,
            contentType: 'application/zip',
        });
    }

    await transporter.sendMail({
        from: process.env.EMAIL_FROM || '"Vision Wan Services" <bookings@visiononecarhire.com>',
        to: process.env.ADMIN_EMAIL || 'visionwanservices@gmail.com',
        subject: `📎 New Chat Upload — ${upload.name || 'Unknown'} (${upload.files.length} file${upload.files.length === 1 ? '' : 's'}) [${upload.referenceId}]`,
        html: generateAdminEmailHtml(upload),
        attachments,
    });

    console.log(`📧 Admin notification sent for ${upload.referenceId}`);
};

/* ────────────────────────────────────────────────────────────
   Send customer confirmation email
   ──────────────────────────────────────────────────────────── */
const sendCustomerConfirmation = async (upload: ChatUpload) => {
    if (!upload.email) return;

    const transporter = createTransporter();

    await transporter.sendMail({
        from: process.env.EMAIL_FROM || '"Vision Wan Services" <bookings@visiononecarhire.com>',
        to: upload.email,
        subject: `We received your files — Vision Wan Services (${upload.referenceId})`,
        html: generateCustomerEmailHtml(upload),
    });

    console.log(`📧 Customer confirmation sent to ${upload.email}`);
};

/* ────────────────────────────────────────────────────────────
   Create chat upload (main controller)
   ──────────────────────────────────────────────────────────── */
export const createChatUpload = async (req: Request, res: Response) => {
    try {
        const files = req.files as Express.Multer.File[];
        const { name, email, phone, message } = req.body;

        // Validation
        const errors: { field: string; message: string }[] = [];
        if (!name?.trim()) errors.push({ field: 'name', message: 'Name is required' });
        if (!email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            errors.push({ field: 'email', message: 'Valid email is required' });
        }
        if (!message?.trim() && (!files || files.length === 0)) {
            errors.push({
                field: 'message',
                message: 'Please provide a message or attach at least one file',
            });
        }

        if (errors.length > 0) {
            // Clean up any uploaded files if validation fails
            if (files && files.length > 0) {
                files.forEach((f) => {
                    try {
                        if (fs.existsSync(f.path)) fs.unlinkSync(f.path);
                    } catch (e) {
                        /* ignore */
                    }
                });
            }
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors,
            });
        }

        // Generate reference ID
        const referenceId = `CU-${Date.now().toString().slice(-8)}`;

        const uploadedFiles: UploadedFileMeta[] = (files || []).map((f) => ({
            originalName: f.originalname,
            storedName: f.filename,
            storedPath: f.path,
            size: f.size,
            mimeType: f.mimetype,
        }));

        const uploadRecord: ChatUpload = {
            id: referenceId,
            referenceId,
            name: name.trim(),
            email: email.trim().toLowerCase(),
            phone: phone?.trim() || '',
            message: message?.trim() || '',
            files: uploadedFiles,
            submittedAt: new Date().toISOString(),
            ipAddress:
                (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
                req.socket.remoteAddress ||
                '',
            userAgent: req.headers['user-agent'] || '',
            status: 'new',
        };

        // Store in Excel
        try {
            await appendChatUploadToExcel(uploadRecord);
        } catch (excelErr) {
            console.error(`⚠️ Excel append failed for ${referenceId}:`, excelErr);
            // Don't block
        }

        console.log(
            `📎 New chat upload: ${referenceId} from ${name} (${uploadedFiles.length} file${uploadedFiles.length === 1 ? '' : 's'})`
        );

        // Respond immediately
        res.status(201).json({
            success: true,
            message: 'Files received successfully',
            referenceId,
            fileCount: uploadedFiles.length,
        });

        // Send emails in background
        setTimeout(async () => {
            try {
                const zipPath = createUploadsZip(uploadRecord);
                await sendAdminNotification(uploadRecord, zipPath);
                await sendCustomerConfirmation(uploadRecord);

                // Clean up ZIP after send
                if (zipPath && fs.existsSync(zipPath)) {
                    setTimeout(() => {
                        try {
                            fs.unlinkSync(zipPath);
                        } catch (e) {
                            /* ignore */
                        }
                    }, 10000);
                }
            } catch (emailErr) {
                console.error(`❌ Email sending failed for ${referenceId}:`, emailErr);
            }
        }, 0);
    } catch (error) {
        console.error('❌ Chat upload error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to process upload',
            error:
                process.env.NODE_ENV === 'development'
                    ? (error as Error).message
                    : undefined,
        });
    }
};