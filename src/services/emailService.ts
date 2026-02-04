import { Resend } from 'resend';

// Initialize Resend client
const resend = new Resend(process.env.RESEND_API_KEY);

// Email interfaces
export interface EmailAttachment {
    filename: string;
    content?: Buffer | string;
    path?: string;
}

export interface EmailOptions {
    from: string;
    to: string | string[];
    subject: string;
    html: string;
    attachments?: EmailAttachment[];
    cc?: string | string[];
    bcc?: string | string[];
    replyTo?: string;
    tags?: { name: string; value: string }[];
}

export interface EmailResponse {
    success: boolean;
    data?: {
        id?: string;
        [key: string]: any;
    };
    error?: string;
}

// Helper functions for date formatting
const formatDate = (dateStr?: string | null, fallback = 'N/A'): string => {
    if (!dateStr) return fallback;
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? fallback : date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
};

const formatDateTime = (dateStr?: string | null, fallback = 'N/A'): string => {
    if (!dateStr) return fallback;
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? fallback : date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
};

class EmailService {
    private senderName = 'Vision Wan Services';

    /**
     * Send email using Resend
     */
    async sendEmail(options: EmailOptions): Promise<EmailResponse> {
        try {
            // Prepare attachments for Resend
            const attachments = options.attachments?.map(attachment => ({
                filename: attachment.filename,
                content: attachment.content as string | Buffer | undefined,
            })) || [];

            const emailData: any = {
                from: options.from,
                to: options.to,
                subject: options.subject,
                html: options.html,
                attachments: attachments,
                cc: options.cc,
                bcc: options.bcc,
                tags: options.tags,
            };

            // Add reply_to only if it exists
            if (options.replyTo) {
                emailData.reply_to = options.replyTo;
            }

            const { data, error } = await resend.emails.send(emailData);

            if (error) {
                console.error('❌ Email sending failed:', error);
                return {
                    success: false,
                    error: error.message || 'Failed to send email'
                };
            }

            console.log(`📧 Email sent successfully`);
            return {
                success: true,
                data: {
                    ...data,
                    id: data?.id || `email-${Date.now()}`
                }
            };
        } catch (error: any) {
            console.error('❌ Email sending failed with exception:', error);
            return {
                success: false,
                error: error?.message || 'Unknown email error'
            };
        }
    }

    /**
     * Send booking confirmation to customer
     */
    async sendBookingConfirmation(
        to: string,
        booking: any,
        pdfBuffer: Buffer,
        zipBuffer?: Buffer
    ): Promise<EmailResponse> {
        const attachments: EmailAttachment[] = [
            {
                filename: `booking-confirmation-${booking.id}.pdf`,
                content: pdfBuffer,
            }
        ];

        if (zipBuffer) {
            attachments.push({
                filename: `${booking.idNumber}_your_documents.zip`,
                content: zipBuffer,
            });
        }

        return this.sendEmail({
            from: process.env.RESEND_FROM_EMAIL || 'Vision Wan Services <onboarding@resend.dev>',
            to,
            subject: `✅ Booking Confirmed: ${booking.id} - Vision Wan Services`,
            html: this.generateBookingEmailTemplate(booking),
            attachments,
            tags: [
                { name: 'category', value: 'booking_confirmation' },
                { name: 'booking_id', value: booking.id }
            ]
        });
    }

    /**
     * Send admin notification
     */
    async sendAdminNotification(
        booking: any,
        zipBuffer?: Buffer
    ): Promise<EmailResponse> {
        const attachments: EmailAttachment[] = [];

        if (zipBuffer) {
            attachments.push({
                filename: `${booking.idNumber}_documents.zip`,
                content: zipBuffer,
            });
        }

        const adminEmail = process.env.ADMIN_EMAIL || 'info.bluevisionrealtors@gmail.com';

        return this.sendEmail({
            from: process.env.RESEND_FROM_EMAIL || 'Vision Wan Services <onboarding@resend.dev>',
            to: adminEmail,
            subject: `📋 NEW BOOKING: ${booking.carType} - ${booking.customerName} (${booking.idNumber})`,
            html: this.generateAdminNotificationTemplate(booking),
            attachments,
            tags: [
                { name: 'category', value: 'admin_notification' },
                { name: 'priority', value: 'high' },
                { name: 'booking_id', value: booking.id }
            ]
        });
    }

    /**
     * Send contact inquiry acknowledgement
     */
    async sendContactAcknowledgement(
        inquiry: any,
        department: any
    ): Promise<EmailResponse> {
        return this.sendEmail({
            from: process.env.RESEND_FROM_EMAIL || 'Vision Wan Services <onboarding@resend.dev>',
            to: inquiry.email,
            subject: `We've received your inquiry: ${inquiry.subject}`,
            html: this.generateContactAcknowledgementTemplate(inquiry, department),
            replyTo: department.email,
            tags: [
                { name: 'category', value: 'contact_acknowledgement' },
                { name: 'department', value: inquiry.department }
            ]
        });
    }

    /**
     * Send internal notification for contact inquiry
     */
    async sendInternalContactNotification(
        inquiry: any,
        department: any
    ): Promise<EmailResponse> {
        const adminEmail = process.env.ADMIN_EMAIL || 'info.bluevisionrealtors@gmail.com';
        const departmentEmail = department.email || adminEmail;

        return this.sendEmail({
            from: process.env.RESEND_FROM_EMAIL || 'Vision Wan Services <onboarding@resend.dev>',
            to: departmentEmail,
            cc: adminEmail,
            subject: `🚨 New ${inquiry.priority.toUpperCase()} Inquiry: ${inquiry.subject}`,
            html: this.generateInternalNotificationTemplate(inquiry, department),
            tags: [
                { name: 'category', value: 'internal_notification' },
                { name: 'priority', value: inquiry.priority },
                { name: 'department', value: inquiry.department }
            ]
        });
    }

    /**
     * Generate booking email template
     */
    private generateBookingEmailTemplate(booking: any): string {
        return `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 0 auto; background: #ffffff; }
            .header { background: #FF6B35; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; }
            .booking-details { background: #f7fafc; padding: 20px; border-radius: 5px; margin: 20px 0; }
            .document-status { background: #e8f4fd; padding: 15px; border-radius: 5px; margin: 20px 0; }
            .footer { background: #edf2f7; padding: 15px; text-align: center; font-size: 12px; }
            table { width: 100%; border-collapse: collapse; }
            td { padding: 10px; border-bottom: 1px solid #ddd; }
            .status-ok { color: #27ae60; }
            .status-pending { color: #f39c12; }
            .next-steps { background: #fff8e1; padding: 15px; border-radius: 5px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
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
                  <tr>
                    <td><strong>Deposit Proof:</strong></td>
                    <td>
                      ${booking.depositProofPath
                ? '<span class="status-ok">✓ Uploaded</span>'
                : '<span class="status-pending">⏳ Pending</span>'}
                    </td>
                  </tr>
                </table>
              </div>
              
              <div class="next-steps">
                <h4>📋 What's Next:</h4>
                <ol>
                  <li>Your booking confirmation PDF is attached.</li>
                  <li>All your uploaded documents are included in the ZIP file (if any).</li>
                  <li>Please bring your original documents for verification at pickup.</li>
                  <li>Present your deposit proof receipt when collecting the vehicle.</li>
                  <li>Arrive 15 minutes before your scheduled pickup time.</li>
                </ol>
              </div>
              
              <p><strong>Deposit Information:</strong><br/>
              Your security deposit has been recorded. Please bring the proof of payment when picking up the vehicle.</p>
              
              <p>Safe travels,<br><strong>The Vision Wan Services Team</strong></p>
            </div>
            
            <div class="footer">
              <p><strong>Vision Wan Services</strong><br>
              Kenya: +254 (705) 336 311 | UK: +44 (7397) 549 590<br>
              Email: vision1servicesltd@gmail.com</p>
              <p style="font-size: 11px; color: #666;">
                This email contains confidential information. If you received this email in error, please delete it immediately.
              </p>
              <p>© ${new Date().getFullYear()} Vision Wan Services. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
        `;
    }

    /**
     * Generate admin notification template
     */
    private generateAdminNotificationTemplate(booking: any): string {
        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
                .container { max-width: 600px; margin: 0 auto; background: #ffffff; }
                .header { background: #FF6B35; color: white; padding: 20px; text-align: center; }
                .content { padding: 20px; }
                .booking-details { background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #FF6B35; }
                table { width: 100%; border-collapse: collapse; }
                td { padding: 10px; border-bottom: 1px solid #eee; }
                .alert { background: #fff3cd; border: 1px solid #ffc107; padding: 15px; border-radius: 5px; margin: 20px 0; }
                .footer { background: #f8f9fa; padding: 15px; text-align: center; font-size: 12px; color: #666; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Vision Wan Services</h1>
                    <h2>🚗 NEW CAR BOOKING REQUEST</h2>
                </div>
                
                <div class="content">
                    <div class="alert">
                        <h3 style="margin-top: 0; color: #d35400;">ACTION REQUIRED</h3>
                        <p>Process security deposit and verify customer documents</p>
                    </div>
                    
                    <div class="booking-details">
                        <h3 style="color: #333; border-bottom: 2px solid #FF6B35; padding-bottom: 10px;">Booking Details</h3>
                        <table>
                            <tr><td><strong>Booking ID:</strong></td><td>${booking.id}</td></tr>
                            <tr><td><strong>Customer:</strong></td><td>${booking.customerName}</td></tr>
                            <tr><td><strong>${booking.idType === 'passport' ? 'Passport No:' : 'ID Number:'}</strong></td><td>${booking.idNumber}</td></tr>
                            <tr><td><strong>Email:</strong></td><td>${booking.email}</td></tr>
                            <tr><td><strong>Phone:</strong></td><td>${booking.phone || 'N/A'}</td></tr>
                            <tr><td><strong>Vehicle:</strong></td><td>${booking.carType}</td></tr>
                            <tr><td><strong>Pickup:</strong></td><td>${formatDate(booking.pickupDate)} at ${booking.pickupLocation}</td></tr>
                            <tr><td><strong>Return:</strong></td><td>${formatDate(booking.returnDate)}</td></tr>
                            <tr><td><strong>Deposit Proof:</strong></td><td>${booking.depositProofPath ? '✅ Uploaded' : '❌ Missing'}</td></tr>
                            <tr><td><strong>Documents:</strong></td><td>${booking.idDocumentPath && booking.drivingLicensePath ? '✅ Attached as ZIP' : '❌ No documents uploaded'}</td></tr>
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
                </div>
                
                <div class="footer">
                    <p>Vision Wan Services Booking System</p>
                    <p>Generated: ${new Date().toLocaleString()}</p>
                </div>
            </div>
        </body>
        </html>
        `;
    }

    /**
     * Generate contact acknowledgement template
     */
    private generateContactAcknowledgementTemplate(inquiry: any, department: any): string {
        // Helper function for estimated response time
        const getEstimatedResponseTime = (priority: string): string => {
            const responseTimes: Record<string, string> = {
                urgent: 'Within 30 minutes',
                high: 'Within 2 hours',
                normal: 'Within 4 business hours',
                low: 'Within 24 hours'
            };
            return responseTimes[priority] || 'Within 4 business hours';
        };

        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Vision Wan Services - Inquiry Received</title>
            <style>
                body { font-family: 'Arial', sans-serif; line-height: 1.6; color: the color of the text; margin: 0; padding: 0; }
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
    }

    /**
     * Generate internal notification template
     */
    private generateInternalNotificationTemplate(inquiry: any, department: any): string {
        // Helper function for estimated response time
        const getEstimatedResponseTime = (priority: string): string => {
            const responseTimes: Record<string, string> = {
                urgent: 'Within 30 minutes',
                high: 'Within 2 hours',
                normal: 'Within 4 business hours',
                low: 'Within 24 hours'
            };
            return responseTimes[priority] || 'Within 4 business hours';
        };

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
                    <p><strong>Assigned To:</strong> ${inquiry.assignedTo || 'Not assigned'}</p>
                    
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
    }

    /**
     * Send email with retry logic
     */
    async sendWithRetry(
        emailFn: () => Promise<EmailResponse>,
        maxRetries = 3
    ): Promise<EmailResponse> {
        let lastError: Error | null = null;

        for (let i = 0; i < maxRetries; i++) {
            try {
                const result = await emailFn();
                if (result.success) return result;
                lastError = new Error(result.error || 'Unknown error');
            } catch (error: any) {
                lastError = error instanceof Error ? error : new Error('Unknown error');
            }

            if (i < maxRetries - 1) {
                // Exponential backoff
                await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, i)));
            }
        }

        return {
            success: false,
            error: `Failed after ${maxRetries} retries: ${lastError?.message || 'No error details'}`
        };
    }
}

// Export singleton instance
export const emailService = new EmailService();

// Export template functions for backward compatibility
export const generateEmailTemplate = (booking: any): string => {
    const service = new EmailService();
    // Use bracket notation to access private method
    return (service as any).generateBookingEmailTemplate(booking);
};

export const generateAdminNotificationTemplate = (booking: any): string => {
    const service = new EmailService();
    return (service as any).generateAdminNotificationTemplate(booking);
};

export const generateAcknowledgementTemplate = (inquiry: any, department: any): string => {
    const service = new EmailService();
    return (service as any).generateContactAcknowledgementTemplate(inquiry, department);
};

export const generateInternalNotificationTemplate = (inquiry: any, department: any): string => {
    const service = new EmailService();
    return (service as any).generateInternalNotificationTemplate(inquiry, department);
};