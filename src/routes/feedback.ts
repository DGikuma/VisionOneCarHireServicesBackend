import express, { Request, Response } from 'express';
import {
    createFeedback,
} from '../controllers/feedbackController';
import {
    getFeedbackExcelPath,
    updateFeedbackStatus,
} from '../utils/feedbackStore';
import fs from 'fs';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Feedback
 *   description: Customer feedback collection and management
 */

/**
 * @swagger
 * /api/feedback:
 *   post:
 *     summary: Submit customer feedback
 *     tags: [Feedback]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - email
 *               - category
 *               - rating
 *               - message
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Jane Doe"
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "jane@example.com"
 *               phone:
 *                 type: string
 *                 example: "+254705336311"
 *               category:
 *                 type: string
 *                 example: "car-hire"
 *               rating:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 5
 *                 example: 5
 *               message:
 *                 type: string
 *                 example: "Excellent service and very professional!"
 *     responses:
 *       201:
 *         description: Feedback submitted successfully
 *       400:
 *         description: Validation failed
 *       500:
 *         description: Server error
 */
router.post('/', createFeedback);

/**
 * @swagger
 * /api/feedback/health:
 *   get:
 *     summary: Check feedback API health
 *     tags: [Feedback]
 */
router.get('/health', (_req: Request, res: Response) => {
    res.json({
        status: 'healthy',
        service: 'Feedback API',
        timestamp: new Date().toISOString(),
    });
});

/**
 * @swagger
 * /api/feedback/download-excel:
 *   get:
 *     summary: Download all feedback as Excel
 *     tags: [Feedback]
 */
router.get('/download-excel', (_req: Request, res: Response) => {
    try {
        const excelPath = getFeedbackExcelPath();
        if (!fs.existsSync(excelPath)) {
            return res.status(404).json({ success: false, error: 'No feedback yet' });
        }
        res.download(excelPath, 'feedback.xlsx');
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to download feedback' });
    }
});

/**
 * @swagger
 * /api/feedback/status/{id}:
 *   patch:
 *     summary: Update feedback status
 *     tags: [Feedback]
 */
router.patch('/status/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!['new', 'reviewed', 'resolved'].includes(status)) {
            return res.status(400).json({ success: false, error: 'Invalid status' });
        }

        const updated = await updateFeedbackStatus(id, status);

        if (!updated) {
            return res.status(404).json({ success: false, error: 'Feedback not found' });
        }

        res.json({ success: true, message: 'Status updated' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to update status' });
    }
});

/**
 * @swagger
 * /api/feedback:
 *   get:
 *     summary: Feedback API information
 *     tags: [Feedback]
 */
router.get('/', (_req: Request, res: Response) => {
    res.json({
        message: 'Vision Wan Feedback API',
        version: '1.0.0',
        endpoints: [
            { method: 'POST',  path: '/api/feedback',                description: 'Submit feedback' },
            { method: 'GET',   path: '/api/feedback/health',         description: 'Check API health' },
            { method: 'GET',   path: '/api/feedback/download-excel', description: 'Download all feedback' },
            { method: 'PATCH', path: '/api/feedback/status/:id',     description: 'Update feedback status' },
        ],
        status: 'operational',
        timestamp: new Date().toISOString(),
    });
});

export default router;