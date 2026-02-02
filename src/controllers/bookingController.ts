import { Request, Response } from 'express';
import nodemailer from 'nodemailer';
import PDFDocument from 'pdfkit';
import { BookingData, BookingStatus } from '../types/booking';

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
   Create Booking
--------------------------------*/
export const createBooking = async (req: Request, res: Response) => {
    try {
        const bookingData: BookingData = req.body;

        // Validate essential fields
        if (!bookingData.customerName || !bookingData.email || !bookingData.pickupDate || !bookingData.returnDate) {
            return res.status(400).json({
                success: false,
                error: 'Missing required booking fields: customerName, email, pickupDate, returnDate'
            });
        }

        // Generate booking ID
        const bookingId = `V1-${Date.now().toString().slice(-8)}`;
        const status: BookingStatus = 'confirmed';

        const bookingWithId: BookingData = {
            ...bookingData,
            id: bookingId,
            bookingDate: new Date().toISOString(),
            status
        };

        bookings.push(bookingWithId);

        console.log(`📝 New booking created: ${bookingId} for ${bookingData.customerName}`);

        // Respond immediately
        res.status(201).json({
            success: true,
            message: 'Booking created successfully',
            booking: {
                id: bookingId,
                customerName: bookingData.customerName,
                email: bookingData.email,
                pickupDate: formatDate(bookingData.pickupDate),
                returnDate: formatDate(bookingData.returnDate),
                carType: bookingData.carType,
                status,
                bookingDate: formatDateTime(bookingWithId.bookingDate)
            }
        });

        // Send emails in background
        setTimeout(async () => {
            try {
                await sendAdminNotification(bookingWithId);
                await sendCustomerConfirmation(bookingWithId);
                console.log(`✅ All emails sent for booking ${bookingId}`);
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

        await sendCustomerConfirmation(booking);

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
   Email Helpers
--------------------------------*/
const sendAdminNotification = async (booking: BookingData) => {
    const transporter = createTransporter();

    const mailOptions = {
        from: process.env.EMAIL_FROM || '"Vision One Car Hire" <info.bluevisionrealtors@gmail.com>',
        to: process.env.ADMIN_EMAIL || 'info.bluevisionrealtors@gmail.com',
        subject: `New Car Booking: ${booking.carType} - ${booking.customerName}`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2>🚗 New Car Booking Request</h2>
                <div>
                    <strong>Booking ID:</strong> ${booking.id}<br/>
                    <strong>Name:</strong> ${booking.customerName}<br/>
                    <strong>Email:</strong> ${booking.email}<br/>
                    <strong>Phone:</strong> ${booking.phone || 'N/A'}<br/>
                    <strong>Pickup Date:</strong> ${formatDate(booking.pickupDate)}<br/>
                    <strong>Return Date:</strong> ${formatDate(booking.returnDate)}<br/>
                    <strong>Pickup Location:</strong> ${booking.pickupLocation || 'Main Office'}<br/>
                    <strong>Dropoff Location:</strong> ${booking.dropoffLocation || 'N/A'}<br/>
                    ${booking.additionalInfo ? `<strong>Additional Info:</strong> ${booking.additionalInfo}` : ''}
                </div>
                <p>📅 Booking Received: ${formatDateTime(booking.bookingDate)}</p>
            </div>
        `
    };

    await transporter.sendMail(mailOptions);
    console.log(`📧 Admin notification sent for booking ${booking.id}`);
};

const sendCustomerConfirmation = async (booking: BookingData) => {
    const transporter = createTransporter();
    const pdfBuffer = await generateBookingPDF(booking);

    const mailOptions = {
        from: process.env.EMAIL_FROM || '"Vision One Car Hire" <bookings@visiononecarhire.com>',
        to: booking.email,
        subject: `Booking Confirmation: ${booking.id} - Vision One Car Hire`,
        html: generateEmailTemplate(booking),
        attachments: [
            {
                filename: `booking-confirmation-${booking.id}.pdf`,
                content: pdfBuffer,
                contentType: 'application/pdf'
            }
        ]
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Confirmation email sent to ${booking.email}: ${info.messageId}`);
    return info;
};

/* -----------------------------
   PDF Generation
--------------------------------*/
const generateBookingPDF = (booking: BookingData): Promise<Buffer> => {
    return new Promise((resolve) => {
        const doc = new PDFDocument({ margin: 50 });
        const buffers: Buffer[] = [];

        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => resolve(Buffer.concat(buffers)));

        doc.fontSize(25).text('Vision One Car Hire', { align: 'center' });
        doc.moveDown();
        doc.fontSize(20).text('Booking Confirmation', { align: 'center' });
        doc.moveDown();

        doc.fontSize(12).text(`Booking ID: ${booking.id}`);
        doc.text(`Date: ${formatDateTime(booking.bookingDate)}`);
        doc.moveDown();

        doc.fontSize(16).text('Customer Information:');
        doc.fontSize(12).text(`Name: ${booking.customerName}`);
        doc.text(`Email: ${booking.email}`);
        doc.text(`Phone: ${booking.phone || 'N/A'}`);
        if (booking.additionalInfo) doc.text(`Additional Info: ${booking.additionalInfo}`);
        doc.moveDown();

        doc.fontSize(16).text('Booking Details:');
        doc.fontSize(12).text(`Car Type: ${booking.carType}`);
        doc.text(`Pickup Date: ${formatDate(booking.pickupDate)}`);
        doc.text(`Return Date: ${formatDate(booking.returnDate)}`);
        doc.text(`Pickup Location: ${booking.pickupLocation || 'Main Office'}`);
        if (booking.dropoffLocation) doc.text(`Drop-off Location: ${booking.dropoffLocation}`);
        doc.moveDown();

        doc.fontSize(14).text('Terms & Conditions:', { underline: true });
        doc.fontSize(10).text('1. Customer must present valid driver\'s license and credit card at pickup.');
        doc.text('2. Minimum rental age is 25 years.');
        doc.text('3. Fuel policy: Return with same level as pickup.');
        doc.text('4. Insurance included as per rental agreement.');
        doc.moveDown();

        doc.fontSize(12).text('Thank you for choosing Vision One Car Hire!', { align: 'center' });
        doc.text('For inquiries: vison1servicesltd@gmail.com', { align: 'center' });

        doc.end();
    });
};

/* -----------------------------
   Email Template
--------------------------------*/
const generateEmailTemplate = (booking: BookingData): string => {
    return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .header { background: #1a365d; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; }
        .booking-details { background: #f7fafc; padding: 15px; border-radius: 5px; margin: 20px 0; }
        .footer { background: #edf2f7; padding: 15px; text-align: center; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Vision One Car Hire</h1>
        <h2>Booking Confirmation</h2>
      </div>
      <div class="content">
        <p>Dear ${booking.customerName},</p>
        <p>Thank you for booking with Vision One Car Hire! Your reservation has been confirmed.</p>
        <div class="booking-details">
          <p><strong>Booking ID:</strong> ${booking.id}</p>
          <p><strong>Car Type:</strong> ${booking.carType}</p>
          <p><strong>Pickup Date:</strong> ${formatDate(booking.pickupDate)}</p>
          <p><strong>Return Date:</strong> ${formatDate(booking.returnDate)}</p>
          <p><strong>Pickup Location:</strong> ${booking.pickupLocation || 'Main Office'}</p>
        </div>
        <p>Your booking confirmation PDF is attached. Please bring it and your driver's license when picking up your vehicle.</p>
        <p>Safe travels,<br>The Vision One Car Hire Team</p>
      </div>
      <div class="footer">
        <p>Vision One Car Hire Services<br>
        Phone: +44 (7397) 549 590 | Email: vison1servicesltd@gmail.com</p>
        <p>© ${new Date().getFullYear()} Vision One Car Hire. All rights reserved.</p>
      </div>
    </body>
    </html>
    `;
};
