import multer from 'multer';
import path from 'path';
import fs from 'fs';

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        // Get ID number from request body
        const idNumber = req.body.idNumber || 'unknown';
        const timestamp = Date.now();
        const originalName = file.originalname;
        const ext = path.extname(originalName);
        const nameWithoutExt = path.basename(originalName, ext);

        // Create filename with ID number and timestamp
        const filename = `${idNumber}_${nameWithoutExt}_${timestamp}${ext}`;
        cb(null, filename);
    }
});

// File filter
const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    const allowedTypes = /jpeg|jpg|png|pdf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (extname && mimetype) {
        return cb(null, true);
    } else {
        cb(new Error('Only .jpeg, .jpg, .png, and .pdf files are allowed'));
    }
};

// Limits
const limits = {
    fileSize: 10 * 1024 * 1024, // 10MB max file size
};

// Create upload middleware (files are OPTIONAL)
export const upload = multer({
    storage,
    fileFilter,
    limits
}).any();

// Helper to get file paths
export const getFilePaths = (files: any, idNumber: string) => {
    const paths: { [key: string]: string } = {};

    if (files.idDocument && files.idDocument[0]) {
        paths.idDocument = files.idDocument[0].path;
    }
    if (files.drivingLicense && files.drivingLicense[0]) {
        paths.drivingLicense = files.drivingLicense[0].path;
    }
    if (files.depositProof && files.depositProof[0]) {
        paths.depositProof = files.depositProof[0].path;
    }

    return paths;
};