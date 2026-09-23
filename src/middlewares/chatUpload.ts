import multer from 'multer';
import path from 'path';
import fs from 'fs';

const CHAT_UPLOAD_DIR = process.env.CHAT_UPLOAD_DIR
    ? path.resolve(process.env.CHAT_UPLOAD_DIR)
    : process.env.DATA_DIR
    ? path.join(path.resolve(process.env.DATA_DIR), 'chat-uploads')
    : path.resolve(process.cwd(), 'chat-uploads');

if (!fs.existsSync(CHAT_UPLOAD_DIR)) {
    fs.mkdirSync(CHAT_UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, CHAT_UPLOAD_DIR);
    },
    filename: (_req, file, cb) => {
        const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        const ext = path.extname(file.originalname);
        const baseName = path
            .basename(file.originalname, ext)
            .replace(/[^a-zA-Z0-9-_]/g, '_')
            .slice(0, 40);
        cb(null, `${baseName}-${uniqueSuffix}${ext}`);
    },
});

const ALLOWED_MIME_TYPES = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/heic',
    'image/heif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'application/zip',
];

export const chatUpload = multer({
    storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10 MB per file
        files: 5, // Max 5 files
    },
    fileFilter: (_req, file, cb) => {
        if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error(`File type not allowed: ${file.mimetype}`));
        }
    },
}).array('files', 5);

export const getChatUploadDir = () => CHAT_UPLOAD_DIR;