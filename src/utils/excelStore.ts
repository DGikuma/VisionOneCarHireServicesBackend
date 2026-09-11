import ExcelJS from 'exceljs';
import fs from 'fs';
import path from 'path';

const STORAGE_DIR = path.resolve(process.cwd(), 'storage');
const EXCEL_PATH = path.join(STORAGE_DIR, 'bookings.xlsx');

// Ensure storage directory exists
if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
}

// Column definition (order matters — matches the header row)
const COLUMNS = [
    { header: 'Booking ID', key: 'id', width: 18 },
    { header: 'Booking Date', key: 'bookingDate', width: 24 },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'Customer Name', key: 'customerName', width: 22 },
    { header: 'Email', key: 'email', width: 26 },
    { header: 'Phone', key: 'phone', width: 18 },
    { header: 'Nationality', key: 'nationality', width: 14 },
    { header: 'ID Type', key: 'idType', width: 10 },
    { header: 'ID Number', key: 'idNumber', width: 16 },
    { header: 'Vehicle', key: 'carType', width: 16 },
    { header: 'Pickup Location', key: 'pickupLocation', width: 22 },
    { header: 'Drop-off Location', key: 'dropoffLocation', width: 22 },
    { header: 'Pickup Date', key: 'pickupDate', width: 14 },
    { header: 'Return Date', key: 'returnDate', width: 14 },
    { header: 'Rental Days', key: 'rentalDays', width: 12 },
    { header: 'Period Category', key: 'periodCategory', width: 16 },
    { header: 'Daily Rate (KES)', key: 'dailyRate', width: 16 },
    { header: 'Estimated Total (KES)', key: 'estimatedTotal', width: 20 },
    { header: 'Additional Info', key: 'additionalInfo', width: 32 },
    { header: 'Terms Accepted', key: 'termsAccepted', width: 14 },
    { header: 'ID Document', key: 'idDocumentPath', width: 30 },
    { header: 'Driving License', key: 'drivingLicensePath', width: 30 },
    { header: 'Deposit Proof', key: 'depositProofPath', width: 30 },
];

/**
 * Load (or create) the workbook.
 */
async function loadWorkbook(): Promise<ExcelJS.Workbook> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Vision One Services';
    workbook.created = new Date();

    if (fs.existsSync(EXCEL_PATH)) {
        await workbook.xlsx.readFile(EXCEL_PATH);
    } else {
        // Create a new workbook with a styled header row
        const sheet = workbook.addWorksheet('Bookings');
        sheet.columns = COLUMNS;

        // Style the header row
        const headerRow = sheet.getRow(1);
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
        headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
        headerRow.height = 22;
        headerRow.eachCell((cell) => {
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFFF6B35' }, // brand orange
            };
            cell.border = {
                top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
            };
        });

        // Freeze header row
        sheet.views = [{ state: 'frozen', ySplit: 1 }];

        // Auto-filter
        sheet.autoFilter = {
            from: { row: 1, column: 1 },
            to: { row: 1, column: COLUMNS.length },
        };

        await workbook.xlsx.writeFile(EXCEL_PATH);
    }

    return workbook;
}

/**
 * Sanitize a value so Excel doesn't interpret it as a formula.
 */
function sanitize(value: any): any {
    if (value === undefined || value === null) return '';
    if (typeof value === 'string' && /^[=+\-@]/.test(value)) {
        return `'${value}`;
    }
    return value;
}

/**
 * Append a new booking row to the Excel file.
 */
export async function appendBookingToExcel(booking: any): Promise<void> {
    const workbook = await loadWorkbook();

    let sheet = workbook.getWorksheet('Bookings');
    if (!sheet) {
        sheet = workbook.addWorksheet('Bookings');
        sheet.columns = COLUMNS;
    }

    const rowData = {
        id: sanitize(booking.id),
        bookingDate: sanitize(booking.bookingDate),
        status: sanitize(booking.status || 'confirmed'),
        customerName: sanitize(booking.customerName),
        email: sanitize(booking.email),
        phone: sanitize(booking.phone),
        nationality: sanitize(booking.nationality),
        idType: sanitize(booking.idType),
        idNumber: sanitize(booking.idNumber),
        carType: sanitize(booking.carType),
        pickupLocation: sanitize(booking.pickupLocation),
        dropoffLocation: sanitize(booking.dropoffLocation),
        pickupDate: sanitize(booking.pickupDate),
        returnDate: sanitize(booking.returnDate),
        rentalDays: sanitize(booking.rentalDays),
        periodCategory: sanitize(booking.periodCategory),
        dailyRate: sanitize(booking.dailyRate),
        estimatedTotal: sanitize(booking.estimatedTotal),
        additionalInfo: sanitize(booking.additionalInfo),
        termsAccepted: booking.termsAccepted ? 'Yes' : 'No',
        idDocumentPath: sanitize(booking.idDocumentPath),
        drivingLicensePath: sanitize(booking.drivingLicensePath),
        depositProofPath: sanitize(booking.depositProofPath),
    };

    const row = sheet.addRow(rowData);

    // Alternating row color
    const rowIndex = sheet.rowCount;
    if (rowIndex % 2 === 0) {
        row.eachCell((cell) => {
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFFFF7ED' },
            };
        });
    }

    // Cell borders
    row.eachCell((cell) => {
        cell.border = {
            top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
            left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
            bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
            right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        };
        cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
    });

    row.commit();

    await workbook.xlsx.writeFile(EXCEL_PATH);
    console.log(`📊 Booking ${booking.id} appended to Excel`);
}

/**
 * Find a booking by email OR booking ID.
 * Returns the row number and the booking data.
 */
export async function findBookingInExcel(
    lookup: { bookingId?: string; email?: string }
): Promise<{ rowNumber: number; data: any } | null> {
    if (!fs.existsSync(EXCEL_PATH)) return null;

    const workbook = await loadWorkbook();
    const sheet = workbook.getWorksheet('Bookings');
    if (!sheet) return null;

    let foundRow: ExcelJS.Row | null = null;

    sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; // skip header

        const bookingId = row.getCell(1).value?.toString().trim();
        const email = row.getCell(5).value?.toString().trim().toLowerCase();

        if (
            (lookup.bookingId && bookingId === lookup.bookingId) ||
            (lookup.email && email === lookup.email.toLowerCase())
        ) {
            foundRow = row;
        }
    });

    if (!foundRow) return null;

    const row = foundRow as ExcelJS.Row;
    const data: any = {};
    COLUMNS.forEach((col, idx) => {
        data[col.key] = row.getCell(idx + 1).value;
    });

    return { rowNumber: row.number, data };
}

/**
 * Delete a booking by row number.
 */
export async function deleteBookingFromExcel(rowNumber: number): Promise<void> {
    const workbook = await loadWorkbook();
    const sheet = workbook.getWorksheet('Bookings');
    if (!sheet) return;

    sheet.spliceRows(rowNumber, 1);
    await workbook.xlsx.writeFile(EXCEL_PATH);
    console.log(`🗑️ Row ${rowNumber} removed from Excel`);
}

/**
 * Update a booking: delete old row + append new one.
 */
export async function updateBookingInExcel(
    lookup: { bookingId?: string; email?: string },
    newBooking: any
): Promise<void> {
    const existing = await findBookingInExcel(lookup);
    if (existing) {
        await deleteBookingFromExcel(existing.rowNumber);
    }
    await appendBookingToExcel(newBooking);
    console.log(`♻️ Booking updated in Excel`);
}

/**
 * Get the absolute path to the Excel file.
 */
export function getExcelPath(): string {
    return EXCEL_PATH;
}