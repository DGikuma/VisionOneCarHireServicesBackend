"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const contactController_1 = require("../controllers/contactController");
const router = express_1.default.Router();
/**
 * @swagger
 * tags:
 *   name: Contacts
 *   description: Contact inquiry management
 */
/**
 * @swagger
 * components:
 *   schemas:
 *     ContactInquiry:
 *       type: object
 *       required:
 *         - name
 *         - email
 *         - message
 *       properties:
 *         name:
 *           type: string
 *           description: Name of the person
 *         email:
 *           type: string
 *           format: email
 *         message:
 *           type: string
 *           description: Inquiry message
 *         status:
 *           type: string
 *           description: Inquiry status (pending/resolved)
 */
/**
 * @swagger
 * /api/contact/contact:
 *   post:
 *     summary: Submit a new contact inquiry
 *     tags: [Contacts]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ContactInquiry'
 *     responses:
 *       201:
 *         description: Inquiry submitted successfully
 *       400:
 *         description: Validation error
 */
router.post('/contact', contactController_1.contactController.createContactInquiry);
/**
 * @swagger
 * /api/contact/contact/inquiries:
 *   get:
 *     summary: Get all contact inquiries
 *     tags: [Contacts]
 *     responses:
 *       200:
 *         description: List of contact inquiries
 */
router.get('/contact/inquiries', contactController_1.contactController.getContactInquiries);
/**
 * @swagger
 * /api/contact/contact/stats:
 *   get:
 *     summary: Get statistics for inquiries
 *     tags: [Contacts]
 *     responses:
 *       200:
 *         description: Inquiry statistics
 */
router.get('/contact/stats', contactController_1.contactController.getInquiryStats);
/**
 * @swagger
 * /api/contact/contact/inquiries/{id}/status:
 *   patch:
 *     summary: Update status of a contact inquiry
 *     tags: [Contacts]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: Inquiry ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 description: New status (pending/resolved)
 *     responses:
 *       200:
 *         description: Inquiry status updated
 *       400:
 *         description: Invalid input
 */
router.patch('/contact/inquiries/:id/status', contactController_1.contactController.updateInquiryStatus);
exports.default = router;
//# sourceMappingURL=contact.js.map