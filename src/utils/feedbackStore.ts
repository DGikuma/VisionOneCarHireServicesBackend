import * as XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import { FeedbackData } from '../types/feedback';

const DATA_DIR = process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : path.resolve(process.cwd(), 'data');

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

const FEEDBACK_FILE = path.join(DATA_DIR, 'feedback.xlsx');

const HEADERS = [
    'ID',
    'Submitted At',
    'Name',
    'Email',
    'Phone',
    'Category',
    'Rating',
    'Message',
    'Status',
    'Page',
    'User Agent',
];

export const getFeedbackExcelPath = () => FEEDBACK_FILE;

/* ────────────────────────────────────────────────────────────
   Ensure the workbook + sheet exist with proper headers
   ──────────────────────────────────────────────────────────── */
const ensureWorkbook = (): XLSX.WorkBook => {
    if (!fs.existsSync(FEEDBACK_FILE)) {
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet([HEADERS]);
        XLSX.utils.book_append_sheet(wb, ws, 'Feedback');
        XLSX.writeFile(wb, FEEDBACK_FILE);
        return wb;
    }
    return XLSX.readFile(FEEDBACK_FILE);
};

/* ────────────────────────────────────────────────────────────
   Append a new feedback row
   ──────────────────────────────────────────────────────────── */
export const appendFeedbackToExcel = async (
    feedback: FeedbackData
): Promise<void> => {
    const wb = ensureWorkbook();
    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];

    // Convert existing sheet to JSON rows
    const existing: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

    // Append new row
    existing.push({
        ID: feedback.id || '',
        'Submitted At': feedback.submittedAt || new Date().toISOString(),
        Name: feedback.name || '',
        Email: feedback.email || '',
        Phone: feedback.phone || '',
        Category: feedback.category || '',
        Rating: feedback.rating || 0,
        Message: feedback.message || '',
        Status: feedback.status || 'new',
        Page: feedback.page || '',
        'User Agent': feedback.userAgent || '',
    });

    // Rewrite sheet from scratch
    const newWs = XLSX.utils.json_to_sheet(existing, { header: HEADERS });
    wb.Sheets[sheetName] = newWs;

    XLSX.writeFile(wb, FEEDBACK_FILE);
};

/* ────────────────────────────────────────────────────────────
   Update feedback status (e.g., mark as reviewed)
   ──────────────────────────────────────────────────────────── */
export const updateFeedbackStatus = async (
    feedbackId: string,
    status: FeedbackData['status']
): Promise<boolean> => {
    if (!fs.existsSync(FEEDBACK_FILE)) return false;

    const wb = XLSX.readFile(FEEDBACK_FILE);
    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];

    const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });
    let updated = false;

    rows.forEach((row) => {
        if (row.ID === feedbackId) {
            row.Status = status;
            updated = true;
        }
    });

    if (!updated) return false;

    const newWs = XLSX.utils.json_to_sheet(rows, { header: HEADERS });
    wb.Sheets[sheetName] = newWs;
    XLSX.writeFile(wb, FEEDBACK_FILE);

    return true;
};