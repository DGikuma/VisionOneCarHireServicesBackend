"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendBookingConfirmation = exports.createBooking = void 0;
const nodemailer_1 = __importDefault(require("nodemailer"));
const pdfkit_1 = __importDefault(require("pdfkit"));
// In-memory storage for bookings (replace with database in production)
const bookings = [];
const createBooking = async (req, res) => {
    try {
        const bookingData = req.body;
        // Validate required fields
        if (!bookingData.customerName || !bookingData.email || !bookingData.phone ||
            !bookingData.pickupDate || !bookingData.returnDate || !bookingData.carType ||
            !bookingData.pickupLocation) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        // Add booking to storage
        const bookingWithId = {
            ...bookingData,
            id: `BOOK-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            bookingDate: new Date().toISOString(),
            status: 'confirmed'
        };
        bookings.push(bookingWithId);
        // Send confirmation email with PDF
        await sendConfirmationEmail(bookingWithId);
        res.status(201).json({
            message: 'Booking created successfully',
            booking: bookingWithId
        });
    }
    catch (error) {
        console.error('Booking creation error:', error);
        res.status(500).json({ error: 'Failed to create booking' });
    }
};
exports.createBooking = createBooking;
const sendBookingConfirmation = async (req, res) => {
    try {
        const { bookingId } = req.body;
        const booking = bookings.find(b => b.id === bookingId);
        if (!booking) {
            return res.status(404).json({ error: 'Booking not found' });
        }
        await sendConfirmationEmail(booking);
        res.json({ message: 'Confirmation email sent successfully' });
    }
    catch (error) {
        console.error('Email sending error:', error);
        res.status(500).json({ error: 'Failed to send confirmation email' });
    }
};
exports.sendBookingConfirmation = sendBookingConfirmation;
const sendConfirmationEmail = async (booking) => {
    // Create PDF
    const pdfBuffer = await generateBookingPDF(booking);
    // Configure transporter (using Ethereal email for testing)
    const transporter = nodemailer_1.default.createTransport({
        host: process.env.EMAIL_HOST || 'smtp.ethereal.email',
        port: parseInt(process.env.EMAIL_PORT || '587'),
        secure: process.env.EMAIL_SECURE === 'true',
        auth: {
            user: process.env.EMAIL_USER || 'test@ethereal.email',
            pass: process.env.EMAIL_PASS || 'test123'
        }
    });
    // Email options
    const mailOptions = {
        from: `"Vision One Car Hire" <${process.env.EMAIL_FROM || 'bookings@visiononecarhire.com'}>`,
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
    // Send email
    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent:', info.messageId);
    return info;
};
const generateBookingPDF = (booking) => {
    return new Promise((resolve) => {
        const doc = new pdfkit_1.default({ margin: 50 });
        const buffers = [];
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
        doc.text(`Date: ${new Date(booking.bookingDate).toLocaleDateString()}`);
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
const generateEmailTemplate = (booking) => {
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
//# sourceMappingURL=bookingController.js.map