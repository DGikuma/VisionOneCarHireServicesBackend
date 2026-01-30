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
}
export type BookingStatus = 'pending' | 'confirmed' | 'cancelled';
//# sourceMappingURL=booking.d.ts.map