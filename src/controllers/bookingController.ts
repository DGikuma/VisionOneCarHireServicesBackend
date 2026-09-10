import { Request, Response } from 'express';
import nodemailer from 'nodemailer';
import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import { BookingData } from '../types/booking';

const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads');

// In-memory storage for bookings
const bookings: BookingData[] = [];

/* -----------------------------
   Safe Date Utilities
--------------------------------*/
const formatDate = (dateStr?: string | null, fallback = 'N/A') => {
    if (!dateStr) return fallback;
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? fallback : date.toLocaleDateString();
};

const formatDateTime = (dateStr?: string | null, fallback = 'N/A') => {
    if (!dateStr) return fallback;
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? fallback : date.toLocaleString();
};

/* -----------------------------
   Nodemailer Transporter
--------------------------------*/
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
            pass: process.env.EMAIL_PASS
        },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 10000
    });
};

/* -----------------------------
   Create ZIP of uploaded documents
--------------------------------*/
const createDocumentsZip = async (booking: BookingData): Promise<string | null> => {
    try {
        const filesToZip: string[] = [];

        if (booking.idDocumentPath && fs.existsSync(booking.idDocumentPath)) {
            filesToZip.push(booking.idDocumentPath);
        }
        if (booking.drivingLicensePath && fs.existsSync(booking.drivingLicensePath)) {
            filesToZip.push(booking.drivingLicensePath);
        }
        if (booking.depositProofPath && fs.existsSync(booking.depositProofPath)) {
            filesToZip.push(booking.depositProofPath);
        }

        if (filesToZip.length === 0) {
            console.log('No documents to zip');
            return null;
        }

        const zip = new AdmZip();
        const zipFileName = `${booking.idNumber}_documents.zip`;
        const zipPath = path.join(UPLOAD_DIR, zipFileName);

        // Add files to zip with proper names
        filesToZip.forEach(filePath => {
            const fileName = path.basename(filePath);
            zip.addLocalFile(filePath, undefined, fileName);
        });

        // Write zip file
        zip.writeZip(zipPath);

        console.log(`ZIP created: ${zipPath}`);
        return zipPath;

    } catch (error) {
        console.error('Error creating ZIP:', error);
        return null;
    }
};

/* -----------------------------
   Create Booking
--------------------------------*/
export const createBooking = async (req: Request, res: Response) => {
    try {
        // Get files from multer - using any[] because we're using .any()
        const files = req.files as any[];
        
        console.log('📁 Files received:', files?.length || 0);
        if (files && files.length > 0) {
            files.forEach((file, index) => {
                console.log(`   File ${index + 1}: ${file.fieldname} - ${file.originalname} (${file.mimetype})`);
            });
        }

        // Helper to find file by field name (supports both naming conventions)
        const findFile = (fieldNames: string[]) => {
            if (!files || !Array.isArray(files)) return undefined;
            for (const fieldName of fieldNames) {
                const file = files.find(f => f.fieldname === fieldName);
                if (file) return file;
            }
            return undefined;
        };

        // Get form data
        const bookingData: BookingData = {
            customerName: req.body.customerName,
            email: req.body.email,
            phone: req.body.phone,
            pickupDate: req.body.pickupDate,
            returnDate: req.body.returnDate,
            carType: req.body.carType,
            pickupLocation: req.body.pickupLocation,
            dropoffLocation: req.body.dropoffLocation,
            additionalInfo: req.body.additionalInfo,
            nationality: req.body.nationality || '', 
            idNumber: req.body.idNumber,
            idType: req.body.idType,
            termsAccepted: req.body.termsAccepted === 'true' || req.body.termsAccepted === true
        };

        // Validate essential fields
        const requiredFields = [
            'customerName', 'email', 'phone', 'pickupDate', 'returnDate',
            'carType', 'pickupLocation', 'idNumber', 'idType'
        ];

        const missingFields = requiredFields.filter(field => !bookingData[field as keyof BookingData]);
        if (missingFields.length > 0) {
            return res.status(400).json({
                success: false,
                error: `Missing required fields: ${missingFields.join(', ')}`
            });
        }

        if (!bookingData.termsAccepted) {
            return res.status(400).json({
                success: false,
                error: 'Terms and conditions must be accepted'
            });
        }

        // Generate booking ID
        const bookingId = `V1-${Date.now().toString().slice(-8)}`;
        const status = 'confirmed';

        // Find files using both possible field names
        const idDocFile = findFile(['idDocument', 'idDoc']);
        const drivingLicenseFile = findFile(['drivingLicense', 'drivingLicence']);
        const depositProofFile = findFile(['depositProof']);

        const bookingWithId: BookingData = {
            ...bookingData,
            id: bookingId,
            bookingDate: new Date().toISOString(),
            status,
            idDocumentPath: idDocFile?.path,
            drivingLicensePath: drivingLicenseFile?.path,
            depositProofPath: depositProofFile?.path
        };

        bookings.push(bookingWithId);

        console.log(`📝 New booking created: ${bookingId} for ${bookingData.customerName}`);
        console.log(`📁 Documents uploaded:`, {
            idDocument: !!idDocFile,
            drivingLicense: !!drivingLicenseFile,
            depositProof: !!depositProofFile
        });

        // Respond immediately
        res.status(201).json({
            success: true,
            message: 'Booking created successfully',
            booking: {
                id: bookingId,
                customerName: bookingData.customerName,
                email: bookingData.email,
                phone: bookingData.phone,
                nationality: bookingData.nationality, 
                pickupDate: formatDate(bookingData.pickupDate),
                returnDate: formatDate(bookingData.returnDate),
                carType: bookingData.carType,
                pickupLocation: bookingData.pickupLocation,
                idNumber: bookingData.idNumber,
                idType: bookingData.idType,
                status,
                bookingDate: formatDateTime(bookingWithId.bookingDate),
                hasDocuments: {
                    idDocument: !!idDocFile,
                    drivingLicense: !!drivingLicenseFile,
                    depositProof: !!depositProofFile
                }
            }
        });

        // Send emails in background
        setTimeout(async () => {
            try {
                const zipPath = await createDocumentsZip(bookingWithId);
                await sendAdminNotification(bookingWithId, zipPath);
                await sendCustomerConfirmation(bookingWithId, zipPath);
                console.log(`✅ All emails sent for booking ${bookingId}`);

                if (zipPath && fs.existsSync(zipPath)) {
                    setTimeout(() => {
                        fs.unlinkSync(zipPath);
                        console.log(`🗑️ Cleaned up ZIP file: ${zipPath}`);
                    }, 5000);
                }
            } catch (emailError) {
                console.error(`❌ Email sending failed for ${bookingId}:`, emailError);
            }
        }, 0);

    } catch (error) {
        console.error('❌ Booking creation error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create booking',
            message: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
        });
    }
};


/* -----------------------------
   Enhanced PDF Generation
--------------------------------*/
const generateBookingPDF = (booking: BookingData): Promise<Buffer> => {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ margin: 50 });
        const buffers: Buffer[] = [];

        doc.on('data', buffers.push.bind(buffers));
        doc.on('error', reject);
        doc.on('end', () => resolve(Buffer.concat(buffers)));

        // Header
        doc.fillColor('#FF6B35').fontSize(25).text('Vision One Service', { align: 'center' });
        doc.moveDown();
        doc.fillColor('#333').fontSize(20).text('Booking Confirmation', { align: 'center' });
        doc.moveDown();

        // Booking Info
        doc.fontSize(12).text(`Booking ID: ${booking.id}`);
        doc.text(`Date: ${formatDateTime(booking.bookingDate)}`);
        doc.moveDown();

        // Customer Information
        doc.fontSize(16).text('Customer Information:');
        doc.fontSize(12).text(`Name: ${booking.customerName}`);
        doc.text(`Email: ${booking.email}`);
        doc.text(`Phone: ${booking.phone || 'N/A'}`);
        doc.text(`${booking.idType === 'passport' ? 'Passport No' : 'ID Number'}: ${booking.idNumber}`);
        if (booking.additionalInfo) doc.text(`Additional Info: ${booking.additionalInfo}`);
        doc.moveDown();

        // Booking Details
        doc.fontSize(16).text('Booking Details:');
        doc.fontSize(12).text(`Car Type: ${booking.carType}`);
        doc.text(`Pickup Date: ${formatDate(booking.pickupDate)}`);
        doc.text(`Return Date: ${formatDate(booking.returnDate)}`);
        doc.text(`Pickup Location: ${booking.pickupLocation || 'Main Office'}`);
        if (booking.dropoffLocation) doc.text(`Drop-off Location: ${booking.dropoffLocation}`);
        doc.moveDown();

        // Security Deposit
        doc.fontSize(16).text('Security Deposit Information:');
        doc.fontSize(12).text(`Deposit Status: ${booking.depositProofPath ? 'Payment proof submitted' : 'Pending'}`);
        doc.text(`Documents Status: All required documents ${booking.idDocumentPath && booking.drivingLicensePath ? 'submitted' : 'pending'}`);
        doc.moveDown();

        // Terms & Conditions
        doc.fontSize(14).text('Terms & Conditions:', { underline: true });
        doc.fontSize(10).text('1. Customer must present valid driver\'s license and ID/passport at pickup.');
        doc.text('2. Security deposit is required and will be refunded upon vehicle return.');
        doc.text('3. Minimum rental age is 25 years.');
        doc.text('4. Fuel policy: Return with same level as pickup.');
        doc.text('5. Insurance included as per rental agreement.');
        doc.text('6. All uploaded documents will be kept confidential.');
        doc.moveDown();

        // Important Notes
        doc.fontSize(12).text('Important Notes:', { underline: true });
        doc.fontSize(10).text('• Please bring your original ID/passport and driving license for verification.');
        doc.text('• Your security deposit receipt must be presented at pickup.');
        doc.text('• Keep all booking documents for your records.');
        doc.moveDown();

        doc.fontSize(12).text('Thank you for choosing Vision One Services !', { align: 'center' });
        doc.text('For inquiries: vision1servicesltd@gmail.com', { align: 'center' });

        doc.end();
    });
};

/* -----------------------------
   Enhanced Email Template
--------------------------------*/
// ======================== REPLACE THESE FUNCTIONS ========================

/* -----------------------------
   Enhanced Email Template (Customer)
--------------------------------*/
const generateEmailTemplate = (booking: BookingData): string => {
  const primary = '#FF6B35';
  const secondary = '#FF8B35';
  const dark = '#1a1a2e';
  const lightBg = '#f8f9fa';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Booking Confirmation</title>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 0; background-color: ${lightBg}; }
    .container { max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 16px; box-shadow: 0 10px 40px rgba(0,0,0,0.08); overflow: hidden; }
    .header { background: linear-gradient(135deg, ${primary}, ${secondary}); padding: 30px 20px; text-align: center; }
    .header h1 { color: #fff; margin: 0; font-size: 28px; font-weight: 700; }
    .header p { color: rgba(255,255,255,0.9); margin: 8px 0 0; font-size: 16px; }
    .content { padding: 30px 25px; }
    .badge { display: inline-block; background: ${primary}; color: #fff; padding: 4px 14px; border-radius: 20px; font-size: 13px; font-weight: 600; }
    .section { margin-bottom: 24px; }
    .section-title { color: ${dark}; font-size: 18px; font-weight: 700; border-bottom: 3px solid ${primary}; padding-bottom: 8px; margin-bottom: 16px; }
    .info-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; }
    .info-label { color: #666; font-weight: 600; font-size: 14px; }
    .info-value { color: ${dark}; font-weight: 500; font-size: 14px; text-align: right; }
    .highlight-box { background: ${lightBg}; border-left: 4px solid ${primary}; padding: 12px 16px; border-radius: 4px; margin: 16px 0; }
    .highlight-box p { margin: 0; color: #444; font-size: 14px; }
    .status-ok { color: #10b981; font-weight: 600; }
    .status-pending { color: #f59e0b; font-weight: 600; }
    .btn { display: inline-block; background: linear-gradient(135deg, ${primary}, ${secondary}); color: #fff; padding: 12px 30px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 10px; }
    .footer { text-align: center; padding: 20px; background: ${lightBg}; color: #888; font-size: 13px; border-top: 1px solid #eee; }
    .footer a { color: ${primary}; text-decoration: none; }
    @media (max-width: 480px) {
      .info-row { flex-direction: column; align-items: flex-start; gap: 4px; }
      .info-value { text-align: left; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🚗 Booking Confirmed</h1>
      <p>Thank you for choosing Vision One Services</p>
    </div>
    <div class="content">
      <div style="text-align: center; margin-bottom: 20px;">
        <span class="badge">Booking #${booking.id}</span>
      </div>

      <div class="section">
        <div class="section-title">📋 Reservation Details</div>
        <div class="info-row"><span class="info-label">Vehicle</span><span class="info-value">${booking.carType}</span></div>
        <div class="info-row"><span class="info-label">Pickup Location</span><span class="info-value">${booking.pickupLocation || 'Main Office'}</span></div>
        ${booking.dropoffLocation ? `<div class="info-row"><span class="info-label">Return Location</span><span class="info-value">${booking.dropoffLocation}</span></div>` : ''}
        <div class="info-row"><span class="info-label">Pickup Date</span><span class="info-value">${formatDate(booking.pickupDate)}</span></div>
        <div class="info-row"><span class="info-label">Return Date</span><span class="info-value">${formatDate(booking.returnDate)}</span></div>
      </div>

      <div class="section">
        <div class="section-title">👤 Client Information</div>
        <div class="info-row"><span class="info-label">Name</span><span class="info-value">${booking.customerName}</span></div>
        <div class="info-row"><span class="info-label">Email</span><span class="info-value">${booking.email}</span></div>
        <div class="info-row"><span class="info-label">Phone</span><span class="info-value">${booking.phone || 'N/A'}</span></div>
        <div class="info-row"><span class="info-label">${booking.idType === 'passport' ? 'Passport No' : 'ID Number'}</span><span class="info-value">${booking.idNumber}</span></div>
      </div>

      <div class="section">
        <div class="section-title">📎 Document Status</div>
        <div class="info-row"><span class="info-label">ID Document</span><span class="info-value ${booking.idDocumentPath ? 'status-ok' : 'status-pending'}">${booking.idDocumentPath ? '✅ Uploaded' : '⏳ Pending'}</span></div>
        <div class="info-row"><span class="info-label">Driving License</span><span class="info-value ${booking.drivingLicensePath ? 'status-ok' : 'status-pending'}">${booking.drivingLicensePath ? '✅ Uploaded' : '⏳ Pending'}</span></div>
        <div class="info-row"><span class="info-label">Deposit Proof</span><span class="info-value ${booking.depositProofPath ? 'status-ok' : 'status-pending'}">${booking.depositProofPath ? '✅ Uploaded' : '⏳ Pending'}</span></div>
      </div>

      ${booking.additionalInfo ? `
      <div class="section">
        <div class="section-title">📝 Additional Notes</div>
        <div class="highlight-box"><p>${booking.additionalInfo}</p></div>
      </div>` : ''}

      <div class="highlight-box" style="margin-top: 20px;">
        <p><strong>📌 What's Next?</strong></p>
        <ul style="margin: 8px 0 0; padding-left: 20px;">
          <li>You'll receive a confirmation call within 24 hours.</li>
          <li>Bring your original ID and driving license for verification.</li>
          <li>Keep this email and the attached PDF for your records.</li>
        </ul>
      </div>

      <div style="text-align: center; margin: 30px 0 10px;">
        <a href="https://visionwanservices.com" class="btn">Visit Our Website</a>
      </div>
    </div>
    <div class="footer">
      <p><strong>Vision One Services</strong><br>
      Kenya: +254 (705) 336 311 | UK: +44 (7397) 549 590<br>
      Email: visionwanservices@gmail.com</p>
      <p style="font-size: 12px; color: #aaa;">© ${new Date().getFullYear()} Vision One Services. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
  `;
};

/* -----------------------------
   Enhanced Admin Notification
--------------------------------*/
const sendAdminNotification = async (booking: BookingData, zipPath: string | null) => {
  const transporter = createTransporter();

  const attachments = [];
  if (zipPath && fs.existsSync(zipPath)) {
    attachments.push({
      filename: `${booking.idNumber}_documents.zip`,
      path: zipPath,
      contentType: 'application/zip'
    });
  }

  const primary = '#FF6B35';
  const secondary = '#FF8B35';
  const dark = '#1a1a2e';
  const lightBg = '#f8f9fa';

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Booking</title>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 0; background: ${lightBg}; }
    .container { max-width: 600px; margin: 20px auto; background: #fff; border-radius: 16px; box-shadow: 0 10px 40px rgba(0,0,0,0.08); overflow: hidden; }
    .header { background: linear-gradient(135deg, ${primary}, ${secondary}); padding: 25px; text-align: center; }
    .header h1 { color: #fff; margin: 0; font-size: 26px; }
    .content { padding: 25px; }
    .badge { display: inline-block; background: #dc2626; color: #fff; padding: 4px 14px; border-radius: 20px; font-size: 13px; font-weight: 600; }
    .section { margin-bottom: 20px; }
    .section-title { color: ${dark}; font-size: 18px; font-weight: 700; border-bottom: 2px solid ${primary}; padding-bottom: 6px; margin-bottom: 12px; }
    .info-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #eee; }
    .info-label { color: #666; font-weight: 600; font-size: 14px; }
    .info-value { color: ${dark}; font-weight: 500; font-size: 14px; text-align: right; }
    .alert-box { background: #fee2e2; border-left: 4px solid #dc2626; padding: 15px; border-radius: 4px; margin: 20px 0; }
    .footer { background: ${lightBg}; padding: 15px; text-align: center; font-size: 12px; color: #6b7280; border-top: 1px solid #eee; }
    @media (max-width: 480px) {
      .info-row { flex-direction: column; align-items: flex-start; gap: 4px; }
      .info-value { text-align: left; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📋 NEW BOOKING REQUEST</h1>
      <p style="color: rgba(255,255,255,0.9); margin: 0;">Action Required</p>
    </div>
    <div class="content">
      <div style="text-align: center; margin-bottom: 15px;">
        <span class="badge">${booking.id}</span>
      </div>

      <div class="section">
        <div class="section-title">👤 Customer</div>
        <div class="info-row"><span class="info-label">Name</span><span class="info-value">${booking.customerName}</span></div>
        <div class="info-row"><span class="info-label">Email</span><span class="info-value">${booking.email}</span></div>
        <div class="info-row"><span class="info-label">Phone</span><span class="info-value">${booking.phone || 'N/A'}</span></div>
        <div class="info-row"><span class="info-label">${booking.idType === 'passport' ? 'Passport No' : 'ID Number'}</span><span class="info-value">${booking.idNumber}</span></div>
      </div>

      <div class="section">
        <div class="section-title">🚗 Booking</div>
        <div class="info-row"><span class="info-label">Vehicle</span><span class="info-value">${booking.carType}</span></div>
        <div class="info-row"><span class="info-label">Pickup</span><span class="info-value">${formatDate(booking.pickupDate)} at ${booking.pickupLocation || 'Main Office'}</span></div>
        <div class="info-row"><span class="info-label">Return</span><span class="info-value">${formatDate(booking.returnDate)}</span></div>
        ${booking.dropoffLocation ? `<div class="info-row"><span class="info-label">Drop-off</span><span class="info-value">${booking.dropoffLocation}</span></div>` : ''}
      </div>

      <div class="section">
        <div class="section-title">📎 Documents</div>
        <div class="info-row"><span class="info-label">ID Document</span><span class="info-value">${booking.idDocumentPath ? '✅ Uploaded' : '❌ Missing'}</span></div>
        <div class="info-row"><span class="info-label">Driving License</span><span class="info-value">${booking.drivingLicensePath ? '✅ Uploaded' : '❌ Missing'}</span></div>
        <div class="info-row"><span class="info-label">Deposit Proof</span><span class="info-value">${booking.depositProofPath ? '✅ Uploaded' : '❌ Missing'}</span></div>
        <div class="info-row"><span class="info-label">ZIP Attached</span><span class="info-value">${attachments.length > 0 ? '✅ Yes' : '❌ No'}</span></div>
      </div>

      ${booking.additionalInfo ? `
      <div class="section">
        <div class="section-title">📝 Notes</div>
        <div style="background: #f1f5f9; padding: 12px; border-radius: 4px;">${booking.additionalInfo}</div>
      </div>` : ''}

      <div class="alert-box">
        <p><strong>⚠️ ACTION REQUIRED</strong></p>
        <p style="margin: 0;">Verify identity documents, process security deposit, and confirm vehicle availability.</p>
      </div>

      <div style="text-align: center; margin: 20px 0;">
        <a href="mailto:${booking.email}?subject=Re: Booking ${booking.id}" style="display: inline-block; background: ${primary}; color: #fff; padding: 10px 25px; border-radius: 8px; text-decoration: none; font-weight: 600;">Reply to Customer</a>
      </div>
    </div>
    <div class="footer">
      <p>Vision One Services — Booking Management System</p>
      <p>Received: ${formatDateTime(booking.bookingDate)}</p>
    </div>
  </div>
</body>
</html>
  `;

  const mailOptions = {
    from: process.env.EMAIL_FROM || '"Vision One Services" <bookings@visiononecarhire.com>',
    to: process.env.ADMIN_EMAIL || 'visionwanservices@gmail.com',
    subject: `📋 NEW BOOKING: ${booking.carType} - ${booking.customerName} (${booking.idNumber})`,
    html,
    attachments
  };

  await transporter.sendMail(mailOptions);
  console.log(`📧 Admin notification sent for booking ${booking.id}`);
};

/* -----------------------------
   Enhanced Customer Confirmation
--------------------------------*/
const sendCustomerConfirmation = async (booking: BookingData, zipPath: string | null) => {
  const transporter = createTransporter();
  const pdfBuffer = await generateBookingPDF(booking);

  const attachments: any[] = [
    {
      filename: `booking-confirmation-${booking.id}.pdf`,
      content: pdfBuffer,
      contentType: 'application/pdf'
    }
  ];

  if (zipPath && fs.existsSync(zipPath)) {
    attachments.push({
      filename: `${booking.idNumber}_your_documents.zip`,
      path: zipPath,
      contentType: 'application/zip'
    });
  }

  const mailOptions = {
    from: process.env.EMAIL_FROM || '"Vision One Services" <bookings@visiononecarhire.com>',
    to: booking.email,
    subject: `✅ Booking Confirmed: ${booking.id} - Vision One Services`,
    html: generateEmailTemplate(booking),
    attachments
  };

  const info = await transporter.sendMail(mailOptions);
  console.log(`✅ Confirmation email sent to ${booking.email}: ${info.messageId}`);
  return info;
};

// Keep existing sendBookingConfirmation function as is
export const sendBookingConfirmation = async (req: Request, res: Response) => {
    try {
        const { bookingId } = req.body;

        if (!bookingId) {
            return res.status(400).json({
                success: false,
                error: 'bookingId is required'
            });
        }

        const booking = bookings.find(b => b.id === bookingId);

        if (!booking) {
            return res.status(404).json({
                success: false,
                error: 'Booking not found'
            });
        }

        const zipPath = await createDocumentsZip(booking);
        await sendCustomerConfirmation(booking, zipPath);

        // Clean up
        if (zipPath && fs.existsSync(zipPath)) {
            fs.unlinkSync(zipPath);
        }

        res.json({
            success: true,
            message: 'Confirmation email sent successfully'
        });

    } catch (error) {
        console.error('❌ Resend confirmation error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to resend confirmation email'
        });
    }
};