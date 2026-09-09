// src/controllers/contactController.ts
import { Request, Response } from 'express';
import nodemailer from 'nodemailer';

// TypeScript interfaces
interface ContactData {
    id: string;
    name: string;
    email: string;
    phone?: string;
    company?: string;
    subject: string;
    message: string;
    department: string;
    submissionDate: string;
    status: 'new' | 'in-progress' | 'resolved' | 'archived';
    priority: 'low' | 'normal' | 'high' | 'urgent';
    assignedTo?: string;
}

// In-memory storage for contact inquiries
const contactInquiries: ContactData[] = [];

// Department configuration
const departmentConfig = {
    general: {
        name: 'Executive Office',
        email: process.env.DEPARTMENT_GENERAL_EMAIL || 'visionwanservices@gmail.com',
        phone: '+254 (705) 336 311',
        priority: 'normal'
    },
    booking: {
        name: 'Premium Reservations',
        email: process.env.DEPARTMENT_BOOKING_EMAIL || 'visionwanservices@gmail.com',
        phone: '+254 (705) 336 311',
        priority: 'normal'
    },
    corporate: {
        name: 'Corporate Services',
        email: process.env.DEPARTMENT_CORPORATE_EMAIL || 'visionwanservices@gmail.com',
        phone: '+254 (705) 336 311',
        priority: 'high'
    },
    support: {
        name: 'Premium Support',
        email: process.env.DEPARTMENT_SUPPORT_EMAIL || 'visionwanservices@gmail.com',
        phone: '+254 (705) 336 311',
        priority: 'urgent'
    }
} as const;

// Email transporter configuration
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


// Helper functions
const determinePriority = (subject: string, message: string, department: string): ContactData['priority'] => {
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

const getAssigneeForDepartment = (department: string): string => {
    const assignees: Record<string, string> = {
        general: 'executive-team',
        booking: 'reservations-team',
        corporate: 'corporate-team',
        support: 'concierge-team'
    };
    return assignees[department] || 'executive-team';
};

const getEstimatedResponseTime = (priority: ContactData['priority']): string => {
    const responseTimes: Record<ContactData['priority'], string> = {
        urgent: 'Within 30 minutes',
        high: 'Within 2 hours',
        normal: 'Within 4 business hours',
        low: 'Within 24 hours'
    };
    return responseTimes[priority];
};

// Email template generators
// ======================== REPLACE THESE FUNCTIONS ========================

const generateAcknowledgementTemplate = (inquiry: ContactData, department: any): string => {
  const primary = '#FF6B35';
  const secondary = '#FF8B35';
  const dark = '#1a1a2e';
  const lightBg = '#f8f9fa';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Inquiry Received</title>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 0; background: ${lightBg}; }
    .container { max-width: 600px; margin: 20px auto; background: #fff; border-radius: 16px; box-shadow: 0 10px 40px rgba(0,0,0,0.08); overflow: hidden; }
    .header { background: linear-gradient(135deg, ${primary}, ${secondary}); padding: 30px 20px; text-align: center; }
    .header h1 { color: #fff; margin: 0; font-size: 26px; }
    .content { padding: 25px; }
    .badge { display: inline-block; background: ${primary}; color: #fff; padding: 4px 14px; border-radius: 20px; font-size: 13px; font-weight: 600; }
    .section { margin-bottom: 20px; }
    .section-title { color: ${dark}; font-size: 18px; font-weight: 700; border-bottom: 3px solid ${primary}; padding-bottom: 6px; margin-bottom: 12px; }
    .info-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #eee; }
    .info-label { color: #666; font-weight: 600; font-size: 14px; }
    .info-value { color: ${dark}; font-weight: 500; font-size: 14px; text-align: right; }
    .message-box { background: #f1f5f9; padding: 15px; border-radius: 6px; margin: 15px 0; font-style: italic; }
    .footer { background: ${lightBg}; padding: 15px; text-align: center; font-size: 12px; color: #6b7280; border-top: 1px solid #eee; }
    .priority-urgent { background: #fee2e2; color: #dc2626; }
    .priority-high { background: #fef3c7; color: #d97706; }
    .priority-normal { background: #d1fae5; color: #059669; }
    @media (max-width: 480px) {
      .info-row { flex-direction: column; align-items: flex-start; gap: 4px; }
      .info-value { text-align: left; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📩 Inquiry Received</h1>
      <p style="color: rgba(255,255,255,0.9); margin: 0;">We'll get back to you shortly</p>
    </div>
    <div class="content">
      <div style="text-align: center; margin-bottom: 15px;">
        <span class="badge">Reference: ${inquiry.id}</span>
      </div>

      <div class="section">
        <div class="section-title">📋 Inquiry Details</div>
        <div class="info-row"><span class="info-label">Subject</span><span class="info-value">${inquiry.subject}</span></div>
        <div class="info-row"><span class="info-label">Department</span><span class="info-value">${department.name}</span></div>
        <div class="info-row"><span class="info-label">Priority</span><span class="info-value"><span class="priority-${inquiry.priority}" style="padding: 2px 12px; border-radius: 12px; font-weight: 600;">${inquiry.priority.toUpperCase()}</span></span></div>
        <div class="info-row"><span class="info-label">Estimated Response</span><span class="info-value">${getEstimatedResponseTime(inquiry.priority)}</span></div>
      </div>

      <div class="section">
        <div class="section-title">👤 Your Information</div>
        <div class="info-row"><span class="info-label">Name</span><span class="info-value">${inquiry.name}</span></div>
        <div class="info-row"><span class="info-label">Email</span><span class="info-value">${inquiry.email}</span></div>
        ${inquiry.phone ? `<div class="info-row"><span class="info-label">Phone</span><span class="info-value">${inquiry.phone}</span></div>` : ''}
        ${inquiry.company ? `<div class="info-row"><span class="info-label">Company</span><span class="info-value">${inquiry.company}</span></div>` : ''}
      </div>

      <div class="section">
        <div class="section-title">📝 Your Message</div>
        <div class="message-box">${inquiry.message.replace(/\n/g, '<br>')}</div>
      </div>

      <div style="background: #f0f9ff; padding: 15px; border-radius: 6px; border-left: 4px solid #0ea5e9; margin: 20px 0;">
        <p><strong>📌 Our team will contact you:</strong></p>
        <ul style="margin: 8px 0 0; padding-left: 20px;">
          <li>${department.name} — ${department.email}</li>
          <li>Phone: ${department.phone}</li>
        </ul>
      </div>

      <div style="text-align: center; margin: 20px 0;">
        <a href="https://visionwanservices.com" style="display: inline-block; background: ${primary}; color: #fff; padding: 10px 25px; border-radius: 8px; text-decoration: none; font-weight: 600;">Visit Our Website</a>
      </div>
    </div>
    <div class="footer">
      <p>Vision One Services — Executive Support</p>
      <p>© ${new Date().getFullYear()} Vision One Services. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
  `;
};

const generateInternalNotificationTemplate = (inquiry: ContactData, department: any): string => {
  const primary = '#FF6B35';
  const secondary = '#FF8B35';
  const dark = '#1a1a2e';
  const lightBg = '#f8f9fa';

  const priorityColor = {
    urgent: '#dc2626',
    high: '#d97706',
    normal: '#059669',
    low: '#6b7280'
  }[inquiry.priority] || '#6b7280';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Inquiry - ${inquiry.priority.toUpperCase()}</title>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 0; background: ${lightBg}; }
    .container { max-width: 600px; margin: 20px auto; background: #fff; border-radius: 16px; box-shadow: 0 10px 40px rgba(0,0,0,0.08); overflow: hidden; }
    .header { background: ${priorityColor}; padding: 25px; text-align: center; }
    .header h1 { color: #fff; margin: 0; font-size: 24px; }
    .content { padding: 25px; }
    .badge { display: inline-block; background: ${primary}; color: #fff; padding: 4px 14px; border-radius: 20px; font-size: 13px; font-weight: 600; }
    .section { margin-bottom: 20px; }
    .section-title { color: ${dark}; font-size: 18px; font-weight: 700; border-bottom: 2px solid ${primary}; padding-bottom: 6px; margin-bottom: 12px; }
    .info-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #eee; }
    .info-label { color: #666; font-weight: 600; font-size: 14px; }
    .info-value { color: ${dark}; font-weight: 500; font-size: 14px; text-align: right; }
    .message-box { background: #f1f5f9; padding: 15px; border-radius: 6px; margin: 15px 0; }
    .alert-box { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; border-radius: 4px; margin: 20px 0; }
    .footer { background: ${lightBg}; padding: 15px; text-align: center; font-size: 12px; color: #6b7280; border-top: 1px solid #eee; }
    .action-btn { display: inline-block; background: ${primary}; color: #fff; padding: 8px 20px; border-radius: 6px; text-decoration: none; font-weight: 600; margin: 5px; }
    @media (max-width: 480px) {
      .info-row { flex-direction: column; align-items: flex-start; gap: 4px; }
      .info-value { text-align: left; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>⚠️ NEW INQUIRY</h1>
      <p style="color: rgba(255,255,255,0.9); margin: 0;">Priority: ${inquiry.priority.toUpperCase()}</p>
    </div>
    <div class="content">
      <div style="text-align: center; margin-bottom: 15px;">
        <span class="badge">${inquiry.id}</span>
      </div>

      <div class="alert-box">
        <p><strong>Action Required:</strong> New inquiry assigned to ${department.name} team</p>
        <p>Estimated Response: ${getEstimatedResponseTime(inquiry.priority)}</p>
      </div>

      <div class="section">
        <div class="section-title">👤 Customer</div>
        <div class="info-row"><span class="info-label">Name</span><span class="info-value">${inquiry.name}</span></div>
        <div class="info-row"><span class="info-label">Email</span><span class="info-value">${inquiry.email}</span></div>
        ${inquiry.phone ? `<div class="info-row"><span class="info-label">Phone</span><span class="info-value">${inquiry.phone}</span></div>` : ''}
        ${inquiry.company ? `<div class="info-row"><span class="info-label">Company</span><span class="info-value">${inquiry.company}</span></div>` : ''}
      </div>

      <div class="section">
        <div class="section-title">📋 Inquiry</div>
        <div class="info-row"><span class="info-label">Subject</span><span class="info-value">${inquiry.subject}</span></div>
        <div class="info-row"><span class="info-label">Department</span><span class="info-value">${department.name}</span></div>
        <div class="info-row"><span class="info-label">Assigned To</span><span class="info-value">${inquiry.assignedTo}</span></div>
        <div class="info-row"><span class="info-label">Submitted</span><span class="info-value">${new Date(inquiry.submissionDate).toLocaleString()}</span></div>
      </div>

      <div class="section">
        <div class="section-title">📝 Message</div>
        <div class="message-box">${inquiry.message.replace(/\n/g, '<br>')}</div>
      </div>

      <div style="text-align: center; margin: 20px 0;">
        <a href="mailto:${inquiry.email}?subject=Re: ${encodeURIComponent(inquiry.subject)}" class="action-btn">Reply</a>
        ${inquiry.phone ? `<a href="tel:${inquiry.phone}" class="action-btn">Call</a>` : ''}
        <a href="mailto:${department.email}" class="action-btn">Internal Chat</a>
      </div>
    </div>
    <div class="footer">
      <p>Vision One Contact System — Generated ${new Date().toLocaleString()}</p>
    </div>
  </div>
</body>
</html>
  `;
};

// Email sending functions
const sendAcknowledgementEmail = async (inquiry: ContactData) => {
    try {
        const transporter = createTransporter();
        const department = departmentConfig[inquiry.department as keyof typeof departmentConfig];

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
    } catch (error) {
        console.error('Error sending acknowledgement email:', error);
        throw error;
    }
};

const sendInternalNotificationEmail = async (inquiry: ContactData) => {
    try {
        const transporter = createTransporter();
        const department = departmentConfig[inquiry.department as keyof typeof departmentConfig];

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
    } catch (error) {
        console.error('Error sending internal notification email:', error);
        throw error;
    }
};

// Controller functions
export const createContactInquiry = async (req: Request, res: Response) => {
    try {
        const {
            name,
            email,
            phone,
            company,
            subject,
            message,
            department
        } = req.body;

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
        if (!departmentConfig[department as keyof typeof departmentConfig]) {
            return res.status(400).json({
                error: 'Invalid department specified. Valid departments: general, booking, corporate, support'
            });
        }

        // Determine priority based on subject/keywords
        const priority = determinePriority(subject, message, department);

        // Create contact inquiry
        const contactInquiry: ContactData = {
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

    } catch (error) {
        console.error('Contact inquiry error:', error);
        res.status(500).json({
            error: 'Failed to process contact inquiry',
            details: process.env.NODE_ENV === 'development' ? error : undefined
        });
    }
};

export const getContactInquiries = async (req: Request, res: Response) => {
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
            if (priorityDiff !== 0) return priorityDiff;
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
    } catch (error) {
        console.error('Get inquiries error:', error);
        res.status(500).json({ error: 'Failed to retrieve contact inquiries' });
    }
};

export const updateInquiryStatus = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { status, notes, assignedTo } = req.body;

        const inquiry = contactInquiries.find(i => i.id === id);
        if (!inquiry) {
            return res.status(404).json({ error: 'Inquiry not found' });
        }

        // Validate status
        const validStatuses: ContactData['status'][] = ['new', 'in-progress', 'resolved', 'archived'];
        if (status && !validStatuses.includes(status)) {
            return res.status(400).json({ error: 'Invalid status value' });
        }

        // Update inquiry
        inquiry.status = status || inquiry.status;
        if (assignedTo) inquiry.assignedTo = assignedTo;

        res.json({
            message: 'Inquiry status updated successfully',
            inquiry
        });
    } catch (error) {
        console.error('Update inquiry error:', error);
        res.status(500).json({ error: 'Failed to update inquiry status' });
    }
};

export const getInquiryStats = async (req: Request, res: Response) => {
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
    } catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({ error: 'Failed to retrieve inquiry statistics' });
    }
};

export const contactController = {
    createContactInquiry,
    getContactInquiries,
    updateInquiryStatus,
    getInquiryStats
};