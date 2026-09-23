import express, { Request, Response } from 'express';
import { chatUpload } from '../middlewares/chatUpload';
import { createChatUpload } from '../controllers/chatUploadController';
import { getChatUploadExcelPath } from '../utils/chatUploadStore';
import fs from 'fs';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: ChatUpload
 *   description: WhatsApp chat file uploads
 */

/* ────────────────────────────────────────────────────────────
   POST /api/chat-uploads — Submit a chat upload
   ──────────────────────────────────────────────────────────── */
router.post('/', chatUpload, createChatUpload);

/* ────────────────────────────────────────────────────────────
   GET /api/chat-uploads/health
   ──────────────────────────────────────────────────────────── */
router.get('/health', (_req: Request, res: Response) => {
    res.json({
        status: 'healthy',
        service: 'Chat Upload API',
        timestamp: new Date().toISOString(),
    });
});

/* ────────────────────────────────────────────────────────────
   GET /api/chat-uploads/download-excel
   ──────────────────────────────────────────────────────────── */
router.get('/download-excel', (_req: Request, res: Response) => {
    try {
        const excelPath = getChatUploadExcelPath();
        if (!fs.existsSync(excelPath)) {
            return res.status(404).json({ success: false, error: 'No uploads yet' });
        }
        res.download(excelPath, 'chat-uploads.xlsx');
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to download' });
    }
});

/* ────────────────────────────────────────────────────────────
   GET /api/chat-uploads — API info
   ──────────────────────────────────────────────────────────── */
router.get('/', (_req: Request, res: Response) => {
    res.json({
        message: 'Vision Wan Chat Upload API',
        version: '1.0.0',
        endpoints: [
            { method: 'POST', path: '/api/chat-uploads', description: 'Upload files + message' },
            { method: 'GET',  path: '/api/chat-uploads/health', description: 'Health check' },
            { method: 'GET',  path: '/api/chat-uploads/download-excel', description: 'Download Excel' },
        ],
        status: 'operational',
        timestamp: new Date().toISOString(),
    });
});

export default router;