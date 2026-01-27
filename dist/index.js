"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const dotenv_1 = __importDefault(require("dotenv"));
const booking_1 = __importDefault(require("./routes/booking"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 5000;
// Middleware
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)({
    origin: process.env.CLIENT_URL || 'https://visiononecarhireservices.onrender.com',
    credentials: true
}));
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
// Routes
app.use('/api/bookings', booking_1.default);
// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'Vision One Car Hire API is running' });
});
app.listen(PORT, () => {
    console.log(`🚗 Server running on port ${PORT}`);
});
//# sourceMappingURL=index.js.map