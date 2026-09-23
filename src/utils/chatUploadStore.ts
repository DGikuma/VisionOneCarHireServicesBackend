import * as XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import { ChatUpload } from '../types/chatUpload';

const DATA_DIR = process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : path.resolve(process.cwd(), 'data');

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

const CHAT_UPLOAD_EXCEL = path.join(DATA_DIR, 'chat-uploads.xlsx');

const HEADERS = [
    'Reference ID',
    'Submitted At',
    'Name',
    'Email',
    'Phone',
    'Message',
    'File Count',
    'File Names',
    'Status',
];

export const getChatUploadExcelPath = () => CHAT_UPLOAD_EXCEL;

/* ────────────────────────────────────────────────────────────
   Ensure the workbook exists with proper headers
   ──────────────────────────────────────────────────────────── */
const ensureWorkbook = (): XLSX.WorkBook => {
    if (!fs.existsSync(CHAT_UPLOAD_EXCEL)) {
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet([HEADERS]);
        XLSX.utils.book_append_sheet(wb, ws, 'ChatUploads');
        XLSX.writeFile(wb, CHAT_UPLOAD_EXCEL);
        return wb;
    }
    return XLSX.readFile(CHAT_UPLOAD_EXCEL);
};

/* ────────────────────────────────────────────────────────────
   Append a new chat upload row
   ──────────────────────────────────────────────────────────── */
export const appendChatUploadToExcel = async (
    upload: ChatUpload
): Promise<void> => {
    const wb = ensureWorkbook();
    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];

    const existing: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

    existing.push({
        'Reference ID': upload.referenceId,
        'Submitted At': upload.submittedAt,
        Name: upload.name || '',
        Email: upload.email || '',
        Phone: upload.phone || '',
        Message: upload.message || '',
        'File Count': upload.files.length,
        'File Names': upload.files.map((f) => f.originalName).join(', '),
        Status: upload.status || 'new',
    });

    const newWs = XLSX.utils.json_to_sheet(existing, { header: HEADERS });
    wb.Sheets[sheetName] = newWs;

    XLSX.writeFile(wb, CHAT_UPLOAD_EXCEL);
};