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

const LOGO_PATH = path.resolve(__dirname, '../assets/logo.png');

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
        // Get files from multer - using any[] because we're using .any()
        const files = req.files as any[];

        console.log('📁 Files received:', files?.length || 0);
        if (files && files.length > 0) {
            files.forEach((file, index) => {
                console.log(`   File ${index + 1}: ${file.fieldname} - ${file.originalname} (${file.mimetype})`);
            });
        }

        // Helper to find file by field name (supports both naming conventions)
        const findFile = (fieldNames: string[]) => {
            if (!files || !Array.isArray(files)) return undefined;
            for (const fieldName of fieldNames) {
                const file = files.find(f => f.fieldname === fieldName);
                if (file) return file;
            }
            return undefined;
        };

        // ✅ FIXED: All estimate fields are now part of the object literal
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
            nationality: req.body.nationality || '',
            idNumber: req.body.idNumber,
            idType: req.body.idType,
            termsAccepted: req.body.termsAccepted === 'true' || req.body.termsAccepted === true,

            // ✅ NEW: Estimate fields from frontend
            periodCategory: req.body.periodCategory || undefined,
            dailyRate: req.body.dailyRate ? Number(req.body.dailyRate) : undefined,
            estimatedTotal: req.body.estimatedTotal ? Number(req.body.estimatedTotal) : undefined,
            rentalDays: req.body.rentalDays ? Number(req.body.rentalDays) : undefined,
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

        // Find files using both possible field names
        const idDocFile = findFile(['idDocument', 'idDoc']);
        const drivingLicenseFile = findFile(['drivingLicense', 'drivingLicence']);
        const depositProofFile = findFile(['depositProof']);

        const bookingWithId: BookingData = {
            ...bookingData,
            id: bookingId,
            bookingDate: new Date().toISOString(),
            status,
            idDocumentPath: idDocFile?.path,
            drivingLicensePath: drivingLicenseFile?.path,
            depositProofPath: depositProofFile?.path
        };

        bookings.push(bookingWithId);

        console.log(`📝 New booking created: ${bookingId} for ${bookingData.customerName}`);
        console.log(`📁 Documents uploaded:`, {
            idDocument: !!idDocFile,
            drivingLicense: !!drivingLicenseFile,
            depositProof: !!depositProofFile
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
                nationality: bookingData.nationality,
                pickupDate: formatDate(bookingData.pickupDate),
                returnDate: formatDate(bookingData.returnDate),
                carType: bookingData.carType,
                pickupLocation: bookingData.pickupLocation,
                idNumber: bookingData.idNumber,
                idType: bookingData.idType,
                status,
                periodCategory: bookingData.periodCategory,
                dailyRate: bookingData.dailyRate,
                estimatedTotal: bookingData.estimatedTotal,
                rentalDays: bookingData.rentalDays,
                bookingDate: formatDateTime(bookingWithId.bookingDate),
                hasDocuments: {
                    idDocument: !!idDocFile,
                    drivingLicense: !!drivingLicenseFile,
                    depositProof: !!depositProofFile
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
   Enhanced PDF Generation — Corporate Grade
--------------------------------*/
const generateBookingPDF = (booking: BookingData): Promise<Buffer> => {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({
            size: 'A4',
            margin: 50,
            bufferPages: true,
            info: {
                Title: `Booking Confirmation — ${booking.id}`,
                Author: 'Vision One Services',
                Subject: 'Vehicle Rental Booking Confirmation',
                Creator: 'Vision One Services Booking System',
            },
        });

        const buffers: Buffer[] = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('error', reject);
        doc.on('end', () => resolve(Buffer.concat(buffers)));

        // ============================================================
        // COLOR PALETTE
        // ============================================================
        const PRIMARY = '#FF6B35';
        const SECONDARY = '#FF8B35';
        const DARK = '#1a1a2e';
        const MUTED = '#6b7280';
        const LIGHT_BG = '#f8f9fa';
        const BORDER = '#e5e7eb';
        const SUCCESS = '#10b981';
        const DANGER = '#dc2626';

        const pageWidth = doc.page.width;
        const pageHeight = doc.page.height;
        const margin = 50;
        const contentWidth = pageWidth - margin * 2;

        // ============================================================
        // HEADER BAND (gradient-like effect using two rectangles)
        // ============================================================
        const headerHeight = 140;
        doc.rect(0, 0, pageWidth, headerHeight).fill(PRIMARY);
        doc.rect(pageWidth * 0.5, 0, pageWidth * 0.5, headerHeight).fill(SECONDARY);

        // ✅ Divider moved further right (was 0.58) so the left block has more room
        const dividerX = pageWidth * 0.62;
        doc.moveTo(dividerX, 24)
            .lineTo(dividerX, headerHeight - 24)
            .lineWidth(1)
            .strokeColor('rgba(255,255,255,0.35)')
            .stroke();

        // Logo (white circle with border)
        const logoSize = 65;
        const logoX = margin + 5;
        const logoY = (headerHeight - logoSize) / 2 + 4;

        doc.circle(logoX + logoSize / 2, logoY + logoSize / 2, logoSize / 2 + 3)
            .lineWidth(2.5).strokeColor('#ffffff').stroke();

        if (fs.existsSync(LOGO_PATH)) {
            try {
                doc.image(LOGO_PATH, logoX, logoY, {
                    width: logoSize,
                    height: logoSize,
                    align: 'center',
                    valign: 'center',
                });
            } catch (err) {
                console.error('Failed to add logo to PDF:', err);
            }
        }

        // ✅ LEFT SIDE: Company info — wider block, smaller fonts
        const leftBlockX = logoX + logoSize + 15;
        const leftBlockWidth = dividerX - leftBlockX - 15;

        doc.fillColor('#ffffff')
            .fontSize(18)
            .font('Helvetica-Bold')
            .text('Vision One Services', leftBlockX, logoY + 4, {
                width: leftBlockWidth,
                lineBreak: false,
            });

        doc.fontSize(9)
            .font('Helvetica')
            .fillColor('rgba(255,255,255,0.95)')
            .text('Premium Vehicle Rental & Mobility Solutions', leftBlockX, logoY + 30, {
                width: leftBlockWidth,
                lineBreak: false,
            });

        doc.fontSize(8)
            .fillColor('rgba(255,255,255,0.85)')
            .text('Kenya: +254 705 336 311', leftBlockX, logoY + 48, {
                width: leftBlockWidth,
                lineBreak: false,
            });

        doc.fontSize(8)
            .fillColor('rgba(255,255,255,0.85)')
            .text('UK: +44 7397 549 590', leftBlockX, logoY + 60, {
                width: leftBlockWidth,
                lineBreak: false,
            });

        // ✅ RIGHT SIDE: Document title block — starts after the divider
        const rightBlockX = dividerX + 15;
        const rightBlockWidth = pageWidth - rightBlockX - margin;

        doc.fillColor('#ffffff')
            .fontSize(13)
            .font('Helvetica-Bold')
            .text('BOOKING CONFIRMATION', rightBlockX, logoY + 14, {
                align: 'right',
                width: rightBlockWidth,
            });

        doc.fontSize(9)
            .font('Helvetica')
            .fillColor('rgba(255,255,255,0.95)')
            .text(`Booking ID: ${booking.id}`, rightBlockX, logoY + 36, {
                align: 'right',
                width: rightBlockWidth,
            });

        doc.text(`Issued: ${formatDateTime(booking.bookingDate)}`, rightBlockX, logoY + 50, {
            align: 'right',
            width: rightBlockWidth,
        });

        // Start content below the header
        let y = headerHeight + 30;

        // ============================================================
        // HELPER: Section header with underline accent
        // ============================================================
        const sectionHeader = (title: string) => {
            // Check for page break
            if (y > pageHeight - 120) {
                doc.addPage();
                y = margin;
            }

            doc.fillColor(PRIMARY)
                .fontSize(13)
                .font('Helvetica-Bold')
                .text(title.toUpperCase(), margin, y);

            // Underline accent
            doc.moveTo(margin, y + 18)
                .lineTo(margin + contentWidth, y + 18)
                .lineWidth(1)
                .strokeColor(BORDER)
                .stroke();

            // Small colored accent under the title
            doc.moveTo(margin, y + 18)
                .lineTo(margin + 60, y + 18)
                .lineWidth(2)
                .strokeColor(PRIMARY)
                .stroke();

            y += 32;
        };

        // ============================================================
        // HELPER: Info row (label left, value right)
        // ============================================================
        const infoRow = (label: string, value: string, options?: { highlight?: boolean }) => {
            if (y > pageHeight - 70) {
                doc.addPage();
                y = margin;
            }

            doc.fontSize(10)
                .font('Helvetica-Bold')
                .fillColor(MUTED)
                .text(label, margin, y, { width: contentWidth / 2 });

            doc.fontSize(10)
                .font('Helvetica')
                .fillColor(options?.highlight ? PRIMARY : DARK)
                .text(value || '—', margin + contentWidth / 2, y, {
                    width: contentWidth / 2,
                    align: 'right',
                });

            y += 20;
        };

        // ============================================================
        // HELPER: Two-column info block
        // ============================================================
        const twoColumnRow = (leftLabel: string, leftValue: string, rightLabel: string, rightValue: string) => {
            if (y > pageHeight - 70) {
                doc.addPage();
                y = margin;
            }

            const colWidth = contentWidth / 2 - 10;

            doc.fontSize(10)
                .font('Helvetica-Bold')
                .fillColor(MUTED)
                .text(leftLabel, margin, y, { width: colWidth });

            doc.fontSize(10)
                .font('Helvetica-Bold')
                .fillColor(MUTED)
                .text(rightLabel, margin + colWidth + 20, y, { width: colWidth });

            doc.fontSize(10)
                .font('Helvetica')
                .fillColor(DARK)
                .text(leftValue || '—', margin, y + 14, { width: colWidth });

            doc.fontSize(10)
                .font('Helvetica')
                .fillColor(DARK)
                .text(rightValue || '—', margin + colWidth + 20, y + 14, { width: colWidth });

            y += 36;
        };

        // ============================================================
        // SECTION: Booking Summary (highlighted box)
        // ============================================================
        // Highlighted summary box at the top
        const summaryBoxHeight = 90;
        doc.roundedRect(margin, y, contentWidth, summaryBoxHeight, 8)
            .fillAndStroke(LIGHT_BG, BORDER);

        // Left accent bar
        doc.rect(margin, y, 4, summaryBoxHeight).fill(PRIMARY);

        doc.fillColor(DARK)
            .fontSize(11)
            .font('Helvetica-Bold')
            .text('BOOKING SUMMARY', margin + 20, y + 14);

        doc.fontSize(9)
            .font('Helvetica')
            .fillColor(MUTED)
            .text('Reservation details at a glance', margin + 20, y + 30);

        // Summary grid inside box
        const summaryY = y + 48;
        const summaryCol = contentWidth / 3;

        doc.fontSize(9).font('Helvetica-Bold').fillColor(MUTED).text('VEHICLE', margin + 20, summaryY);
        doc.fontSize(12).font('Helvetica-Bold').fillColor(DARK).text(booking.carType || '—', margin + 20, summaryY + 12);

        doc.fontSize(9).font('Helvetica-Bold').fillColor(MUTED).text('PICKUP', margin + 20 + summaryCol, summaryY);
        doc.fontSize(12).font('Helvetica-Bold').fillColor(DARK).text(formatDate(booking.pickupDate), margin + 20 + summaryCol, summaryY + 12);

        doc.fontSize(9).font('Helvetica-Bold').fillColor(MUTED).text('RETURN', margin + 20 + summaryCol * 2, summaryY);
        doc.fontSize(12).font('Helvetica-Bold').fillColor(DARK).text(formatDate(booking.returnDate), margin + 20 + summaryCol * 2, summaryY + 12);

        y += summaryBoxHeight + 30;

        // ============================================================
        // SECTION: Customer Information
        // ============================================================
        sectionHeader('Customer Information');
        infoRow('Full Name', booking.customerName);
        infoRow('Email Address', booking.email);
        infoRow('Phone Number', booking.phone || 'N/A');
        if (booking.nationality) infoRow('Nationality', booking.nationality);
        infoRow(
            booking.idType === 'passport' ? 'Passport Number' : 'National ID Number',
            booking.idNumber
        );
        y += 10;

        // ============================================================
        // SECTION: Rental Details
        // ============================================================
        sectionHeader('Rental Details');
        infoRow('Vehicle Type', booking.carType);
        infoRow('Pickup Location', booking.pickupLocation || 'Main Office');
        if (booking.dropoffLocation) infoRow('Drop-off Location', booking.dropoffLocation);
        infoRow('Pickup Date', formatDate(booking.pickupDate));
        infoRow('Return Date', formatDate(booking.returnDate));
        y += 10;

        // ============================================================
        // SECTION: Rental Estimate (highlighted)
        // ============================================================
        if (booking.estimatedTotal || booking.dailyRate) {
            sectionHeader('Rental Estimate');

            if (booking.periodCategory) {
                const tierLabel =
                    booking.periodCategory === 'short' ? '1–7 days (Short-Term)' :
                    booking.periodCategory === 'medium' ? '7–20 days (Medium-Term)' :
                    '20+ days (Long-Term)';
                infoRow('Rate Tier', tierLabel);
            }
            if (booking.rentalDays) {
                infoRow('Rental Duration', `${booking.rentalDays} day${booking.rentalDays === 1 ? '' : 's'}`);
            }
            if (booking.dailyRate) {
                infoRow('Daily Rate', `KES ${booking.dailyRate.toLocaleString()}/day`);
            }

            // Total box
            if (booking.estimatedTotal) {
                if (y > pageHeight - 100) {
                    doc.addPage();
                    y = margin;
                }

                const totalBoxHeight = 48;
                doc.roundedRect(margin, y, contentWidth, totalBoxHeight, 8)
                    .fillAndStroke('#fff7ed', '#fed7aa');

                doc.rect(margin, y, 4, totalBoxHeight).fill(PRIMARY);

                doc.fillColor('#9f1239')
                    .fontSize(11)
                    .font('Helvetica-Bold')
                    .text('ESTIMATED TOTAL', margin + 20, y + 10);

                doc.fillColor(PRIMARY)
                    .fontSize(20)
                    .font('Helvetica-Bold')
                    .text(`KES ${booking.estimatedTotal.toLocaleString()}`, margin + 20, y + 24);

                doc.fillColor(MUTED)
                    .fontSize(8)
                    .font('Helvetica')
                    .text('Payable on vehicle pickup — subject to final inspection', 0, y + 30, {
                        align: 'right',
                        width: pageWidth - margin,
                    });

                y += totalBoxHeight + 20;
            }
        }

        // ============================================================
        // SECTION: Document Checklist
        // ============================================================
        sectionHeader('Document Checklist');

        const documents = [
            { label: 'National ID / Passport', uploaded: !!booking.idDocumentPath },
            { label: 'Driving Licence', uploaded: !!booking.drivingLicensePath },
            { label: 'Proof of Payment', uploaded: !!booking.depositProofPath },
        ];

        documents.forEach((docItem) => {
            if (y > pageHeight - 70) {
                doc.addPage();
                y = margin;
            }

            // Circle indicator
            const indicatorX = margin + 6;
            const indicatorY = y + 5;

            doc.circle(indicatorX, indicatorY, 6)
                .lineWidth(1.5)
                .strokeColor(docItem.uploaded ? SUCCESS : '#d1d5db')
                .stroke();

            if (docItem.uploaded) {
                doc.fillColor(SUCCESS).circle(indicatorX, indicatorY, 6).fill();
            }

            doc.fillColor(DARK)
                .fontSize(10)
                .font('Helvetica-Bold')
                .text(docItem.label, margin + 20, y);

            doc.fillColor(docItem.uploaded ? SUCCESS : DANGER)
                .fontSize(9)
                .font('Helvetica-Bold')
                .text(
                    docItem.uploaded ? '✓ Received' : '✗ Pending',
                    0,
                    y + 1,
                    { align: 'right', width: pageWidth - margin }
                );

            y += 24;
        });

        y += 10;

        // ============================================================
        // SECTION: Additional Notes (if any)
        // ============================================================
        if (booking.additionalInfo) {
            sectionHeader('Additional Notes');

            const notesText = booking.additionalInfo;
            const notesHeight = doc.heightOfString(notesText, { width: contentWidth - 30 });

            if (y + notesHeight + 30 > pageHeight - 60) {
                doc.addPage();
                y = margin;
            }

            doc.roundedRect(margin, y, contentWidth, notesHeight + 20, 6)
                .fillAndStroke(LIGHT_BG, BORDER);

            doc.fillColor(DARK)
                .fontSize(10)
                .font('Helvetica')
                .text(notesText, margin + 15, y + 10, { width: contentWidth - 30 });

            y += notesHeight + 30;
        }

        // ============================================================
        // SECTION: Terms & Conditions
        // ============================================================
        sectionHeader('Terms & Conditions');

        const terms = [
            'Customer must present a valid driver\'s licence and ID/passport at pickup.',
            'Security deposit is required and will be refunded upon vehicle return.',
            'Minimum rental age is 25 years with at least 3 years driving experience.',
            'Fuel policy: Return with the same fuel level as at pickup.',
            'Insurance is included as per the rental agreement.',
            'All uploaded documents will be kept strictly confidential.',
        ];

        terms.forEach((term, idx) => {
            if (y > pageHeight - 60) {
                doc.addPage();
                y = margin;
            }

            doc.fillColor(PRIMARY)
                .fontSize(9)
                .font('Helvetica-Bold')
                .text(`${idx + 1}.`, margin + 4, y);

            doc.fillColor(DARK)
                .fontSize(9)
                .font('Helvetica')
                .text(term, margin + 20, y, { width: contentWidth - 20 });

            y += 16;
        });

        y += 16;

        // ============================================================
        // IMPORTANT NOTES BOX
        // ============================================================
        if (y > pageHeight - 120) {
            doc.addPage();
            y = margin;
        }

        const importantNotes = [
            'Bring your original ID/passport and driving licence for verification.',
            'Your security deposit receipt must be presented at vehicle pickup.',
            'Keep this document and the attached PDF for your records.',
        ];

        const notesBoxHeight = 30 + importantNotes.length * 16;
        doc.roundedRect(margin, y, contentWidth, notesBoxHeight, 8)
            .fillAndStroke('#fff7ed', '#fed7aa');

        doc.rect(margin, y, 4, notesBoxHeight).fill(PRIMARY);

        doc.fillColor('#9f1239')
            .fontSize(11)
            .font('Helvetica-Bold')
            .text('IMPORTANT NOTES', margin + 20, y + 12);

        importantNotes.forEach((note, idx) => {
            doc.fillColor(DARK)
                .fontSize(9)
                .font('Helvetica')
                .text(`•  ${note}`, margin + 20, y + 32 + idx * 16, {
                    width: contentWidth - 30,
                });
        });

        y += notesBoxHeight + 30;

        // ============================================================
        // CLOSING MESSAGE
        // ============================================================
        if (y > pageHeight - 80) {
            doc.addPage();
            y = margin;
        }

        doc.fillColor(PRIMARY)
            .fontSize(13)
            .font('Helvetica-Bold')
            .text('Thank You for Choosing Vision One Services', 0, y, {
                align: 'center',
                width: pageWidth,
            });

        doc.fillColor(MUTED)
            .fontSize(9)
            .font('Helvetica')
            .text(
                'For any inquiries, please contact us at visionwanservices@gmail.com',
                0,
                y + 20,
                { align: 'center', width: pageWidth }
            );

        // ============================================================
        // FOOTER on every page
        // ============================================================
        const range = doc.bufferedPageRange();

        for (let i = range.start; i < range.start + range.count; i++) {
            doc.switchToPage(i);

            // Bottom border line
            doc.moveTo(margin, pageHeight - 45)
                .lineTo(pageWidth - margin, pageHeight - 45)
                .lineWidth(0.5)
                .strokeColor(BORDER)
                .stroke();

            doc.fillColor(MUTED)
                .fontSize(8)
                .font('Helvetica')
                .text(
                    `Vision One Services  •  visionwanservices.com  •  Kenya: +254 705 336 311  •  UK: +44 7397 549 590`,
                    margin,
                    pageHeight - 38,
                    { align: 'center', width: contentWidth }
                );

            doc.fillColor(MUTED)
                .fontSize(8)
                .text(
                    `© ${new Date().getFullYear()} Vision One Services — All rights reserved.`,
                    margin,
                    pageHeight - 26,
                    { align: 'center', width: contentWidth }
                );

            doc.fillColor(MUTED)
                .fontSize(8)
                .text(
                    `Page ${i - range.start + 1} of ${range.count}`,
                    margin,
                    pageHeight - 38,
                    { align: 'right', width: contentWidth }
                );
        }

        doc.end();
    });
};

/* -----------------------------
   Enhanced Email Template (Customer)
--------------------------------*/
const generateEmailTemplate = (booking: BookingData): string => {
    const primary = '#FF6B35';
    const secondary = '#FF8B35';
    const dark = '#1a1a2e';
    const lightBg = '#f8f9fa';

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Booking Confirmation</title>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 0; background-color: ${lightBg}; }
    .container { max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 16px; box-shadow: 0 10px 40px rgba(0,0,0,0.08); overflow: hidden; }
    .header { background: linear-gradient(135deg, ${primary}, ${secondary}); padding: 30px 20px; text-align: center; }
    .header h1 { color: #fff; margin: 0; font-size: 28px; font-weight: 700; }
    .header p { color: rgba(255,255,255,0.9); margin: 8px 0 0; font-size: 16px; }
    .content { padding: 30px 25px; }
    .badge { display: inline-block; background: ${primary}; color: #fff; padding: 4px 14px; border-radius: 20px; font-size: 13px; font-weight: 600; }
    .section { margin-bottom: 24px; }
    .section-title { color: ${dark}; font-size: 18px; font-weight: 700; border-bottom: 3px solid ${primary}; padding-bottom: 8px; margin-bottom: 16px; }
    .info-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; }
    .info-label { color: #666; font-weight: 600; font-size: 14px; }
    .info-value { color: ${dark}; font-weight: 500; font-size: 14px; text-align: right; }
    .highlight-box { background: ${lightBg}; border-left: 4px solid ${primary}; padding: 12px 16px; border-radius: 4px; margin: 16px 0; }
    .highlight-box p { margin: 0; color: #444; font-size: 14px; }
    .status-ok { color: #10b981; font-weight: 600; }
    .status-pending { color: #f59e0b; font-weight: 600; }
    .btn { display: inline-block; background: linear-gradient(135deg, ${primary}, ${secondary}); color: #fff; padding: 12px 30px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 10px; }
    .footer { text-align: center; padding: 20px; background: ${lightBg}; color: #888; font-size: 13px; border-top: 1px solid #eee; }
    .footer a { color: ${primary}; text-decoration: none; }
    @media (max-width: 480px) {
      .info-row { flex-direction: column; align-items: flex-start; gap: 4px; }
      .info-value { text-align: left; }
    }
  </style>
</head>
<body>
  <div class="container">
  <div class="header">
    <img src="https://www.visionwanservices.com/assets/images/logo.png"
         alt="Vision One Services Logo"
         width="120" height="120"
         style="display: block; margin: 0 auto 12px; width: 100px; height: 100px; object-fit: contain; background: #fff; border-radius: 50%; padding: 6px; border: 4px solid rgba(255,255,255,0.75);" />
    <h1>🚗 Booking Confirmed</h1>
    <p>Thank you for choosing Vision One Services</p>
  </div>
    <div class="content">
      <div style="text-align: center; margin-bottom: 20px;">
        <span class="badge">Booking #${booking.id}</span>
      </div>

      <div class="section">
        <div class="section-title">📋 Reservation Details</div>
        <div class="info-row"><span class="info-label">Vehicle</span><span class="info-value">${booking.carType}</span></div>
        <div class="info-row"><span class="info-label">Pickup Location</span><span class="info-value">${booking.pickupLocation || 'Main Office'}</span></div>
        ${booking.dropoffLocation ? `<div class="info-row"><span class="info-label">Return Location</span><span class="info-value">${booking.dropoffLocation}</span></div>` : ''}
        <div class="info-row"><span class="info-label">Pickup Date</span><span class="info-value">${formatDate(booking.pickupDate)}</span></div>
        <div class="info-row"><span class="info-label">Return Date</span><span class="info-value">${formatDate(booking.returnDate)}</span></div>
      </div>

      ${booking.estimatedTotal || booking.dailyRate ? `
      <div class="section">
        <div class="section-title">💰 Rental Estimate</div>
        ${booking.periodCategory ? `<div class="info-row"><span class="info-label">Rate Tier</span><span class="info-value">${
          booking.periodCategory === 'short' ? '1–7 days' :
          booking.periodCategory === 'medium' ? '7–20 days' : '20+ days'
        }</span></div>` : ''}
        ${booking.rentalDays ? `<div class="info-row"><span class="info-label">Rental Days</span><span class="info-value">${booking.rentalDays} day${booking.rentalDays === 1 ? '' : 's'}</span></div>` : ''}
        ${booking.dailyRate ? `<div class="info-row"><span class="info-label">Daily Rate</span><span class="info-value">KES ${booking.dailyRate.toLocaleString()}/day</span></div>` : ''}
        ${booking.estimatedTotal ? `<div class="info-row" style="background:#fff7ed;padding:10px 12px;border-radius:6px;margin-top:8px;"><span class="info-label" style="color:#9f1239;font-weight:700;">Estimated Total</span><span class="info-value" style="color:#e10b0b;font-size:18px;font-weight:800;">KES ${booking.estimatedTotal.toLocaleString()}</span></div>` : ''}
      </div>
      ` : ''}

      <div class="section">
        <div class="section-title">👤 Client Information</div>
        <div class="info-row"><span class="info-label">Name</span><span class="info-value">${booking.customerName}</span></div>
        <div class="info-row"><span class="info-label">Email</span><span class="info-value">${booking.email}</span></div>
        <div class="info-row"><span class="info-label">Phone</span><span class="info-value">${booking.phone || 'N/A'}</span></div>
        <div class="info-row"><span class="info-label">${booking.idType === 'passport' ? 'Passport No' : 'ID Number'}</span><span class="info-value">${booking.idNumber}</span></div>
      </div>

      <div class="section">
        <div class="section-title">📎 Document Status</div>
        <div class="info-row"><span class="info-label">ID Document</span><span class="info-value ${booking.idDocumentPath ? 'status-ok' : 'status-pending'}">${booking.idDocumentPath ? '✅ Uploaded' : '⏳ Pending'}</span></div>
        <div class="info-row"><span class="info-label">Driving License</span><span class="info-value ${booking.drivingLicensePath ? 'status-ok' : 'status-pending'}">${booking.drivingLicensePath ? '✅ Uploaded' : '⏳ Pending'}</span></div>
        <div class="info-row"><span class="info-label">Deposit Proof</span><span class="info-value ${booking.depositProofPath ? 'status-ok' : 'status-pending'}">${booking.depositProofPath ? '✅ Uploaded' : '⏳ Pending'}</span></div>
      </div>

      ${booking.additionalInfo ? `
      <div class="section">
        <div class="section-title">📝 Additional Notes</div>
        <div class="highlight-box"><p>${booking.additionalInfo}</p></div>
      </div>` : ''}

      <div class="highlight-box" style="margin-top: 20px;">
        <p><strong>📌 What's Next?</strong></p>
        <ul style="margin: 8px 0 0; padding-left: 20px;">
          <li>You'll receive a confirmation call within 24 hours.</li>
          <li>Bring your original ID and driving license for verification.</li>
          <li>Keep this email and the attached PDF for your records.</li>
        </ul>
      </div>

      <div style="text-align: center; margin: 30px 0 10px;">
        <a href="https://visionwanservices.com" class="btn">Visit Our Website</a>
      </div>
    </div>
    <div class="footer">
      <p><strong>Vision One Services</strong><br>
      Kenya: +254 (705) 336 311 | UK: +44 (7397) 549 590<br>
      Email: visionwanservices@gmail.com</p>
      <p style="font-size: 12px; color: #aaa;">© ${new Date().getFullYear()} Vision One Services. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
  `;
};

/* -----------------------------
   Enhanced Admin Notification
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

    const primary = '#FF6B35';
    const secondary = '#FF8B35';
    const dark = '#1a1a2e';
    const lightBg = '#f8f9fa';

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Booking</title>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 0; background: ${lightBg}; }
    .container { max-width: 600px; margin: 20px auto; background: #fff; border-radius: 16px; box-shadow: 0 10px 40px rgba(0,0,0,0.08); overflow: hidden; }
    .header { background: linear-gradient(135deg, ${primary}, ${secondary}); padding: 25px; text-align: center; }
    .header h1 { color: #fff; margin: 0; font-size: 26px; }
    .content { padding: 25px; }
    .badge { display: inline-block; background: #dc2626; color: #fff; padding: 4px 14px; border-radius: 20px; font-size: 13px; font-weight: 600; }
    .section { margin-bottom: 20px; }
    .section-title { color: ${dark}; font-size: 18px; font-weight: 700; border-bottom: 2px solid ${primary}; padding-bottom: 6px; margin-bottom: 12px; }
    .info-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #eee; }
    .info-label { color: #666; font-weight: 600; font-size: 14px; }
    .info-value { color: ${dark}; font-weight: 500; font-size: 14px; text-align: right; }
    .alert-box { background: #fee2e2; border-left: 4px solid #dc2626; padding: 15px; border-radius: 4px; margin: 20px 0; }
    .footer { background: ${lightBg}; padding: 15px; text-align: center; font-size: 12px; color: #6b7280; border-top: 1px solid #eee; }
    @media (max-width: 480px) {
      .info-row { flex-direction: column; align-items: flex-start; gap: 4px; }
      .info-value { text-align: left; }
    }
  </style>
</head>
<body>
  <div class="container">
  <div class="header">
    <img src="https://www.visionwanservices.com/assets/images/logo.png"
         alt="Vision One Services Logo"
         width="100" height="100"
         style="display: block; margin: 0 auto 12px; width: 90px; height: 90px; object-fit: contain; background: #fff; border-radius: 50%; padding: 6px; border: 4px solid rgba(255,255,255,0.75);" />
    <h1>📋 NEW BOOKING REQUEST</h1>
    <p style="color: rgba(255,255,255,0.9); margin: 0;">Action Required</p>
  </div>
    <div class="content">
      <div style="text-align: center; margin-bottom: 15px;">
        <span class="badge">${booking.id}</span>
      </div>

      <div class="section">
        <div class="section-title">👤 Customer</div>
        <div class="info-row"><span class="info-label">Name</span><span class="info-value">${booking.customerName}</span></div>
        <div class="info-row"><span class="info-label">Email</span><span class="info-value">${booking.email}</span></div>
        <div class="info-row"><span class="info-label">Phone</span><span class="info-value">${booking.phone || 'N/A'}</span></div>
        <div class="info-row"><span class="info-label">${booking.idType === 'passport' ? 'Passport No' : 'ID Number'}</span><span class="info-value">${booking.idNumber}</span></div>
      </div>

      <div class="section">
        <div class="section-title">🚗 Booking</div>
        <div class="info-row"><span class="info-label">Vehicle</span><span class="info-value">${booking.carType}</span></div>
        <div class="info-row"><span class="info-label">Pickup</span><span class="info-value">${formatDate(booking.pickupDate)} at ${booking.pickupLocation || 'Main Office'}</span></div>
        <div class="info-row"><span class="info-label">Return</span><span class="info-value">${formatDate(booking.returnDate)}</span></div>
        ${booking.dropoffLocation ? `<div class="info-row"><span class="info-label">Drop-off</span><span class="info-value">${booking.dropoffLocation}</span></div>` : ''}
      </div>

      ${booking.estimatedTotal || booking.dailyRate ? `
      <div class="section">
        <div class="section-title">💰 Rental Estimate</div>
        ${booking.periodCategory ? `<div class="info-row"><span class="info-label">Rate Tier</span><span class="info-value">${
          booking.periodCategory === 'short' ? '1–7 days' :
          booking.periodCategory === 'medium' ? '7–20 days' : '20+ days'
        }</span></div>` : ''}
        ${booking.rentalDays ? `<div class="info-row"><span class="info-label">Rental Days</span><span class="info-value">${booking.rentalDays} day${booking.rentalDays === 1 ? '' : 's'}</span></div>` : ''}
        ${booking.dailyRate ? `<div class="info-row"><span class="info-label">Daily Rate</span><span class="info-value">KES ${booking.dailyRate.toLocaleString()}/day</span></div>` : ''}
        ${booking.estimatedTotal ? `<div class="info-row" style="background:#fff7ed;padding:10px 12px;border-radius:6px;margin-top:8px;"><span class="info-label" style="color:#9f1239;font-weight:700;">Estimated Total</span><span class="info-value" style="color:#e10b0b;font-size:18px;font-weight:800;">KES ${booking.estimatedTotal.toLocaleString()}</span></div>` : ''}
      </div>
      ` : ''}

      <div class="section">
        <div class="section-title">📎 Documents</div>
        <div class="info-row"><span class="info-label">ID Document</span><span class="info-value">${booking.idDocumentPath ? '✅ Uploaded' : '❌ Missing'}</span></div>
        <div class="info-row"><span class="info-label">Driving License</span><span class="info-value">${booking.drivingLicensePath ? '✅ Uploaded' : '❌ Missing'}</span></div>
        <div class="info-row"><span class="info-label">Deposit Proof</span><span class="info-value">${booking.depositProofPath ? '✅ Uploaded' : '❌ Missing'}</span></div>
        <div class="info-row"><span class="info-label">ZIP Attached</span><span class="info-value">${attachments.length > 0 ? '✅ Yes' : '❌ No'}</span></div>
      </div>

      ${booking.additionalInfo ? `
      <div class="section">
        <div class="section-title">📝 Notes</div>
        <div style="background: #f1f5f9; padding: 12px; border-radius: 4px;">${booking.additionalInfo}</div>
      </div>` : ''}

      <div class="alert-box">
        <p><strong>⚠️ ACTION REQUIRED</strong></p>
        <p style="margin: 0;">Verify identity documents, process security deposit, and confirm vehicle availability.</p>
      </div>

      <div style="text-align: center; margin: 20px 0;">
        <a href="mailto:${booking.email}?subject=Re: Booking ${booking.id}" style="display: inline-block; background: ${primary}; color: #fff; padding: 10px 25px; border-radius: 8px; text-decoration: none; font-weight: 600;">Reply to Customer</a>
      </div>
    </div>
    <div class="footer">
      <p>Vision One Services — Booking Management System</p>
      <p>Received: ${formatDateTime(booking.bookingDate)}</p>
    </div>
  </div>
</body>
</html>
  `;

    const mailOptions = {
        from: process.env.EMAIL_FROM || '"Vision One Services" <bookings@visiononecarhire.com>',
        to: process.env.ADMIN_EMAIL || 'visionwanservices@gmail.com',
        subject: `📋 NEW BOOKING: ${booking.carType} - ${booking.customerName} (${booking.idNumber})${booking.estimatedTotal ? ` - KES ${booking.estimatedTotal.toLocaleString()}` : ''}`,
        html,
        attachments
    };

    await transporter.sendMail(mailOptions);
    console.log(`📧 Admin notification sent for booking ${booking.id}`);
};

/* -----------------------------
   Enhanced Customer Confirmation
--------------------------------*/
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

    if (zipPath && fs.existsSync(zipPath)) {
        attachments.push({
            filename: `${booking.idNumber}_your_documents.zip`,
            path: zipPath,
            contentType: 'application/zip'
        });
    }

    const mailOptions = {
        from: process.env.EMAIL_FROM || '"Vision One Services" <bookings@visiononecarhire.com>',
        to: booking.email,
        subject: `✅ Booking Confirmed: ${booking.id} - Vision One Services`,
        html: generateEmailTemplate(booking),
        attachments
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Confirmation email sent to ${booking.email}: ${info.messageId}`);
    return info;
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