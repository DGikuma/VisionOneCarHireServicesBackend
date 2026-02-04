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
        // Get files from multer
        const files = req.files as {
            idDocument?: Express.Multer.File[];
            drivingLicense?: Express.Multer.File[];
            depositProof?: Express.Multer.File[];
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

        // Store file paths
        const findFile = (name: 'idDocument' | 'drivingLicense' | 'depositProof') =>
            files?.[name]?.[0]?.path;

        const bookingWithId: BookingData = {
            ...bookingData,
            id: bookingId,
            bookingDate: new Date().toISOString(),
            status,
            idDocumentPath: findFile('idDocument'),
            drivingLicensePath: findFile('drivingLicense'),
            depositProofPath: findFile('depositProof')
        };


        bookings.push(bookingWithId);

        console.log(`📝 New booking created: ${bookingId} for ${bookingData.customerName}`);
        console.log(`📁 Documents uploaded:`, {
            idDocument: !!files.idDocument,
            drivingLicense: !!files.drivingLicense,
            depositProof: !!files.depositProof
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
                pickupDate: formatDate(bookingData.pickupDate),
                returnDate: formatDate(bookingData.returnDate),
                carType: bookingData.carType,
                pickupLocation: bookingData.pickupLocation,
                idNumber: bookingData.idNumber,
                idType: bookingData.idType,
                status,
                bookingDate: formatDateTime(bookingWithId.bookingDate),
                hasDocuments: {
                    idDocument: !!findFile('idDocument'),
                    drivingLicense: !!findFile('drivingLicense'),
                    depositProof: !!findFile('depositProof')
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

                // Clean up ZIP file after sending
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
   Email Helpers (Updated)
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

    const mailOptions = {
        from: process.env.EMAIL_FROM || '"Vision Wan Services" <info.bluevisionrealtors@gmail.com>',
        to: process.env.ADMIN_EMAIL || 'info.bluevisionrealtors@gmail.com',
        subject: `📋 NEW BOOKING: ${booking.carType} - ${booking.customerName} (${booking.idNumber})`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #FF6B35;">🚗 NEW CAR BOOKING REQUEST</h2>
                <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                    <h3 style="color: #333; border-bottom: 2px solid #FF6B35; padding-bottom: 10px;">Booking Details</h3>
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Booking ID:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${booking.id}</td></tr>
                        <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Customer:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${booking.customerName}</td></tr>
                        <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>${booking.idType === 'passport' ? 'Passport No:' : 'ID Number:'}</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${booking.idNumber}</td></tr>
                        <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Email:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${booking.email}</td></tr>
                        <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Phone:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${booking.phone || 'N/A'}</td></tr>
                        <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Vehicle:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${booking.carType}</td></tr>
                        <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Pickup:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${formatDate(booking.pickupDate)} at ${booking.pickupLocation}</td></tr>
                        <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Return:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${formatDate(booking.returnDate)}</td></tr>
                        <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Deposit Proof:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${booking.depositProofPath ? '✅ Uploaded' : '❌ Missing'}</td></tr>
                        <tr><td style="padding: 8px;"><strong>Documents:</strong></td><td style="padding: 8px;">${attachments.length > 0 ? '✅ Attached as ZIP' : '❌ No documents'}</td></tr>
                    </table>
                </div>
                
                ${booking.additionalInfo ? `
                <div style="background: #e8f4fd; padding: 15px; border-radius: 5px; margin: 15px 0;">
                    <strong>Special Requests:</strong><br/>
                    ${booking.additionalInfo}
                </div>
                ` : ''}
                
                <div style="margin-top: 30px; padding-top: 20px; border-top: 2px solid #eee;">
                    <p><strong>📅 Booking Received:</strong> ${formatDateTime(booking.bookingDate)}</p>
                    <p><strong>🔒 Terms Accepted:</strong> ${booking.termsAccepted ? '✅ Yes' : '❌ No'}</p>
                </div>
                
                <div style="background: #FF6B35; color: white; padding: 15px; border-radius: 5px; margin-top: 20px; text-align: center;">
                    <p style="margin: 0; font-weight: bold;">ACTION REQUIRED: Process security deposit and verify documents</p>
                </div>
            </div>
        `,
        attachments
    };

    await transporter.sendMail(mailOptions);
    console.log(`📧 Admin notification sent for booking ${booking.id}`);
};

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

    // Add documents ZIP if available
    if (zipPath && fs.existsSync(zipPath)) {
        attachments.push({
            filename: `${booking.idNumber}_your_documents.zip`,
            path: zipPath,
            contentType: 'application/zip'
        });
    }

    const mailOptions = {
        from: process.env.EMAIL_FROM || '"Vision Wan Services" <bookings@visiononecarhire.com>',
        to: booking.email,
        subject: `✅ Booking Confirmed: ${booking.id} - Vision Wan Services`,
        html: generateEmailTemplate(booking),
        attachments
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Confirmation email sent to ${booking.email}: ${info.messageId}`);
    return info;
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
        doc.fillColor('#FF6B35').fontSize(25).text('Vision Wan Service', { align: 'center' });
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

        doc.fontSize(12).text('Thank you for choosing Vision Wan Services !', { align: 'center' });
        doc.text('For inquiries: vision1servicesltd@gmail.com', { align: 'center' });

        doc.end();
    });
};

/* -----------------------------
   Enhanced Email Template
--------------------------------*/
const generateEmailTemplate = (booking: BookingData): string => {
    return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .header { background: #FF6B35; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; }
        .booking-details { background: #f7fafc; padding: 20px; border-radius: 5px; margin: 20px 0; }
        .document-status { background: #e8f4fd; padding: 15px; border-radius: 5px; margin: 20px 0; }
        .footer { background: #edf2f7; padding: 15px; text-align: center; font-size: 12px; }
        table { width: 100%; border-collapse: collapse; }
        td { padding: 10px; border-bottom: 1px solid #ddd; }
        .status-ok { color: green; }
        .status-pending { color: orange; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Vision Wan Services</h1>
        <h2>Booking Confirmation</h2>
      </div>
      <div class="content">
        <p>Dear ${booking.customerName},</p>
        <p>Thank you for booking with Vision Wan Services! Your reservation has been confirmed.</p>
        
        <div class="booking-details">
          <h3>Booking Summary</h3>
          <table>
            <tr><td><strong>Booking ID:</strong></td><td>${booking.id}</td></tr>
            <tr><td><strong>Car Type:</strong></td><td>${booking.carType}</td></tr>
            <tr><td><strong>Pickup Date:</strong></td><td>${formatDate(booking.pickupDate)}</td></tr>
            <tr><td><strong>Return Date:</strong></td><td>${formatDate(booking.returnDate)}</td></tr>
            <tr><td><strong>Pickup Location:</strong></td><td>${booking.pickupLocation || 'Main Office'}</td></tr>
            <tr><td><strong>${booking.idType === 'passport' ? 'Passport No:' : 'ID Number:'}</strong></td><td>${booking.idNumber}</td></tr>
          </table>
        </div>
        
        <div class="document-status">
          <h3>Document Status</h3>
          <table>
            <tr>
            <td><strong>ID Document:</strong></td>
            <td>
                ${booking.idDocumentPath
            ? '<span class="status-ok">✓ Uploaded</span>'
            : '<span class="status-pending">⏳ Pending</span>'}
            </td>
            </tr>
            <tr>
            <td><strong>Driving License:</strong></td>
            <td>
                ${booking.drivingLicensePath
            ? '<span class="status-ok">✓ Uploaded</span>'
            : '<span class="status-pending">⏳ Pending</span>'}
            </td>
            </tr>
            <tr><td><strong>Deposit Proof:</strong></td><td>${booking.depositProofPath ? '<span class="status-ok">✓ Uploaded</span>' : '<span class="status-pending">⏳ Pending</span>'}</td></tr>
          </table>
        </div>
        
        <div style="background: #fff8e1; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <h4>📋 What's Next:</h4>
          <ol>
            <li>Your booking confirmation PDF is attached.</li>
            <li>All your uploaded documents are included in the ZIP file.</li>
            <li>Please bring your original documents for verification at pickup.</li>
            <li>Present your deposit proof receipt when collecting the vehicle.</li>
          </ol>
        </div>
        
        <p><strong>Deposit Information:</strong><br/>
        Your security deposit has been recorded. Please bring the proof of payment when picking up the vehicle.</p>
        
        <p>Safe travels,<br>The Vision Wan Service Team</p>
      </div>
      <div class="footer">
        <p><strong>Vision Wan Services</strong><br>
        Kenya: +254 (705) 336 311 | UK: +44 (7397) 549 590<br>
        Email: vison1servicesltd@gmail.com</p>
        <p style="font-size: 11px; color: #666;">
          This email contains confidential information. If you received this email in error, please delete it immediately.
        </p>
        <p>© ${new Date().getFullYear()} Vision Wan. All rights reserved.</p>
      </div>
    </body>
    </html>
    `;
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