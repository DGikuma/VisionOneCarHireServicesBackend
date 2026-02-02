import { Request, Response } from 'express';
import nodemailer from 'nodemailer';
import PDFDocument from 'pdfkit';
import { BookingData, BookingStatus } from '../types/booking';

// In-memory storage for bookings
const bookings: BookingData[] = [];

// Email transporter setup
const createTransporter = () => {
    if (process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS) {
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
    } else {
        console.log('📧 Using Ethereal test email service');
        return nodemailer.createTransport({
            host: 'smtp.gmail.com',
            port: 587,
            auth: {
                user: 'denniskimani62@gmail.com',
                pass: 'Gikuma@3'
            }
        });
    }
};

export const createBooking = async (req: Request, res: Response) => {
    try {
        const bookingData: BookingData = req.body;

        // Generate booking ID
        const bookingId = `V1-${Date.now().toString().slice(-8)}`;
        const status: BookingStatus = 'confirmed';

        // Create booking object with proper typing
        const bookingWithId: BookingData = {
            ...bookingData,
            id: bookingId,
            bookingDate: new Date().toISOString(),
            status: status // This is now the correct type
        };

        // Store booking
        bookings.push(bookingWithId);

        console.log(`📝 New booking created: ${bookingId} for ${bookingData.customerName}`);

        // ✅ RESPOND IMMEDIATELY
        res.status(201).json({
            success: true,
            message: 'Booking created successfully',
            booking: {
                id: bookingId,
                customerName: bookingData.customerName,
                email: bookingData.email,
                pickupDate: bookingData.pickupDate,
                carType: bookingData.carType,
                status: status,
                timestamp: new Date().toISOString()
            }
        });

        // 🔥 Run email sending in background AFTER response
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
        console.error('Email sending error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to send confirmation email'
        });
    }
};

// Send email to admin
const sendAdminNotification = async (booking: BookingData) => {
    const transporter = createTransporter();

    const mailOptions = {
        from: process.env.EMAIL_FROM || '"Vision One Car Hire" <denniskimani62@gmail.com>',
        to: process.env.ADMIN_EMAIL || 'denniskimani62@gmail.com',
        subject: `New Car Booking: ${booking.carType} - ${booking.customerName}`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #2c3e50;">🚗 New Car Booking Request</h2>
                <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; border-left: 4px solid #3498db;">
                    <h3 style="margin-top: 0;">Customer Details</h3>
                    <p><strong>Booking ID:</strong> ${booking.id}</p>
                    <p><strong>Name:</strong> ${booking.customerName}</p>
                    <p><strong>Email:</strong> ${booking.email}</p>
                    <p><strong>Phone:</strong> ${booking.phone}</p>
                </div>
                
                <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-top: 20px; border-left: 4px solid #2ecc71;">
                    <h3>Booking Details</h3>
                    <p><strong>Car Type:</strong> ${booking.carType}</p>
                    <p><strong>Pickup Date:</strong> ${new Date(booking.pickupDate).toLocaleDateString()}</p>
                    <p><strong>Return Date:</strong> ${new Date(booking.returnDate).toLocaleDateString()}</p>
                    <p><strong>Pickup Location:</strong> ${booking.pickupLocation}</p>
                    <p><strong>Dropoff Location:</strong> ${booking.dropoffLocation}</p>
                    ${booking.additionalInfo ? `<p><strong>Additional Info:</strong> ${booking.additionalInfo}</p>` : ''}
                </div>
                
                <div style="margin-top: 30px; padding: 15px; background: #e8f4fc; border-radius: 8px;">
                    <p style="margin: 0; color: #2c3e50;">
                        <strong>📅 Booking Received:</strong> ${new Date(booking.bookingDate!).toLocaleString()}
                    </p>
                </div>
            </div>
        `
    };

    await transporter.sendMail(mailOptions);
    console.log(`📧 Admin notification sent for booking ${booking.id}`);
};

// Send confirmation email to customer with PDF
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

const generateBookingPDF = (booking: BookingData): Promise<Buffer> => {
    return new Promise((resolve) => {
        const doc = new PDFDocument({ margin: 50 });
        const buffers: Buffer[] = [];

        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => {
            const pdfData = Buffer.concat(buffers);
            resolve(pdfData);
        });

        // PDF Content
        doc.fontSize(25).text('Vision One Car Hire', { align: 'center' });
        doc.moveDown();
        doc.fontSize(20).text('Booking Confirmation', { align: 'center' });
        doc.moveDown();

        doc.fontSize(12).text(`Booking ID: ${booking.id}`);
        doc.text(`Date: ${new Date(booking.bookingDate!).toLocaleDateString()}`);
        doc.moveDown();

        doc.fontSize(16).text('Customer Information:');
        doc.fontSize(12).text(`Name: ${booking.customerName}`);
        doc.text(`Email: ${booking.email}`);
        doc.text(`Phone: ${booking.phone}`);
        if (booking.additionalInfo) {
            doc.text(`Additional Info: ${booking.additionalInfo}`);
        }
        doc.moveDown();

        doc.fontSize(16).text('Booking Details:');
        doc.fontSize(12).text(`Car Type: ${booking.carType}`);
        doc.text(`Pickup Date: ${new Date(booking.pickupDate).toLocaleDateString()}`);
        doc.text(`Return Date: ${new Date(booking.returnDate).toLocaleDateString()}`);
        doc.text(`Pickup Location: ${booking.pickupLocation || 'Main Office'}`);
        if (booking.dropoffLocation) {
            doc.text(`Drop-off Location: ${booking.dropoffLocation}`);
        }
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
          <h3>Booking Details:</h3>
          <p><strong>Booking ID:</strong> ${booking.id}</p>
          <p><strong>Car Type:</strong> ${booking.carType}</p>
          <p><strong>Pickup Date:</strong> ${new Date(booking.pickupDate).toLocaleDateString()}</p>
          <p><strong>Return Date:</strong> ${new Date(booking.returnDate).toLocaleDateString()}</p>
          <p><strong>Pickup Location:</strong> ${booking.pickupLocation || 'Main Office'}</p>
        </div>
        
        <p>Your booking confirmation PDF is attached to this email. Please bring this document and your driver's license when picking up your vehicle.</p>
        
        <p>If you need to make any changes to your booking, please contact us at least 24 hours before your pickup time.</p>
        
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