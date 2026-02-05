import { Request, Response } from 'express';
import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import nodemailer from 'nodemailer';

// Define BookingData inline to fix the issue
interface BookingData {
    id: string;
    customerName: string;
    email: string;
    phone: string;
    pickupDate: string;
    returnDate: string;
    carType: string;
    pickupLocation: string;
    dropoffLocation?: string;
    additionalInfo?: string;
    idNumber: string;
    idType: 'id' | 'passport' | 'national_id'; // Fixed here
    termsAccepted: boolean;
    bookingDate: string;
    status: string;
    idDocumentPath?: string;
    drivingLicensePath?: string;
    depositProofPath?: string;
}

const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads');

// OUTLOOK EMAIL CONFIGURATION
const EMAIL_CONFIG = {
    host: 'smtp.office365.com', // Outlook SMTP server
    port: 587,
    secure: false, // Use STARTTLS
    auth: {
        user: 'vision1servicesltd@outlook.com',
        pass: '@VisionWan100%'
    },
    from: 'Vision Wan Services <vision1servicesltd@outlook.com>',
    adminEmail: 'vision1servicesltd@outlook.com',
};

// Create email transporter with Outlook configuration
const createTransporter = () => {
    return nodemailer.createTransport({
        host: EMAIL_CONFIG.host,
        port: EMAIL_CONFIG.port,
        secure: EMAIL_CONFIG.secure,
        auth: EMAIL_CONFIG.auth,
        connectionTimeout: 30000, // Increased timeout
        greetingTimeout: 30000,
        socketTimeout: 30000,
        tls: {
            ciphers: 'SSLv3' // Sometimes needed for Outlook
        }
    });
};

// Test the email configuration
const testEmailConnection = async () => {
    try {
        const transporter = createTransporter();
        await transporter.verify();
        console.log('✅ Outlook email server connection verified');
        return true;
    } catch (error) {
        console.error('❌ Outlook email server connection failed:', error);

        // Provide troubleshooting tips
        console.log('\n⚠️ OUTLOOK TROUBLESHOOTING:');
        console.log('1. Make sure your Outlook password is correct');
        console.log('2. Enable "Less secure app access" in Outlook settings');
        console.log('3. Try using an App Password if 2FA is enabled');
        console.log('4. Check if your account allows SMTP access');
        console.log('5. Try using port 465 with secure: true');

        return false;
    }
};

testEmailConnection();

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
   Helper function to validate and normalize idType
--------------------------------*/
const normalizeIdType = (idType: string): BookingData['idType'] => {
    const validTypes: BookingData['idType'][] = ['id', 'passport', 'national_id'];

    if (validTypes.includes(idType as BookingData['idType'])) {
        return idType as BookingData['idType'];
    }

    // Default mapping
    if (idType === 'national_id' || idType === 'national-id') {
        return 'national_id';
    }

    return 'id'; // Default fallback
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

        filesToZip.forEach(filePath => {
            const fileName = path.basename(filePath);
            zip.addLocalFile(filePath, undefined, fileName);
        });

        zip.writeZip(zipPath);
        console.log(`ZIP created: ${zipPath}`);
        return zipPath;

    } catch (error) {
        console.error('Error creating ZIP:', error);
        return null;
    }
};

/* -----------------------------
   Create Booking - FIXED VERSION
--------------------------------*/
export const createBooking = async (req: Request, res: Response) => {
    try {
        // Get files from multer
        const files = req.files as {
            idDocument?: Express.Multer.File[];
            drivingLicense?: Express.Multer.File[];
            depositProof?: Express.Multer.File[];
        };

        // Validate essential fields
        const requiredFields = [
            'customerName', 'email', 'phone', 'pickupDate', 'returnDate',
            'carType', 'pickupLocation', 'idNumber', 'idType'
        ];

        const missingFields = requiredFields.filter(field => !req.body[field]);
        if (missingFields.length > 0) {
            return res.status(400).json({
                success: false,
                error: `Missing required fields: ${missingFields.join(', ')}`
            });
        }

        const termsAccepted = req.body.termsAccepted === 'true' || req.body.termsAccepted === true;
        if (!termsAccepted) {
            return res.status(400).json({
                success: false,
                error: 'Terms and conditions must be accepted'
            });
        }

        // Generate booking ID and create complete booking object
        const bookingId = `V1-${Date.now().toString().slice(-8)}`;
        const status = 'confirmed';
        const bookingDate = new Date().toISOString();

        // Store file paths
        const findFile = (name: 'idDocument' | 'drivingLicense' | 'depositProof') =>
            files?.[name]?.[0]?.path;

        // Create the COMPLETE BookingData object with all required properties
        const booking: BookingData = {
            id: bookingId,
            customerName: req.body.customerName,
            email: req.body.email,
            phone: req.body.phone,
            pickupDate: req.body.pickupDate,
            returnDate: req.body.returnDate,
            carType: req.body.carType,
            pickupLocation: req.body.pickupLocation,
            dropoffLocation: req.body.dropoffLocation || undefined,
            additionalInfo: req.body.additionalInfo || undefined,
            idNumber: req.body.idNumber,
            idType: normalizeIdType(req.body.idType),
            termsAccepted,
            bookingDate,
            status,
            idDocumentPath: findFile('idDocument'),
            drivingLicensePath: findFile('drivingLicense'),
            depositProofPath: findFile('depositProof')
        };

        bookings.push(booking);
        console.log(`📝 New booking created: ${bookingId} for ${booking.customerName}`);

        // Respond immediately
        res.status(201).json({
            success: true,
            message: 'Booking created successfully',
            booking: {
                id: booking.id,
                customerName: booking.customerName,
                email: booking.email,
                phone: booking.phone,
                pickupDate: formatDate(booking.pickupDate),
                returnDate: formatDate(booking.returnDate),
                carType: booking.carType,
                pickupLocation: booking.pickupLocation,
                idNumber: booking.idNumber,
                idType: booking.idType,
                status: booking.status,
                bookingDate: formatDateTime(booking.bookingDate),
                hasDocuments: {
                    idDocument: !!findFile('idDocument'),
                    drivingLicense: !!findFile('drivingLicense'),
                    depositProof: !!findFile('depositProof')
                }
            }
        });

        // Send emails in background with error handling
        setTimeout(async () => {
            try {
                console.log(`📧 Starting email process for booking ${booking.id}...`);

                const zipPath = await createDocumentsZip(booking);
                console.log(`📧 ZIP file ${zipPath ? 'created' : 'not needed'}`);

                // Test connection first
                try {
                    const transporter = createTransporter();
                    await transporter.verify();
                    console.log('✅ Outlook connection verified, sending emails...');

                    await Promise.all([
                        sendAdminNotification(booking, zipPath),
                        sendCustomerConfirmation(booking, zipPath)
                    ]);
                    console.log(`✅ All emails sent for booking ${booking.id}`);
                } catch (emailError) {
                    console.error(`❌ Email connection/sending failed for ${booking.id}:`, emailError);
                    console.log('⚠️ Booking was saved, but emails could not be sent');
                    // Don't throw - booking was successful
                }

                if (zipPath && fs.existsSync(zipPath)) {
                    setTimeout(() => {
                        fs.unlinkSync(zipPath);
                        console.log(`🗑️ Cleaned up ZIP file: ${zipPath}`);
                    }, 5000);
                }
            } catch (error) {
                console.error(`❌ Background email process failed for ${booking.id}:`, error);
                console.log('⚠️ Booking was saved successfully, but email process failed');
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
   Outlook Email Helpers
--------------------------------*/
const sendAdminNotification = async (booking: BookingData, zipPath: string | null) => {
    try {
        const transporter = createTransporter();

        const attachments = [];

        if (zipPath && fs.existsSync(zipPath)) {
            attachments.push({
                filename: `${booking.idNumber}_documents.zip`,
                path: zipPath,
                contentType: 'application/zip'
            });
        }

        // Get display name for idType
        const idTypeDisplay = booking.idType === 'passport' ? 'Passport No:' :
            booking.idType === 'national_id' ? 'National ID:' : 'ID Number:';

        const mailOptions = {
            from: EMAIL_CONFIG.from,
            to: EMAIL_CONFIG.adminEmail,
            subject: `📋 NEW BOOKING: ${booking.carType} - ${booking.customerName} (${booking.idNumber})`,
            html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #FF6B35;">🚗 NEW CAR BOOKING REQUEST</h2>
                <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                    <h3 style="color: #333; border-bottom: 2px solid #FF6B35; padding-bottom: 10px;">Booking Details</h3>
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Booking ID:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${booking.id}</td></tr>
                        <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Customer:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${booking.customerName}</td></tr>
                        <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>${idTypeDisplay}</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${booking.idNumber}</td></tr>
                        <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Email:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${booking.email}</td></tr>
                        <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Phone:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${booking.phone || 'N/A'}</td></tr>
                        <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Vehicle:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${booking.carType}</td></tr>
                        <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Pickup:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${formatDate(booking.pickupDate)} at ${booking.pickupLocation}</td></tr>
                        <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Return:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${formatDate(booking.returnDate)}</td></tr>
                        <tr><td style="padding: 8px;"><strong>Deposit Proof:</strong></td><td style="padding: 8px;">${booking.depositProofPath ? '✅ Uploaded' : '❌ Missing'}</td></tr>
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
            attachments,
            replyTo: booking.email
        };

        const info = await transporter.sendMail(mailOptions);
        console.log(`📧 Admin notification sent for booking ${booking.id}: ${info.messageId}`);
        return info;
    } catch (error) {
        console.error('Error sending admin notification:', error);
        throw error;
    }
};

const sendCustomerConfirmation = async (booking: BookingData, zipPath: string | null) => {
    try {
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

        // Get display name for idType
        const idTypeDisplay = booking.idType === 'passport' ? 'Passport No:' :
            booking.idType === 'national_id' ? 'National ID:' : 'ID Number:';

        const mailOptions = {
            from: EMAIL_CONFIG.from,
            to: booking.email,
            subject: `✅ Booking Confirmed: ${booking.id} - Vision Wan Services`,
            html: `
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
                            <tr><td><strong>${idTypeDisplay}</strong></td><td>${booking.idNumber}</td></tr>
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
                            <tr>
                                <td><strong>Deposit Proof:</strong></td>
                                <td>${booking.depositProofPath ? '<span class="status-ok">✓ Uploaded</span>' : '<span class="status-pending">⏳ Pending</span>'}</td>
                            </tr>
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
                    
                    <p>Safe travels,<br>The Vision Wan Services Team</p>
                </div>
                <div class="footer">
                    <p><strong>Vision Wan Services</strong><br>
                    Kenya: +254 (705) 336 311 | UK: +44 (7397) 549 590<br>
                    Email: vision1servicesltd@outlook.com</p>
                    <p style="font-size: 11px; color: #666;">
                        This email contains confidential information. If you received this email in error, please delete it immediately.
                    </p>
                    <p>© ${new Date().getFullYear()} Vision Wan Services. All rights reserved.</p>
                </div>
            </body>
            </html>
            `,
            attachments,
            replyTo: EMAIL_CONFIG.adminEmail
        };

        const info = await transporter.sendMail(mailOptions);
        console.log(`✅ Confirmation email sent to ${booking.email}: ${info.messageId}`);
        return info;
    } catch (error) {
        console.error('Error sending customer confirmation:', error);
        throw error;
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

        // Get display name for idType
        const idTypeDisplay = booking.idType === 'passport' ? 'Passport No' :
            booking.idType === 'national_id' ? 'National ID' : 'ID Number';

        // Header
        doc.fillColor('#FF6B35').fontSize(25).text('Vision Wan Services', { align: 'center' });
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
        doc.text(`${idTypeDisplay}: ${booking.idNumber}`);
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

        doc.fontSize(12).text('Thank you for choosing Vision Wan Services!', { align: 'center' });
        doc.text('For inquiries: vision1servicesltd@outlook.com', { align: 'center' });

        doc.end();
    });
};

/* -----------------------------
   Resend Confirmation Function
--------------------------------*/
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

/* -----------------------------
   Alternative Outlook Configuration Options
--------------------------------*/

// Option 1: Use Outlook with SSL (port 465)
const createTransporterSSL = () => {
    return nodemailer.createTransport({
        host: 'smtp.office365.com',
        port: 465,
        secure: true, // SSL
        auth: EMAIL_CONFIG.auth,
        connectionTimeout: 30000,
        greetingTimeout: 30000,
        socketTimeout: 30000
    });
};

// Option 2: Use Outlook Live/Hotmail
const createTransporterHotmail = () => {
    return nodemailer.createTransport({
        host: 'smtp-mail.outlook.com',
        port: 587,
        secure: false,
        auth: {
            user: 'your-email@hotmail.com', // Hotmail address
            pass: 'your-hotmail-password'
        },
        connectionTimeout: 30000,
        greetingTimeout: 30000,
        socketTimeout: 30000
    });
};

// Option 3: Use Ethereal (Test SMTP - works on Render)
const createTransporterEthereal = () => {
    return nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
            user: 'kassandra.muller@ethereal.email',
            pass: 'KUjAN3nPVwkX4sVwCJ'
        }
    });
};

// Export the bookings array for other functions if needed
export { bookings };