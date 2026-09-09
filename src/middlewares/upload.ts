import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { Request } from 'express';

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure storage
const storage = multer.diskStorage({
    destination: (req: Request, file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) => {
        cb(null, uploadsDir);
    },
    filename: (req: Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
        const idNumber = (req.body as any).idNumber || 'unknown';
        const timestamp = Date.now();
        const originalName = file.originalname;
        const ext = path.extname(originalName);
        const nameWithoutExt = path.basename(originalName, ext);

        const filename = `${idNumber}_${nameWithoutExt}_${timestamp}${ext}`;
        cb(null, filename);
    }
});

// ✅ UPDATED: Better file filter with logging
const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    console.log(`📁 Processing file: ${file.originalname}`);
    console.log(`📁 Field name: ${file.fieldname}`);
    console.log(`📁 MIME type: ${file.mimetype}`);
    
    // Allowed MIME types
    const allowedMimeTypes = [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/webp',
        'application/pdf'
    ];
    
    // Allowed extensions
    const allowedExtensions = /\.(jpeg|jpg|png|webp|pdf)$/i;
    
    // Check file extension
    const extname = allowedExtensions.test(path.extname(file.originalname).toLowerCase());
    
    // Check MIME type
    const mimetype = allowedMimeTypes.includes(file.mimetype);
    
    // Allow ALL field names since we're using .any() and want all files
    // But we can log which fields are being uploaded
    const allowedFields = ['idDocument', 'drivingLicense', 'drivingLicence', 'depositProof'];
    const fieldAllowed = allowedFields.includes(file.fieldname);
    
    if (!fieldAllowed) {
        console.log(`⚠️ Unknown field: ${file.fieldname}, but accepting anyway`);
    }

    if (extname && mimetype) {
        console.log(`✅ File accepted: ${file.originalname}`);
        return cb(null, true);
    } else {
        console.log(`❌ File rejected: ${file.originalname}`);
        console.log(`   Extension check: ${extname}, MIME check: ${mimetype}`);
        cb(new Error(`Only .jpeg, .jpg, .png, .webp, and .pdf files are allowed. Received: ${file.originalname}`));
    }
};

// Limits
const limits = {
    fileSize: 10 * 1024 * 1024, // 10MB max file size
};

// Create upload middleware
export const upload = multer({
    storage,
    fileFilter,
    limits
}).any();

// Helper to get file paths - SUPPORT BOTH FIELD NAMES
export const getFilePaths = (files: any, idNumber: string) => {
    const paths: { [key: string]: string } = {};

    // Check for ID document (both possible field names)
    if (files.idDocument && files.idDocument[0]) {
        paths.idDocument = files.idDocument[0].path;
    }
    if (files.idDoc && files.idDoc[0]) {
        paths.idDocument = files.idDoc[0].path;
    }
    
    // Check for Driving License (both possible field names)
    if (files.drivingLicense && files.drivingLicense[0]) {
        paths.drivingLicense = files.drivingLicense[0].path;
    }
    if (files.drivingLicence && files.drivingLicence[0]) {
        paths.drivingLicense = files.drivingLicence[0].path;
    }
    
    // Check for Deposit Proof
    if (files.depositProof && files.depositProof[0]) {
        paths.depositProof = files.depositProof[0].path;
    }

    return paths;
};