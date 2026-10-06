import { Request, Response } from 'express';
import nodemailer from 'nodemailer';
import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import { BookingData } from '../types/booking';
import {
    appendBookingToExcel,
    updateBookingInExcel,
    findBookingInExcel,
    getExcelPath,
} from '../utils/excelStore';

const UPLOAD_DIR = process.env.UPLOAD_DIR
    ? path.resolve(process.env.UPLOAD_DIR)
    : process.env.DATA_DIR
    ? path.join(path.resolve(process.env.DATA_DIR), 'uploads')
    : path.resolve(process.cwd(), 'uploads');

if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// In-memory storage for bookings
const bookings: BookingData[] = [];

/* =============================================================
   🎄 FESTIVE DECEMBER GUARD
   Server-side source of truth for the festive window and rates.
   This mirrors src/config/festiveRates.ts on the frontend.
   ============================================================= */

const FESTIVE_MONTH = 11; // December (0-indexed)
const FESTIVE_SEASON_TAG = 'festive-december';

interface FestiveRate {
    short: number;   // 1–7 days
    medium: number;  // 7–20 days
    long: number;    // 20+ days
}

const FESTIVE_RATES: Record<string, FestiveRate> = {
    'Fielder':    { short: 4500,  medium: 4000,  long: 3500  },
    'Mazda CX-5': { short: 8000,  medium: 7500,  long: 7000  },
    'Harrier':    { short: 9000,  medium: 8500,  long: 8000  },
    'Lexus':      { short: 10000, medium: 9500,  long: 9000  },
    'Prado':      { short: 13000, medium: 12000, long: 11000 },
};

const getFestiveYear = (): number => new Date().getFullYear();

const parseDate = (dateStr?: string): Date | null => {
    if (!dateStr) return null;
    // Accept YYYY-MM-DD (from <input type="date">) and full ISO strings
    const d = new Date(
        /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? `${dateStr}T00:00:00` : dateStr
    );
    return isNaN(d.getTime()) ? null : d;
};

const isFestiveDate = (dateStr?: string): boolean => {
    const d = parseDate(dateStr);
    if (!d) return false;
    return d.getMonth() === FESTIVE_MONTH && d.getFullYear() === getFestiveYear();
};

const getPeriodFromDays = (days: number): 'short' | 'medium' | 'long' => {
    if (days <= 7) return 'short';
    if (days <= 20) return 'medium';
    return 'long';
};

/**
 * Compute the rental duration in whole days between two dates.
 * Returns null when either date is invalid or the range is non-positive.
 */
const computeRentalDays = (pickupDate?: string, returnDate?: string): number | null => {
    const p = parseDate(pickupDate);
    const r = parseDate(returnDate);
    if (!p || !r) return null;
    const days = Math.ceil((r.getTime() - p.getTime()) / (1000 * 60 * 60 * 24));
    return days > 0 ? days : null;
};

/**
 * Verify that a festive booking falls entirely within December of the
 * current festive year. Returns an error message when invalid, else null.
 */
const assertFestiveWindow = (input: {
    bookingSeason?: string;
    pickupDate?: string;
    returnDate?: string;
}): string | null => {
    if (input.bookingSeason !== FESTIVE_SEASON_TAG) return null; // not a festive booking

    const year = getFestiveYear();
    if (!isFestiveDate(input.pickupDate)) {
        return `Festive bookings must start within December ${year}.`;
    }
    if (!isFestiveDate(input.returnDate)) {
        return `Festive bookings must end within December ${year}.`;
    }
    return null;
};

/**
 * Recompute festive pricing server-side. This prevents a tampered client
 * from submitting arbitrary rates. Returns the corrected values or null
 * when the vehicle is unknown.
 */
const computeFestivePricing = (
    carType: string,
    pickupDate: string,
    returnDate: string
): {
    periodCategory: 'short' | 'medium' | 'long';
    dailyRate: number;
    estimatedTotal: number;
    rentalDays: number;
} | null => {
    const days = computeRentalDays(pickupDate, returnDate);
    if (!days) return null;

    const vehicleRates =
        FESTIVE_RATES[carType] ??
        FESTIVE_RATES[
            Object.keys(FESTIVE_RATES).find(
                (k) => k.toLowerCase() === carType?.toLowerCase()
            ) ?? ''
        ];
    if (!vehicleRates) return null;

    const periodCategory = getPeriodFromDays(days);
    const dailyRate = vehicleRates[periodCategory];

    return {
        periodCategory,
        dailyRate,
        estimatedTotal: dailyRate * days,
        rentalDays: days,
    };
};

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
            pass: process.env.EMAIL_PASS,
        },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 10000,
    });
};

/* -----------------------------
   Create ZIP of uploaded documents
--------------------------------*/
export const createDocumentsZip = async (booking: BookingData): Promise<string | null> => {
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

        filesToZip.forEach((filePath) => {
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
   Create Booking
--------------------------------*/
export const createBooking = async (req: Request, res: Response) => {
    try {
        const files = req.files as any[];
        const isFestive = req.body.bookingSeason === FESTIVE_SEASON_TAG;

        console.log('📁 Files received:', files?.length || 0);
        if (files && files.length > 0) {
            files.forEach((file, index) => {
                console.log(
                    `   File ${index + 1}: ${file.fieldname} - ${file.originalname} (${file.mimetype})`
                );
            });
        }

        const findFile = (fieldNames: string[]) => {
            if (!files || !Array.isArray(files)) return undefined;
            for (const fieldName of fieldNames) {
                const file = files.find((f) => f.fieldname === fieldName);
                if (file) return file;
            }
            return undefined;
        };

        /* =========================================================
           🎄 FESTIVE WINDOW ENFORCEMENT
           ========================================================= */
        const festiveError = assertFestiveWindow({
            bookingSeason: req.body.bookingSeason,
            pickupDate: req.body.pickupDate,
            returnDate: req.body.returnDate,
        });
        if (festiveError) {
            return res.status(400).json({ success: false, error: festiveError });
        }

        // Base booking data
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
            termsAccepted:
                req.body.termsAccepted === 'true' || req.body.termsAccepted === true,

            // Estimate fields (may be recomputed below for festive bookings)
            periodCategory: req.body.periodCategory || undefined,
            dailyRate: req.body.dailyRate ? Number(req.body.dailyRate) : undefined,
            estimatedTotal: req.body.estimatedTotal
                ? Number(req.body.estimatedTotal)
                : undefined,
            rentalDays: req.body.rentalDays ? Number(req.body.rentalDays) : undefined,
        };

        // Validate essential fields
        const requiredFields = [
            'customerName',
            'email',
            'phone',
            'pickupDate',
            'returnDate',
            'carType',
            'pickupLocation',
            'idNumber',
            'idType',
        ];

        const missingFields = requiredFields.filter(
            (field) => !bookingData[field as keyof BookingData]
        );
        if (missingFields.length > 0) {
            return res.status(400).json({
                success: false,
                error: `Missing required fields: ${missingFields.join(', ')}`,
            });
        }

        if (!bookingData.termsAccepted) {
            return res.status(400).json({
                success: false,
                error: 'Terms and conditions must be accepted',
            });
        }

        /* =========================================================
           🎄 SERVER-SIDE FESTIVE PRICING RECALCULATION
           Ignore client-supplied estimates for festive bookings and
           recompute from the authoritative rate table.
           ========================================================= */
        if (isFestive) {
            const festivePricing = computeFestivePricing(
                bookingData.carType,
                bookingData.pickupDate,
                bookingData.returnDate
            );

            if (!festivePricing) {
                return res.status(400).json({
                    success: false,
                    error:
                        'Unable to compute festive pricing — please verify vehicle and dates.',
                });
            }

            bookingData.periodCategory = festivePricing.periodCategory;
            bookingData.dailyRate = festivePricing.dailyRate;
            bookingData.estimatedTotal = festivePricing.estimatedTotal;
            bookingData.rentalDays = festivePricing.rentalDays;
        }

        // Generate booking ID
        const bookingId = `V1-${Date.now().toString().slice(-8)}`;
        const status = 'confirmed';

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
            depositProofPath: depositProofFile?.path,

            // 🎄 Festive metadata (persisted to Excel + emails)
            bookingSeason: isFestive ? FESTIVE_SEASON_TAG : undefined,
            festiveYear: isFestive ? getFestiveYear() : undefined,
        };

        bookings.push(bookingWithId);

        try {
            await appendBookingToExcel(bookingWithId);
        } catch (excelError) {
            console.error(`⚠️ Excel append failed for ${bookingId}:`, excelError);
        }

        console.log(
            `📝 New booking created: ${bookingId} for ${bookingData.customerName}` +
                (isFestive ? ` [FESTIVE DEC ${bookingWithId.festiveYear}]` : '')
        );
        console.log(`📁 Documents uploaded:`, {
            idDocument: !!idDocFile,
            drivingLicense: !!drivingLicenseFile,
            depositProof: !!depositProofFile,
        });

        // Respond immediately
        res.status(201).json({
            success: true,
            message: isFestive
                ? `Festive December booking created successfully`
                : 'Booking created successfully',
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
                bookingSeason: bookingWithId.bookingSeason,
                festiveYear: bookingWithId.festiveYear,
                hasDocuments: {
                    idDocument: !!idDocFile,
                    drivingLicense: !!drivingLicenseFile,
                    depositProof: !!depositProofFile,
                },
            },
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
                        try {
                            fs.unlinkSync(zipPath);
                            console.log(`🗑️ Cleaned up ZIP file: ${zipPath}`);
                        } catch (cleanupErr) {
                            console.warn(`Cleanup failed for ${zipPath}:`, cleanupErr);
                        }
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
            message:
                process.env.NODE_ENV === 'development'
                    ? (error as Error).message
                    : undefined,
        });
    }
};

/* -----------------------------
   Enhanced PDF Generation — Corporate Grade (2-page max)
   Now includes a festive December banner when applicable.
--------------------------------*/
const generateBookingPDF = (booking: BookingData): Promise<Buffer> => {
    return new Promise((resolve, reject) => {
        const isFestive = booking.bookingSeason === FESTIVE_SEASON_TAG;

        const doc = new PDFDocument({
            size: 'A4',
            margin: 50,
            bufferPages: true,
            autoFirstPage: true,
            info: {
                Title: `Booking Confirmation — ${booking.id}`,
                Author: 'Vision One Services',
                Subject: isFestive
                    ? 'Festive December Vehicle Rental Booking Confirmation'
                    : 'Vehicle Rental Booking Confirmation',
                Creator: 'Vision One Services Booking System',
            },
        });

        const buffers: Buffer[] = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('error', reject);
        doc.on('end', () => resolve(Buffer.concat(buffers)));

        /* ============================================================
           COLOR PALETTE
           ============================================================ */
        const PRIMARY = isFestive ? '#C8102E' : '#FF6B35';
        const SECONDARY = isFestive ? '#0B6E4F' : '#FF8B35';
        const GOLD = '#D4AF37';
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

        /* ============================================================
           HEADER BAND
           ============================================================ */
        const headerHeight = 130;
        doc.rect(0, 0, pageWidth, headerHeight).fill(PRIMARY);
        doc.rect(pageWidth * 0.5, 0, pageWidth * 0.5, headerHeight).fill(SECONDARY);

        const dividerX = pageWidth * 0.55;
        doc.moveTo(dividerX, 20)
            .lineTo(dividerX, headerHeight - 20)
            .lineWidth(1)
            .strokeColor('rgba(255,255,255,0.35)')
            .stroke();

        // Logo
        const logoSize = 60;
        const logoX = margin;
        const logoY = (headerHeight - logoSize) / 2 + 2;

        doc.circle(logoX + logoSize / 2, logoY + logoSize / 2, logoSize / 2 + 3)
            .lineWidth(2.5)
            .strokeColor('#ffffff')
            .stroke();

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

        // LEFT SIDE: Company info
        const leftBlockX = logoX + logoSize + 12;
        const leftBlockWidth = dividerX - leftBlockX - 10;

        doc.fillColor('#ffffff')
            .fontSize(15)
            .font('Helvetica-Bold')
            .text('Vision One Services', leftBlockX, logoY + 4, {
                width: leftBlockWidth,
                lineBreak: false,
            });

        doc.fontSize(8)
            .font('Helvetica')
            .fillColor('rgba(255,255,255,0.95)')
            .text('Premium Vehicle Rental & Mobility Solutions', leftBlockX, logoY + 24, {
                width: leftBlockWidth,
                lineBreak: false,
            });

        doc.fontSize(7.5)
            .fillColor('rgba(255,255,255,0.85)')
            .text('Kenya: +254 705 336 311', leftBlockX, logoY + 40, {
                width: leftBlockWidth,
                lineBreak: false,
            });

        doc.fontSize(7.5)
            .fillColor('rgba(255,255,255,0.85)')
            .text('UK: +44 7397 549 590', leftBlockX, logoY + 52, {
                width: leftBlockWidth,
                lineBreak: false,
            });

        // RIGHT SIDE: Document title
        const rightBlockX = dividerX + 12;
        const rightBlockWidth = pageWidth - rightBlockX - margin;

        doc.fillColor('#ffffff')
            .fontSize(isFestive ? 11 : 12)
            .font('Helvetica-Bold')
            .text(
                isFestive
                    ? `🎄 FESTIVE DEC ${booking.festiveYear ?? getFestiveYear()} — BOOKING CONFIRMATION`
                    : 'BOOKING CONFIRMATION',
                rightBlockX,
                logoY + 10,
                {
                    align: 'right',
                    width: rightBlockWidth,
                    lineBreak: false,
                }
            );

        doc.fontSize(8)
            .font('Helvetica')
            .fillColor('rgba(255,255,255,0.95)')
            .text(`Booking ID: ${booking.id}`, rightBlockX, logoY + 28, {
                align: 'right',
                width: rightBlockWidth,
                lineBreak: false,
            });

        doc.fontSize(8)
            .font('Helvetica')
            .fillColor('rgba(255,255,255,0.95)')
            .text(`Issued: ${formatDateTime(booking.bookingDate)}`, rightBlockX, logoY + 42, {
                align: 'right',
                width: rightBlockWidth,
                lineBreak: false,
            });

        let y = headerHeight + 22;

        /* ============================================================
           HELPERS
           ============================================================ */
        const checkPageBreak = (needed: number) => {
            if (y + needed > pageHeight - 55) {
                if (doc.bufferedPageRange().count < 2) {
                    doc.addPage();
                    y = margin;
                }
            }
        };

        const sectionHeader = (title: string) => {
            checkPageBreak(40);
            doc.fillColor(PRIMARY)
                .fontSize(11)
                .font('Helvetica-Bold')
                .text(title.toUpperCase(), margin, y);

            doc.moveTo(margin, y + 15)
                .lineTo(margin + contentWidth, y + 15)
                .lineWidth(0.8)
                .strokeColor(BORDER)
                .stroke();

            doc.moveTo(margin, y + 15)
                .lineTo(margin + 50, y + 15)
                .lineWidth(2)
                .strokeColor(PRIMARY)
                .stroke();

            y += 26;
        };

        const infoRow = (
            label: string,
            value: string,
            options?: { highlight?: boolean }
        ) => {
            checkPageBreak(22);
            doc.fontSize(9)
                .font('Helvetica-Bold')
                .fillColor(MUTED)
                .text(label, margin, y, { width: contentWidth / 2 });

            doc.fontSize(9)
                .font('Helvetica')
                .fillColor(options?.highlight ? PRIMARY : DARK)
                .text(value || '—', margin + contentWidth / 2, y, {
                    width: contentWidth / 2,
                    align: 'right',
                });

            y += 16;
        };

        /* ============================================================
           🎄 FESTIVE BANNER (only for festive bookings)
           ============================================================ */
        if (isFestive) {
            const bannerH = 44;
            doc.roundedRect(margin, y, contentWidth, bannerH, 6)
                .fillAndStroke('#FFF8E7', GOLD);
            doc.rect(margin, y, 4, bannerH).fill(PRIMARY);

            doc.fillColor(PRIMARY)
                .fontSize(11)
                .font('Helvetica-Bold')
                .text(
                    `🎄 FESTIVE DECEMBER ${booking.festiveYear ?? getFestiveYear()} OFFER`,
                    margin + 16,
                    y + 8
                );

            doc.fillColor('#7c2d12')
                .fontSize(8)
                .font('Helvetica')
                .text(
                    'Exclusive December rates applied — festive pricing locked in at booking.',
                    margin + 16,
                    y + 24
                );

            y += bannerH + 14;
        }

        /* ============================================================
           BOOKING SUMMARY BOX
           ============================================================ */
        const summaryBoxHeight = 78;
        doc.roundedRect(margin, y, contentWidth, summaryBoxHeight, 6)
            .fillAndStroke(LIGHT_BG, BORDER);
        doc.rect(margin, y, 3, summaryBoxHeight).fill(PRIMARY);

        doc.fillColor(DARK)
            .fontSize(10)
            .font('Helvetica-Bold')
            .text('BOOKING SUMMARY', margin + 16, y + 10);

        doc.fontSize(7.5)
            .font('Helvetica')
            .fillColor(MUTED)
            .text('Reservation details at a glance', margin + 16, y + 24);

        const summaryY = y + 40;
        const summaryCol = contentWidth / 3;

        doc.fontSize(7.5)
            .font('Helvetica-Bold')
            .fillColor(MUTED)
            .text('VEHICLE', margin + 16, summaryY);
        doc.fontSize(10)
            .font('Helvetica-Bold')
            .fillColor(DARK)
            .text(booking.carType || '—', margin + 16, summaryY + 10);

        doc.fontSize(7.5)
            .font('Helvetica-Bold')
            .fillColor(MUTED)
            .text('PICKUP', margin + 16 + summaryCol, summaryY);
        doc.fontSize(10)
            .font('Helvetica-Bold')
            .fillColor(DARK)
            .text(
                formatDate(booking.pickupDate),
                margin + 16 + summaryCol,
                summaryY + 10
            );

        doc.fontSize(7.5)
            .font('Helvetica-Bold')
            .fillColor(MUTED)
            .text('RETURN', margin + 16 + summaryCol * 2, summaryY);
        doc.fontSize(10)
            .font('Helvetica-Bold')
            .fillColor(DARK)
            .text(
                formatDate(booking.returnDate),
                margin + 16 + summaryCol * 2,
                summaryY + 10
            );

        y += summaryBoxHeight + 20;

        /* ============================================================
           CUSTOMER INFORMATION
           ============================================================ */
        sectionHeader('Customer Information');
        infoRow('Full Name', booking.customerName);
        infoRow('Email Address', booking.email);
        infoRow('Phone Number', booking.phone || 'N/A');
        if (booking.nationality) infoRow('Nationality', booking.nationality);
        infoRow(
            booking.idType === 'passport' ? 'Passport Number' : 'National ID Number',
            booking.idNumber
        );
        y += 6;

        /* ============================================================
           RENTAL DETAILS
           ============================================================ */
        sectionHeader('Rental Details');
        infoRow('Vehicle Type', booking.carType);
        infoRow('Pickup Location', booking.pickupLocation || 'Main Office');
        if (booking.dropoffLocation)
            infoRow('Drop-off Location', booking.dropoffLocation);
        infoRow('Pickup Date', formatDate(booking.pickupDate));
        infoRow('Return Date', formatDate(booking.returnDate));
        y += 6;

        /* ============================================================
           RENTAL ESTIMATE
           ============================================================ */
        if (booking.estimatedTotal || booking.dailyRate) {
            sectionHeader('Rental Estimate');

            if (booking.periodCategory) {
                const tierLabel =
                    booking.periodCategory === 'short'
                        ? '1–7 days (Short-Term)'
                        : booking.periodCategory === 'medium'
                        ? '7–20 days (Medium-Term)'
                        : '20+ days (Long-Term)';
                infoRow('Rate Tier', tierLabel);
            }
            if (booking.rentalDays) {
                infoRow(
                    'Rental Duration',
                    `${booking.rentalDays} day${booking.rentalDays === 1 ? '' : 's'}`
                );
            }
            if (booking.dailyRate) {
                infoRow(
                    'Daily Rate',
                    `KES ${booking.dailyRate.toLocaleString()}/day`
                );
            }

            if (booking.estimatedTotal) {
                checkPageBreak(60);

                const totalBoxHeight = 42;
                doc.roundedRect(margin, y, contentWidth, totalBoxHeight, 6)
                    .fillAndStroke('#fff7ed', '#fed7aa');
                doc.rect(margin, y, 3, totalBoxHeight).fill(PRIMARY);

                doc.fillColor('#9f1239')
                    .fontSize(9)
                    .font('Helvetica-Bold')
                    .text('ESTIMATED TOTAL', margin + 16, y + 8);

                doc.fillColor(PRIMARY)
                    .fontSize(17)
                    .font('Helvetica-Bold')
                    .text(
                        `KES ${booking.estimatedTotal.toLocaleString()}`,
                        margin + 16,
                        y + 20
                    );

                doc.fillColor(MUTED)
                    .fontSize(7)
                    .font('Helvetica')
                    .text(
                        'Payable on vehicle pickup — subject to final inspection',
                        0,
                        y + 24,
                        { align: 'right', width: pageWidth - margin }
                    );

                y += totalBoxHeight + 16;
            }
        }

        /* ============================================================
           DOCUMENT CHECKLIST
           ============================================================ */
        sectionHeader('Document Checklist');

        const documents = [
            { label: 'National ID / Passport', uploaded: !!booking.idDocumentPath },
            { label: 'Driving Licence', uploaded: !!booking.drivingLicensePath },
            { label: 'Proof of Payment', uploaded: !!booking.depositProofPath },
        ];

        documents.forEach((docItem) => {
            checkPageBreak(22);
            const indicatorX = margin + 5;
            const indicatorY = y + 4;

            doc.circle(indicatorX, indicatorY, 5)
                .lineWidth(1.5)
                .strokeColor(docItem.uploaded ? SUCCESS : '#d1d5db')
                .stroke();

            if (docItem.uploaded) {
                doc.fillColor(SUCCESS).circle(indicatorX, indicatorY, 5).fill();
            }

            doc.fillColor(DARK)
                .fontSize(9)
                .font('Helvetica-Bold')
                .text(docItem.label, margin + 16, y);

            doc.fillColor(docItem.uploaded ? SUCCESS : DANGER)
                .fontSize(8)
                .font('Helvetica-Bold')
                .text(docItem.uploaded ? '✓ Received' : '✗ Pending', 0, y + 1, {
                    align: 'right',
                    width: pageWidth - margin,
                });

            y += 18;
        });

        y += 6;

        /* ============================================================
           ADDITIONAL NOTES
           ============================================================ */
        if (booking.additionalInfo) {
            sectionHeader('Additional Notes');
            const notesText = booking.additionalInfo;
            const notesHeight = doc.heightOfString(notesText, {
                width: contentWidth - 24,
            });

            checkPageBreak(notesHeight + 24);

            doc.roundedRect(margin, y, contentWidth, notesHeight + 14, 5)
                .fillAndStroke(LIGHT_BG, BORDER);

            doc.fillColor(DARK)
                .fontSize(9)
                .font('Helvetica')
                .text(notesText, margin + 12, y + 7, { width: contentWidth - 24 });

            y += notesHeight + 22;
        }

        /* ============================================================
           TERMS & CONDITIONS
           ============================================================ */
        sectionHeader('Terms & Conditions');

        const terms = isFestive
            ? [
                  'This booking is valid for December travel only and is subject to availability.',
                  'Customer must present a valid driver\'s licence and ID/passport at pickup.',
                  'Security deposit is required and will be refunded upon vehicle return.',
                  'Minimum rental age is 25 years with at least 3 years driving experience.',
                  'Fuel policy: Return with the same fuel level as at pickup.',
                  'Festive rates are locked in at the time of booking and cannot be combined with other offers.',
              ]
            : [
                  'Customer must present a valid driver\'s licence and ID/passport at pickup.',
                  'Security deposit is required and will be refunded upon vehicle return.',
                  'Minimum rental age is 25 years with at least 3 years driving experience.',
                  'Fuel policy: Return with the same fuel level as at pickup.',
                  'Insurance is included as per the rental agreement.',
                  'All uploaded documents will be kept strictly confidential.',
              ];

        terms.forEach((term, idx) => {
            checkPageBreak(16);
            doc.fillColor(PRIMARY)
                .fontSize(8)
                .font('Helvetica-Bold')
                .text(`${idx + 1}.`, margin + 3, y);

            doc.fillColor(DARK)
                .fontSize(8)
                .font('Helvetica')
                .text(term, margin + 16, y, { width: contentWidth - 16 });

            y += 13;
        });

        y += 10;

        /* ============================================================
           IMPORTANT NOTES BOX
           ============================================================ */
        const importantNotes = isFestive
            ? [
                  'Bring your original ID/passport and driving licence for verification.',
                  'Your festive booking is valid for December only — changes must be requested in advance.',
                  'Keep this document and the attached PDF for your records.',
              ]
            : [
                  'Bring your original ID/passport and driving licence for verification.',
                  'Your security deposit receipt must be presented at vehicle pickup.',
                  'Keep this document and the attached PDF for your records.',
              ];

        const notesBoxHeight = 24 + importantNotes.length * 13;

        checkPageBreak(notesBoxHeight + 20);

        doc.roundedRect(margin, y, contentWidth, notesBoxHeight, 6)
            .fillAndStroke('#fff7ed', '#fed7aa');
        doc.rect(margin, y, 3, notesBoxHeight).fill(PRIMARY);

        doc.fillColor('#9f1239')
            .fontSize(9)
            .font('Helvetica-Bold')
            .text('IMPORTANT NOTES', margin + 16, y + 8);

        importantNotes.forEach((note, idx) => {
            doc.fillColor(DARK)
                .fontSize(8)
                .font('Helvetica')
                .text(`•  ${note}`, margin + 16, y + 24 + idx * 13, {
                    width: contentWidth - 24,
                });
        });

        y += notesBoxHeight + 20;

        /* ============================================================
           CLOSING MESSAGE
           ============================================================ */
        checkPageBreak(50);

        doc.fillColor(PRIMARY)
            .fontSize(11)
            .font('Helvetica-Bold')
            .text(
                isFestive
                    ? `🎄 Thank You for Choosing Our Festive ${booking.festiveYear ?? getFestiveYear()} Offer`
                    : 'Thank You for Choosing Vision One Services',
                0,
                y,
                { align: 'center', width: pageWidth }
            );

        doc.fillColor(MUTED)
            .fontSize(8)
            .font('Helvetica')
            .text(
                'For any inquiries, please contact us at visionwanservices@gmail.com',
                0,
                y + 16,
                { align: 'center', width: pageWidth }
            );

        /* ============================================================
           FOOTER on every page
           ============================================================ */
        const range = doc.bufferedPageRange();
        const totalPages = range.count;

        for (let i = range.start; i < range.start + range.count; i++) {
            doc.switchToPage(i);

            doc.moveTo(margin, pageHeight - 40)
                .lineTo(pageWidth - margin, pageHeight - 40)
                .lineWidth(0.5)
                .strokeColor(BORDER)
                .stroke();

            doc.fillColor(MUTED)
                .fontSize(7)
                .font('Helvetica')
                .text(
                    `Vision One Services  •  visionwanservices.com  •  Kenya: +254 705 336 311  •  UK: +44 7397 549 590`,
                    margin,
                    pageHeight - 33,
                    { align: 'center', width: contentWidth }
                );

            doc.fillColor(MUTED)
                .fontSize(7)
                .text(
                    `© ${new Date().getFullYear()} Vision One Services — All rights reserved.`,
                    margin,
                    pageHeight - 22,
                    { align: 'center', width: contentWidth }
                );

            doc.fillColor(MUTED)
                .fontSize(7)
                .text(
                    `Page ${i - range.start + 1} of ${totalPages}`,
                    margin,
                    pageHeight - 33,
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
    const isFestive = booking.bookingSeason === FESTIVE_SEASON_TAG;
    const primary = isFestive ? '#C8102E' : '#FF6B35';
    const secondary = isFestive ? '#0B6E4F' : '#FF8B35';
    const dark = '#1a1a2e';
    const lightBg = isFestive ? '#FFF8E7' : '#f8f9fa';
    const gold = '#D4AF37';

    const festiveBanner = isFestive
        ? `
      <div style="background: linear-gradient(135deg, ${primary}, ${secondary}); padding: 14px 18px; border-radius: 10px; margin-bottom: 20px; border: 2px solid ${gold}; text-align: center;">
        <p style="margin: 0; color: #fff; font-weight: 800; letter-spacing: 1.5px; font-size: 13px; text-transform: uppercase;">
          🎄 Festive December ${booking.festiveYear ?? getFestiveYear()} Offer
        </p>
        <p style="margin: 6px 0 0; color: rgba(255,255,255,0.9); font-size: 12px;">
          Your exclusive seasonal rate has been locked in.
        </p>
      </div>`
        : '';

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${isFestive ? `Festive Booking Confirmation` : 'Booking Confirmation'}</title>
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
    <h1>${isFestive ? '🎄 Festive Booking Confirmed' : '🚗 Booking Confirmed'}</h1>
    <p>Thank you for choosing Vision One Services</p>
  </div>
    <div class="content">
      ${festiveBanner}
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
          ${isFestive ? '<li>Your festive booking is valid for December only — changes must be requested in advance.</li>' : ''}
        </ul>
      </div>

      <div class="highlight-box" style="margin-top: 16px; background: #ecfdf5; border-left-color: #10b981;">
        <p><strong>🔄 Need to Amend Your Booking?</strong></p>
        <p style="margin-top: 6px;">
          You can update your booking details (dates, vehicle, contact info) anytime
          by visiting your booking page and clicking "Amend Booking".
        </p>
        <div style="text-align: center; margin-top: 12px;">
          <a href="${process.env.FRONTEND_URL || 'https://visionwanservices.com'}/booking?amend=${booking.id}&email=${encodeURIComponent(booking.email)}"
             style="display: inline-block; background: #10b981; color: #fff; padding: 10px 25px; border-radius: 8px; text-decoration: none; font-weight: 600;">
            Amend My Booking
          </a>
        </div>
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
export const sendAdminNotification = async (
    booking: BookingData,
    zipPath: string | null
) => {
    const transporter = createTransporter();
    const isFestive = booking.bookingSeason === FESTIVE_SEASON_TAG;

    const attachments = [];
    if (zipPath && fs.existsSync(zipPath)) {
        attachments.push({
            filename: `${booking.idNumber}_documents.zip`,
            path: zipPath,
            contentType: 'application/zip',
        });
    }

    const primary = isFestive ? '#C8102E' : '#FF6B35';
    const secondary = isFestive ? '#0B6E4F' : '#FF8B35';
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
    .badge { display: inline-block; background: ${isFestive ? '#D4AF37' : '#dc2626'}; color: ${isFestive ? '#3a2b00' : '#fff'}; padding: 4px 14px; border-radius: 20px; font-size: 13px; font-weight: 700; }
    .section { margin-bottom: 20px; }
    .section-title { color: ${dark}; font-size: 18px; font-weight: 700; border-bottom: 2px solid ${primary}; padding-bottom: 6px; margin-bottom: 12px; }
    .info-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #eee; }
    .info-label { color: #666; font-weight: 600; font-size: 14px; }
    .info-value { color: ${dark}; font-weight: 500; font-size: 14px; text-align: right; }
    .alert-box { background: #fee2e2; border-left: 4px solid #dc2626; padding: 15px; border-radius: 4px; margin: 20px 0; }
    .festive-box { background: #FFF8E7; border-left: 4px solid ${isFestive ? '#D4AF37' : primary}; padding: 14px 18px; border-radius: 4px; margin: 0 0 20px; }
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
    <h1>${isFestive ? '🎄 NEW FESTIVE BOOKING' : '📋 NEW BOOKING REQUEST'}</h1>
    <p style="color: rgba(255,255,255,0.9); margin: 0;">Action Required</p>
  </div>
    <div class="content">
      ${isFestive ? `
        <div class="festive-box">
          <p style="margin: 0; color: #7c2d12; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; font-size: 12px;">
            🎄 December ${booking.festiveYear ?? getFestiveYear()} Festive Offer
          </p>
          <p style="margin: 6px 0 0; color: #7c2d12; font-size: 13px;">
            Festive rates applied and validated server-side.
          </p>
        </div>` : ''}
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

      <div style="text-align: center; margin: 12px 0;">
        <a href="${process.env.BACKEND_URL || 'https://visiononecarhireservicesbackend-1.onrender.com'}/api/bookings/download-excel"
           style="display: inline-block; background: #059669; color: #fff; padding: 10px 25px; border-radius: 8px; text-decoration: none; font-weight: 600;">
          📊 Download Bookings Excel
        </a>
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
        from:
            process.env.EMAIL_FROM ||
            '"Vision One Services" <bookings@visiononecarhire.com>',
        to: process.env.ADMIN_EMAIL || 'visionwanservices@gmail.com',
        subject: `${isFestive ? '🎄 FESTIVE ' : ''}NEW BOOKING: ${booking.carType} - ${
            booking.customerName
        } (${booking.idNumber})${
            booking.estimatedTotal
                ? ` - KES ${booking.estimatedTotal.toLocaleString()}`
                : ''
        }`,
        html,
        attachments,
    };

    await transporter.sendMail(mailOptions);
    console.log(
        `📧 Admin notification sent for booking ${booking.id}` +
            (isFestive ? ` [FESTIVE DEC ${booking.festiveYear}]` : '')
    );
};

/* -----------------------------
   Enhanced Customer Confirmation
--------------------------------*/
export const sendCustomerConfirmation = async (
    booking: BookingData,
    zipPath: string | null
) => {
    const transporter = createTransporter();
    const pdfBuffer = await generateBookingPDF(booking);
    const isFestive = booking.bookingSeason === FESTIVE_SEASON_TAG;

    const attachments: any[] = [
        {
            filename: `booking-confirmation-${booking.id}.pdf`,
            content: pdfBuffer,
            contentType: 'application/pdf',
        },
    ];

    if (zipPath && fs.existsSync(zipPath)) {
        attachments.push({
            filename: `${booking.idNumber}_your_documents.zip`,
            path: zipPath,
            contentType: 'application/zip',
        });
    }

    const excelPath = getExcelPath();
    if (fs.existsSync(excelPath)) {
        attachments.push({
            filename: `bookings-${new Date().toISOString().slice(0, 10)}.xlsx`,
            path: excelPath,
            contentType:
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
    }

    const mailOptions = {
        from:
            process.env.EMAIL_FROM ||
            '"Vision One Services" <bookings@visiononecarhire.com>',
        to: booking.email,
        subject: `${isFestive ? '🎄' : '✅'} Booking Confirmed: ${booking.id} - Vision One Services`,
        html: generateEmailTemplate(booking),
        attachments,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(
        `✅ Confirmation email sent to ${booking.email}: ${info.messageId}`
    );
    return info;
};

/* -----------------------------
   Resend Booking Confirmation
--------------------------------*/
export const sendBookingConfirmation = async (req: Request, res: Response) => {
    try {
        const { bookingId } = req.body;

        if (!bookingId) {
            return res.status(400).json({
                success: false,
                error: 'bookingId is required',
            });
        }

        const booking = bookings.find((b) => b.id === bookingId);

        if (!booking) {
            return res.status(404).json({
                success: false,
                error: 'Booking not found',
            });
        }

        const zipPath = await createDocumentsZip(booking);
        await sendCustomerConfirmation(booking, zipPath);

        if (zipPath && fs.existsSync(zipPath)) {
            try {
                fs.unlinkSync(zipPath);
            } catch (cleanupErr) {
                console.warn(`Cleanup failed for ${zipPath}:`, cleanupErr);
            }
        }

        res.json({
            success: true,
            message: 'Confirmation email sent successfully',
        });
    } catch (error) {
        console.error('❌ Resend confirmation error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to resend confirmation email',
        });
    }
};