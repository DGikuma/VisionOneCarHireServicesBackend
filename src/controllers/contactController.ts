// src/controllers/contactController.ts
import { Request, Response } from 'express';
import { Resend } from 'resend';

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

// Initialize Resend client
const resend = new Resend(process.env.RESEND_API_KEY);

// Department configuration
const departmentConfig = {
    general: {
        name: 'Executive Office',
        email: process.env.DEPARTMENT_GENERAL_EMAIL || 'vision1servicesltd@gmail.com',
        phone: '+254 (705) 336 311',
        priority: 'normal'
    },
    booking: {
        name: 'Premium Reservations',
        email: process.env.DEPARTMENT_BOOKING_EMAIL || 'vision1servicesltd@gmail.com',
        phone: '+254 (705) 336 311',
        priority: 'normal'
    },
    corporate: {
        name: 'Corporate Services',
        email: process.env.DEPARTMENT_CORPORATE_EMAIL || 'vision1servicesltd@gmail.com',
        phone: '+254 (705) 336 311',
        priority: 'high'
    },
    support: {
        name: 'Premium Support',
        email: process.env.DEPARTMENT_SUPPORT_EMAIL || 'vision1servicesltd@gmail.com',
        phone: '+254 (705) 336 311',
        priority: 'urgent'
    }
} as const;

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

const formatDateTime = (dateStr: string): string => {
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? 'N/A' : date.toLocaleString();
};

// Email template generators
const generateAcknowledgementTemplate = (inquiry: ContactData, department: any): string => {
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Vision Wan Services - Inquiry Received</title>
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
                <h1>Vision Wan Services</h1>
                <h2>Inquiry Received</h2>
            </div>
            
            <div class="content">
                <p>Dear ${inquiry.name},</p>
                
                <p>Thank you for contacting Vision Wan Services. Your inquiry has been received and is being processed by our ${department.name} team.</p>
                
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
                
                <p>Best regards,<br><strong>The Vision Wan Services Team</strong></p>
            </div>
            
            <div class="footer">
                <p>Vision Wan Services Ltd<br>
                Executive Support: ${department.phone} | Email: ${department.email}</p>
                <p>© ${new Date().getFullYear()} Vision Wan Services. All rights reserved.</p>
                <p style="font-size: 10px; margin-top: 10px;">This is an automated message. Please do not reply to this email.</p>
            </div>
        </div>
    </body>
    </html>
    `;
};

const generateInternalNotificationTemplate = (inquiry: ContactData, department: any): string => {
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
                <p><strong>Submitted:</strong> ${formatDateTime(inquiry.submissionDate)}</p>
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
                <p>Vision Wan Contact Management System</p>
                <p>Generated: ${new Date().toLocaleString()}</p>
            </div>
        </div>
    </body>
    </html>
    `;
};

// Email sending functions using Resend
const sendAcknowledgementEmail = async (inquiry: ContactData) => {
    try {
        if (!process.env.RESEND_API_KEY) {
            throw new Error('RESEND_API_KEY is not configured');
        }

        const department = departmentConfig[inquiry.department as keyof typeof departmentConfig];
        const fromEmail = process.env.RESEND_FROM_EMAIL || 'Vision Wan Services <support@visionwanservices.com>';

        const { data, error } = await resend.emails.send({
            from: fromEmail,
            to: inquiry.email,
            subject: `We've received your inquiry: ${inquiry.subject}`,
            html: generateAcknowledgementTemplate(inquiry, department),
            replyTo: department.email,
            tags: [
                { name: 'category', value: 'contact_acknowledgement' },
                { name: 'department', value: inquiry.department },
                { name: 'priority', value: inquiry.priority }
            ]
        });

        if (error) {
            throw new Error(`Resend error: ${error.message}`);
        }

        console.log(`Acknowledgement email sent to ${inquiry.email}: ${data?.id}`);
        return data;
    } catch (error) {
        console.error('Error sending acknowledgement email:', error);
        throw error;
    }
};

const sendInternalNotificationEmail = async (inquiry: ContactData) => {
    try {
        if (!process.env.RESEND_API_KEY) {
            throw new Error('RESEND_API_KEY is not configured');
        }

        const department = departmentConfig[inquiry.department as keyof typeof departmentConfig];
        const fromEmail = process.env.RESEND_FROM_EMAIL || 'Vision Wan Services <system@visionwanservices.com>';
        const adminEmail = process.env.ADMIN_EMAIL || 'vision1servicesltd@gmail.com';

        // Get the department email, fallback to admin email
        const toEmail = department.email || adminEmail;

        const { data, error } = await resend.emails.send({
            from: fromEmail,
            to: toEmail,
            cc: adminEmail,
            subject: `🚨 New ${inquiry.priority.toUpperCase()} Inquiry: ${inquiry.subject}`,
            html: generateInternalNotificationTemplate(inquiry, department),
            tags: [
                { name: 'category', value: 'internal_notification' },
                { name: 'department', value: inquiry.department },
                { name: 'priority', value: inquiry.priority },
                { name: 'inquiry_id', value: inquiry.id }
            ]
        });

        if (error) {
            throw new Error(`Resend error: ${error.message}`);
        }

        console.log(`Internal notification email sent: ${data?.id}`);
        return data;
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
            success: true,
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
            success: false,
            error: 'Failed to process contact inquiry',
            details: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
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
            success: true,
            count: filteredInquiries.length,
            inquiries: filteredInquiries.map(inquiry => ({
                id: inquiry.id,
                name: inquiry.name,
                email: inquiry.email,
                phone: inquiry.phone,
                company: inquiry.company,
                subject: inquiry.subject,
                department: inquiry.department,
                status: inquiry.status,
                priority: inquiry.priority,
                submissionDate: inquiry.submissionDate,
                assignedTo: inquiry.assignedTo
            }))
        });
    } catch (error) {
        console.error('Get inquiries error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve contact inquiries'
        });
    }
};

export const updateInquiryStatus = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { status, assignedTo } = req.body;

        const inquiry = contactInquiries.find(i => i.id === id);
        if (!inquiry) {
            return res.status(404).json({
                success: false,
                error: 'Inquiry not found'
            });
        }

        // Validate status
        const validStatuses: ContactData['status'][] = ['new', 'in-progress', 'resolved', 'archived'];
        if (status && !validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid status value. Valid values: new, in-progress, resolved, archived'
            });
        }

        // Update inquiry
        if (status) inquiry.status = status;
        if (assignedTo) inquiry.assignedTo = assignedTo;

        res.json({
            success: true,
            message: 'Inquiry status updated successfully',
            inquiry: {
                id: inquiry.id,
                status: inquiry.status,
                assignedTo: inquiry.assignedTo,
                updatedAt: new Date().toISOString()
            }
        });
    } catch (error) {
        console.error('Update inquiry error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update inquiry status'
        });
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
            },
            recentInquiries: contactInquiries
                .sort((a, b) => new Date(b.submissionDate).getTime() - new Date(a.submissionDate).getTime())
                .slice(0, 5)
                .map(inquiry => ({
                    id: inquiry.id,
                    name: inquiry.name,
                    subject: inquiry.subject,
                    department: inquiry.department,
                    status: inquiry.status,
                    priority: inquiry.priority,
                    submissionDate: inquiry.submissionDate
                }))
        };

        res.json({
            success: true,
            stats
        });
    } catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve inquiry statistics'
        });
    }
};

export const getInquiryById = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const inquiry = contactInquiries.find(i => i.id === id);
        if (!inquiry) {
            return res.status(404).json({
                success: false,
                error: 'Inquiry not found'
            });
        }

        res.json({
            success: true,
            inquiry
        });
    } catch (error) {
        console.error('Get inquiry by ID error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve inquiry'
        });
    }
};

export const resendInquiryEmails = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const inquiry = contactInquiries.find(i => i.id === id);
        if (!inquiry) {
            return res.status(404).json({
                success: false,
                error: 'Inquiry not found'
            });
        }

        // Get department config
        const department = departmentConfig[inquiry.department as keyof typeof departmentConfig];

        // Resend both emails
        const [ackResult, internalResult] = await Promise.allSettled([
            sendAcknowledgementEmail(inquiry),
            sendInternalNotificationEmail(inquiry)
        ]);

        const results = {
            acknowledgement: ackResult.status === 'fulfilled' ? 'sent' : 'failed',
            internalNotification: internalResult.status === 'fulfilled' ? 'sent' : 'failed'
        };

        res.json({
            success: true,
            message: 'Emails resent successfully',
            results
        });
    } catch (error) {
        console.error('Resend emails error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to resend emails'
        });
    }
};

export const contactController = {
    createContactInquiry,
    getContactInquiries,
    getInquiryById,
    updateInquiryStatus,
    getInquiryStats,
    resendInquiryEmails
};