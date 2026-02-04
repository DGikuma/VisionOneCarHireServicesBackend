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
} as const;

// Email transporter configuration
const createTransporter = () => {
    if (!process.env.EMAIL_HOST || !process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        throw new Error('Missing email configuration in environment variables');
    }

    return nodemailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: Number(process.env.EMAIL_PORT || '587'),
        secure: process.env.EMAIL_SECURE === 'true', // false = STARTTLS
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 10000
    });
};

// -----------------------------
// Priority / Assignee Helpers
// -----------------------------
const determinePriority = (subject: string, message: string, department: string): ContactData['priority'] => {
    const urgentKeywords = ['urgent', 'emergency', 'immediately', 'asap', 'critical', 'broken down', 'accident', 'stranded'];
    const highKeywords = ['important', 'priority', 'corporate', 'business', 'enterprise', 'partnership', 'executive', 'ceo'];

    const text = (subject + ' ' + message).toLowerCase();

    if (urgentKeywords.some(keyword => text.includes(keyword)) || department === 'support') return 'urgent';
    if (highKeywords.some(keyword => text.includes(keyword)) || department === 'corporate') return 'high';
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

// -----------------------------
// Email Templates
// -----------------------------
const generateAcknowledgementTemplate = (inquiry: ContactData, department: any): string => {
    return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"><title>Inquiry Received</title></head>
    <body>
        <p>Dear ${inquiry.name},</p>
        <p>Your inquiry has been received by our ${department.name} team. Reference ID: <strong>${inquiry.id}</strong></p>
        <p>Estimated response: <strong>${getEstimatedResponseTime(inquiry.priority)}</strong></p>
        <p>We will contact you shortly.</p>
        <p>Vision Wan Services</p>
    </body>
    </html>`;
};

const generateInternalNotificationTemplate = (inquiry: ContactData, department: any): string => {
    return `
    <html>
        <body>
            <h2>New Inquiry - ${inquiry.priority.toUpperCase()}</h2>
            <p>Department: ${department.name}</p>
            <p>Customer: ${inquiry.name} (${inquiry.email})</p>
            <p>Subject: ${inquiry.subject}</p>
            <p>Message: ${inquiry.message}</p>
            <p>Reference ID: ${inquiry.id}</p>
        </body>
    </html>`;
};

// -----------------------------
// Email Senders
// -----------------------------
const sendAcknowledgementEmail = async (inquiry: ContactData) => {
    const transporter = createTransporter();
    const department = departmentConfig[inquiry.department as keyof typeof departmentConfig];

    await transporter.sendMail({
        from: `"Vision Wan Services Support" <${process.env.EMAIL_FROM}>`,
        to: inquiry.email,
        subject: `We've received your inquiry: ${inquiry.subject}`,
        html: generateAcknowledgementTemplate(inquiry, department),
        replyTo: department.email
    });

    console.log(`✅ Acknowledgement sent to ${inquiry.email}`);
};

const sendInternalNotificationEmail = async (inquiry: ContactData) => {
    const transporter = createTransporter();
    const department = departmentConfig[inquiry.department as keyof typeof departmentConfig];

    await transporter.sendMail({
        from: `"Vision Wan Contact System" <${process.env.EMAIL_FROM}>`,
        to: department.email,
        subject: `🚨 New ${inquiry.priority.toUpperCase()} Inquiry: ${inquiry.subject}`,
        html: generateInternalNotificationTemplate(inquiry, department),
        cc: process.env.EMAIL_ADMIN
    });

    console.log(`✅ Internal notification sent for inquiry ${inquiry.id}`);
};

// -----------------------------
// Controller Functions
// -----------------------------
export const createContactInquiry = async (req: Request, res: Response) => {
    try {
        const { name, email, phone, company, subject, message, department } = req.body;

        if (!name || !email || !subject || !message || !department) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ error: 'Invalid email format' });
        }

        if (!departmentConfig[department as keyof typeof departmentConfig]) {
            return res.status(400).json({ error: 'Invalid department' });
        }

        const priority = determinePriority(subject, message, department);

        const inquiry: ContactData = {
            id: `CONTACT-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
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

        contactInquiries.push(inquiry);
        console.log(`📥 Inquiry stored: ${inquiry.id}`);

        // Respond immediately
        res.status(201).json({
            message: 'Contact inquiry submitted successfully',
            inquiry: {
                id: inquiry.id,
                name: inquiry.name,
                email: inquiry.email,
                subject: inquiry.subject,
                department: inquiry.department,
                priority: inquiry.priority,
                estimatedResponseTime: getEstimatedResponseTime(inquiry.priority),
                submissionDate: inquiry.submissionDate
            }
        });

        // Send emails asynchronously (non-blocking)
        setTimeout(async () => {
            try {
                await Promise.allSettled([
                    sendAcknowledgementEmail(inquiry),
                    sendInternalNotificationEmail(inquiry)
                ]);
                console.log(`📧 Emails processed for inquiry ${inquiry.id}`);
            } catch (emailError) {
                console.error(`❌ Email processing failed for inquiry ${inquiry.id}`, emailError);
            }
        }, 0);

    } catch (error) {
        console.error('❌ Contact inquiry error:', error);
        res.status(500).json({ error: 'Failed to process inquiry' });
    }
};

// Other controllers remain unchanged
export const getContactInquiries = async (req: Request, res: Response) => { /* ... */ };
export const updateInquiryStatus = async (req: Request, res: Response) => { /* ... */ };
export const getInquiryStats = async (req: Request, res: Response) => { /* ... */ };

export const contactController = {
    createContactInquiry,
    getContactInquiries,
    updateInquiryStatus,
    getInquiryStats
};
