import { Request, Response } from 'express';
interface BookingData {
    id: string;
    customerName: string;
    email: string;
    phone: string;
    pickupDate: string;
    returnDate: string;
    carType: string;
    pickupLocation: string;
    dropoffLocation?: string;
    additionalInfo?: string;
    idNumber: string;
    idType: 'id' | 'passport' | 'national_id';
    termsAccepted: boolean;
    bookingDate: string;
    status: string;
    idDocumentPath?: string;
    drivingLicensePath?: string;
    depositProofPath?: string;
}
declare const bookings: BookingData[];
export declare const createBooking: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const sendBookingConfirmation: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export { bookings };
//# sourceMappingURL=bookingController.d.ts.map