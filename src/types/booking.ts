export interface BookingData {
    id?: string;
    customerName: string;
    email: string;
    phone: string;
    pickupDate: string;
    returnDate: string;
    carType: string;
    pickupLocation: string;
    dropoffLocation?: string;
    additionalInfo?: string;
    bookingDate?: string;
    status?: 'pending' | 'confirmed' | 'cancelled';

    // New fields
    idNumber: string;
    idType: 'id' | 'passport';
    termsAccepted: boolean;

    // File paths (will be stored on server)
    idDocumentPath?: string;
    drivingLicensePath?: string;
    depositProofPath?: string;
}

export type BookingStatus = 'pending' | 'confirmed' | 'cancelled';

// New interface for file uploads
export interface UploadedFiles {
    idDocument?: Express.Multer.File[];
    drivingLicense?: Express.Multer.File[];
    depositProof?: Express.Multer.File[];
}