"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const bookingController_1 = require("../controllers/bookingController");
const router = express_1.default.Router();
router.post('/', bookingController_1.createBooking);
router.post('/send-confirmation', bookingController_1.sendBookingConfirmation);
exports.default = router;
//# sourceMappingURL=booking.js.map