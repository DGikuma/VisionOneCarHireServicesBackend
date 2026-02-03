"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.contactController = exports.getInquiryStats = exports.updateInquiryStatus = exports.getContactInquiries = exports.createContactInquiry = void 0;
const nodemailer_1 = __importDefault(require("nodemailer"));
// In-memory storage for contact inquiries
const contactInquiries = [];
// Department configuration
const departmentConfig = {
    general: {
        name: 'Executive Office',
        email: process.env.DEPARTMENT_GENERAL_EMAIL || 'vison1servicesltd@gmail.com',
        phone: '+254 (705) 336 311',
        priority: 'normal'
    },
    booking: {
        name: 'Premium Reservations',
        email: process.env.DEPARTMENT_BOOKING_EMAIL || 'vison1servicesltd@gmail.com',
        phone: '+254 (705) 336 311',
        priority: 'normal'
    },
    corporate: {
        name: 'Corporate Services',
        email: process.env.DEPARTMENT_CORPORATE_EMAIL || 'vison1servicesltd@gmail.com',
        phone: '+254 (705) 336 311',
        priority: 'high'
    },
    support: {
        name: 'Premium Support',
        email: process.env.DEPARTMENT_SUPPORT_EMAIL || 'vison1servicesltd@gmail.com',
        phone: '+254 (705) 336 311',
        priority: 'urgent'
    }
};
// Email transporter configuration
const createTransporter = () => {
    if (!process.env.EMAIL_HOST || !process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        throw new Error('Missing email configuration in environment variables');
    }
    return nodemailer_1.default.createTransport({
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
// Helper functions
const determinePriority = (subject, message, department) => {
    const urgentKeywords = ['urgent', 'emergency', 'immediately', 'asap', 'critical', 'broken down', 'accident', 'stranded'];
    const highKeywords = ['important', 'priority', 'corporate', 'business', 'enterprise', 'partnership', 'executive', 'ceo'];
    const text = (subject + ' ' + message).toLowerCase();
    if (urgentKeywords.some(keyword => text.includes(keyword)) || department === 'support') {
        return 'urgent';
    }
    if (highKeywords.some(keyword => text.includes(keyword)) || department === 'corporate') {
        return 'high';
    }
    return 'normal';
};
const getAssigneeForDepartment = (department) => {
    const assignees = {
        general: 'executive-team',
        booking: 'reservations-team',
        corporate: 'corporate-team',
        support: 'concierge-team'
    };
    return assignees[department] || 'executive-team';
};
const getEstimatedResponseTime = (priority) => {
    const responseTimes = {
        urgent: 'Within 30 minutes',
        high: 'Within 2 hours',
        normal: 'Within 4 business hours',
        low: 'Within 24 hours'
    };
    return responseTimes[priority];
};
// Email template generators
const generateAcknowledgementTemplate = (inquiry, department) => {
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Vision One - Inquiry Received</title>
        <style>
            body { font-family: 'Arial', sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 0 auto; background: #ffffff; }
            .header { background: linear-gradient(135deg, #1a365d 0%, #2d3748 100%); color: white; padding: 30px; text-align: center; }
            .content { padding: 30px; }
            .inquiry-details { background: #f8fafc; padding: 20px; border-radius: 10px; margin: 20px 0; border-left: 4px solid #FF6B35; }
            .priority { display: inline-block; padding: 5px 15px; border-radius: 20px; font-weight: bold; margin: 5px 0; font-size: 12px; }
            .priority-urgent { background: #fee2e2; color: #dc2626; }
            .priority-high { background: #fef3c7; color: #d97706; }
            .priority-normal { background: #d1fae5; color: #059669; }
            .footer { background: #edf2f7; padding: 20px; text-align: center; font-size: 12px; color: #6b7280; }
            .message-box { background: #f1f5f9; padding: 15px; border-radius: 5px; margin: 15px 0; font-style: italic; }
            .contact-info { background: #f0f9ff; padding: 15px; border-radius: 5px; margin: 15px 0; border-left: 4px solid #0ea5e9; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>Vision One Executive Services</h1>
                <h2>Inquiry Received</h2>
            </div>
            
            <div class="content">
                <p>Dear ${inquiry.name},</p>
                
                <p>Thank you for contacting Vision One Executive Services. Your inquiry has been received and is being processed by our ${department.name} team.</p>
                
                <div class="inquiry-details">
                    <h3 style="margin-top: 0; color: #1a365d;">Inquiry Details:</h3>
                    <p><strong>Reference ID:</strong> ${inquiry.id}</p>
                    <p><strong>Subject:</strong> ${inquiry.subject}</p>
                    <p><strong>Department:</strong> ${department.name}</p>
                    <p><strong>Priority:</strong> <span class="priority priority-${inquiry.priority}">${inquiry.priority.toUpperCase()}</span></p>
                    <p><strong>Estimated Response:</strong> ${getEstimatedResponseTime(inquiry.priority)}</p>
                    ${inquiry.company ? `<p><strong>Company:</strong> ${inquiry.company}</p>` : ''}
                    ${inquiry.phone ? `<p><strong>Phone:</strong> ${inquiry.phone}</p>` : ''}
                </div>
                
                <p><strong>Your Message:</strong></p>
                <div class="message-box">
                    ${inquiry.message.replace(/\n/g, '<br>')}
                </div>
                
                <div class="contact-info">
                    <p><strong>Our ${department.name} team contact details:</strong></p>
                    <ul style="margin: 10px 0; padding-left: 20px;">
                        <li>Email: ${department.email}</li>
                        <li>Phone: ${department.phone}</li>
                    </ul>
                </div>
                
                <p>Best regards,<br><strong>The Vision One Executive Team</strong></p>
            </div>
            
            <div class="footer">
                <p>Vision One Car Hire Services Ltd<br>
                Executive Support: ${department.phone} | Email: ${department.email}</p>
                <p>© ${new Date().getFullYear()} Vision One Car Hire. All rights reserved.</p>
                <p style="font-size: 10px; margin-top: 10px;">This is an automated message. Please do not reply to this email.</p>
            </div>
        </div>
    </body>
    </html>
    `;
};
const generateInternalNotificationTemplate = (inquiry, department) => {
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>New Contact Inquiry - ${inquiry.priority.toUpperCase()} Priority</title>
        <style>
            body { font-family: 'Arial', sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
            .container { max-width: 700px; margin: 0 auto; background: #ffffff; }
            .header { background: linear-gradient(135deg, ${inquiry.priority === 'urgent' ? '#dc2626' : inquiry.priority === 'high' ? '#d97706' : '#059669'} 0%, ${inquiry.priority === 'urgent' ? '#ef4444' : inquiry.priority === 'high' ? '#f59e0b' : '#10b981'} 100%); color: white; padding: 25px; text-align: center; }
            .content { padding: 25px; }
            .alert-box { background: #fef3c7; border: 2px solid #f59e0b; padding: 15px; border-radius: 8px; margin: 15px 0; }
            .customer-info { background: #f8fafc; padding: 15px; border-radius: 8px; margin: 15px 0; }
            .action-required { background: #fee2e2; border-left: 4px solid #dc2626; padding: 15px; margin: 20px 0; }
            .footer { background: #f1f5f9; padding: 15px; text-align: center; font-size: 12px; color: #6b7280; }
            .quick-actions { display: flex; gap: 10px; margin: 20px 0; }
            .action-btn { flex: 1; padding: 10px; text-align: center; background: #3b82f6; color: white; text-decoration: none; border-radius: 5px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>⚠️ NEW CONTACT INQUIRY</h1>
                <h2>Priority: ${inquiry.priority.toUpperCase()}</h2>
                <p>Department: ${department.name}</p>
            </div>
            
            <div class="content">
                <div class="alert-box">
                    <p><strong>⚠️ Action Required:</strong> New inquiry assigned to ${department.name} team</p>
                    <p><strong>Estimated Response Time:</strong> ${getEstimatedResponseTime(inquiry.priority)}</p>
                </div>
                
                <div class="customer-info">
                    <h3 style="margin-top: 0; color: #1a365d;">Customer Information:</h3>
                    <p><strong>Name:</strong> ${inquiry.name}</p>
                    <p><strong>Email:</strong> <a href="mailto:${inquiry.email}">${inquiry.email}</a></p>
                    ${inquiry.phone ? `<p><strong>Phone:</strong> <a href="tel:${inquiry.phone}">${inquiry.phone}</a></p>` : ''}
                    ${inquiry.company ? `<p><strong>Company:</strong> ${inquiry.company}</p>` : ''}
                </div>
                
                <h3>Inquiry Details:</h3>
                <p><strong>Reference ID:</strong> ${inquiry.id}</p>
                <p><strong>Subject:</strong> ${inquiry.subject}</p>
                <p><strong>Department:</strong> ${department.name}</p>
                <p><strong>Submitted:</strong> ${new Date(inquiry.submissionDate).toLocaleString()}</p>
                <p><strong>Assigned To:</strong> ${inquiry.assignedTo}</p>
                
                <div class="action-required">
                    <h3 style="margin-top: 0; color: #dc2626;">📝 Customer Message:</h3>
                    <p>${inquiry.message.replace(/\n/g, '<br>')}</p>
                </div>
                
                <div class="quick-actions">
                    <a href="mailto:${inquiry.email}?subject=Re: ${encodeURIComponent(inquiry.subject)}" class="action-btn">Reply to Customer</a>
                    ${inquiry.phone ? `<a href="tel:${inquiry.phone}" class="action-btn">Call Customer</a>` : ''}
                    <a href="mailto:${department.email}" class="action-btn">Internal Discussion</a>
                </div>
                
                <p><em>This inquiry requires a response within the estimated time frame.</em></p>
            </div>
            
            <div class="footer">
                <p>Vision One Contact Management System</p>
                <p>Generated: ${new Date().toLocaleString()}</p>
            </div>
        </div>
    </body>
    </html>
    `;
};
// Email sending functions
const sendAcknowledgementEmail = async (inquiry) => {
    try {
        const transporter = createTransporter();
        const department = departmentConfig[inquiry.department];
        const mailOptions = {
            from: `"Vision One Executive Support" <${process.env.EMAIL_FROM || 'noreply@visionone.com'}>`,
            to: inquiry.email,
            subject: `We've received your inquiry: ${inquiry.subject}`,
            html: generateAcknowledgementTemplate(inquiry, department),
            replyTo: department.email
        };
        const info = await transporter.sendMail(mailOptions);
        console.log(`Acknowledgement email sent to ${inquiry.email}: ${info.messageId}`);
        return info;
    }
    catch (error) {
        console.error('Error sending acknowledgement email:', error);
        throw error;
    }
};
const sendInternalNotificationEmail = async (inquiry) => {
    try {
        const transporter = createTransporter();
        const department = departmentConfig[inquiry.department];
        const mailOptions = {
            from: `"Vision One Contact System" <${process.env.EMAIL_FROM || 'info.bluevisionrealtors@gmail.com'}>`,
            to: department.email,
            subject: `🚨 New ${inquiry.priority.toUpperCase()} Inquiry: ${inquiry.subject}`,
            html: generateInternalNotificationTemplate(inquiry, department),
            cc: process.env.EMAIL_ADMIN || 'info.bluevisionrealtors@gmail.com'
        };
        const info = await transporter.sendMail(mailOptions);
        console.log(`Internal notification email sent: ${info.messageId}`);
        return info;
    }
    catch (error) {
        console.error('Error sending internal notification email:', error);
        throw error;
    }
};
// Controller functions
const createContactInquiry = async (req, res) => {
    try {
        const { name, email, phone, company, subject, message, department } = req.body;
        console.log('Received contact inquiry:', { name, email, subject, department });
        // Validate required fields
        if (!name || !email || !subject || !message || !department) {
            return res.status(400).json({
                error: 'Missing required fields: name, email, subject, message, and department are required'
            });
        }
        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ error: 'Invalid email format' });
        }
        // Validate department
        if (!departmentConfig[department]) {
            return res.status(400).json({
                error: 'Invalid department specified. Valid departments: general, booking, corporate, support'
            });
        }
        // Determine priority based on subject/keywords
        const priority = determinePriority(subject, message, department);
        // Create contact inquiry
        const contactInquiry = {
            id: `CONTACT-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
            name,
            email,
            phone: phone || '',
            company: company || '',
            subject,
            message,
            department,
            submissionDate: new Date().toISOString(),
            status: 'new',
            priority,
            assignedTo: getAssigneeForDepartment(department)
        };
        // Store inquiry
        contactInquiries.push(contactInquiry);
        console.log(`Inquiry stored with ID: ${contactInquiry.id}`);
        // Send emails in parallel
        await Promise.allSettled([
            sendAcknowledgementEmail(contactInquiry),
            sendInternalNotificationEmail(contactInquiry)
        ]);
        res.status(201).json({
            message: 'Contact inquiry submitted successfully',
            inquiry: {
                id: contactInquiry.id,
                name: contactInquiry.name,
                email: contactInquiry.email,
                subject: contactInquiry.subject,
                department: contactInquiry.department,
                priority: contactInquiry.priority,
                estimatedResponseTime: getEstimatedResponseTime(contactInquiry.priority),
                submissionDate: contactInquiry.submissionDate
            }
        });
    }
    catch (error) {
        console.error('Contact inquiry error:', error);
        res.status(500).json({
            error: 'Failed to process contact inquiry',
            details: process.env.NODE_ENV === 'development' ? error : undefined
        });
    }
};
exports.createContactInquiry = createContactInquiry;
const getContactInquiries = async (req, res) => {
    try {
        const { department, status, priority, limit } = req.query;
        let filteredInquiries = [...contactInquiries];
        // Apply filters
        if (department) {
            filteredInquiries = filteredInquiries.filter(inquiry => inquiry.department === department);
        }
        if (status) {
            filteredInquiries = filteredInquiries.filter(inquiry => inquiry.status === status);
        }
        if (priority) {
            filteredInquiries = filteredInquiries.filter(inquiry => inquiry.priority === priority);
        }
        // Sort by priority and date (newest first)
        const priorityOrder = { urgent: 0, high: 1, normal: 2, low: 3 };
        filteredInquiries.sort((a, b) => {
            const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
            if (priorityDiff !== 0)
                return priorityDiff;
            return new Date(b.submissionDate).getTime() - new Date(a.submissionDate).getTime();
        });
        // Apply limit if specified
        if (limit && !isNaN(Number(limit))) {
            filteredInquiries = filteredInquiries.slice(0, Number(limit));
        }
        res.json({
            count: filteredInquiries.length,
            inquiries: filteredInquiries
        });
    }
    catch (error) {
        console.error('Get inquiries error:', error);
        res.status(500).json({ error: 'Failed to retrieve contact inquiries' });
    }
};
exports.getContactInquiries = getContactInquiries;
const updateInquiryStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, notes, assignedTo } = req.body;
        const inquiry = contactInquiries.find(i => i.id === id);
        if (!inquiry) {
            return res.status(404).json({ error: 'Inquiry not found' });
        }
        // Validate status
        const validStatuses = ['new', 'in-progress', 'resolved', 'archived'];
        if (status && !validStatuses.includes(status)) {
            return res.status(400).json({ error: 'Invalid status value' });
        }
        // Update inquiry
        inquiry.status = status || inquiry.status;
        if (assignedTo)
            inquiry.assignedTo = assignedTo;
        res.json({
            message: 'Inquiry status updated successfully',
            inquiry
        });
    }
    catch (error) {
        console.error('Update inquiry error:', error);
        res.status(500).json({ error: 'Failed to update inquiry status' });
    }
};
exports.updateInquiryStatus = updateInquiryStatus;
const getInquiryStats = async (req, res) => {
    try {
        const stats = {
            total: contactInquiries.length,
            byStatus: {
                new: contactInquiries.filter(i => i.status === 'new').length,
                'in-progress': contactInquiries.filter(i => i.status === 'in-progress').length,
                resolved: contactInquiries.filter(i => i.status === 'resolved').length,
                archived: contactInquiries.filter(i => i.status === 'archived').length
            },
            byPriority: {
                urgent: contactInquiries.filter(i => i.priority === 'urgent').length,
                high: contactInquiries.filter(i => i.priority === 'high').length,
                normal: contactInquiries.filter(i => i.priority === 'normal').length,
                low: contactInquiries.filter(i => i.priority === 'low').length
            },
            byDepartment: {
                general: contactInquiries.filter(i => i.department === 'general').length,
                booking: contactInquiries.filter(i => i.department === 'booking').length,
                corporate: contactInquiries.filter(i => i.department === 'corporate').length,
                support: contactInquiries.filter(i => i.department === 'support').length
            }
        };
        res.json(stats);
    }
    catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({ error: 'Failed to retrieve inquiry statistics' });
    }
};
exports.getInquiryStats = getInquiryStats;
exports.contactController = {
    createContactInquiry: exports.createContactInquiry,
    getContactInquiries: exports.getContactInquiries,
    updateInquiryStatus: exports.updateInquiryStatus,
    getInquiryStats: exports.getInquiryStats
};
//# sourceMappingURL=contactController.js.map