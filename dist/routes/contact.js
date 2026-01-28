"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const contactController_1 = require("../controllers/contactController");
const router = express_1.default.Router();
// Submit a new contact inquiry
router.post('/contact', contactController_1.contactController.createContactInquiry);
// Get all contact inquiries (with optional filters)
router.get('/contact/inquiries', contactController_1.contactController.getContactInquiries);
// Get inquiry statistics
router.get('/contact/stats', contactController_1.contactController.getInquiryStats);
// Update inquiry status
router.patch('/contact/inquiries/:id/status', contactController_1.contactController.updateInquiryStatus);
exports.default = router;
//# sourceMappingURL=contact.js.map