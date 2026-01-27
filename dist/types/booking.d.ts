export interface BookingData {
    id?: string;
    customerName: string;
    email: string;
    phone: string;
    pickupDate: string;
    returnDate: string;
    carType: 'economy' | 'compact' | 'mid-size' | 'suv' | 'luxury' | 'van';
    pickupLocation?: string;
    dropoffLocation?: string;
    additionalInfo?: string;
    bookingDate?: string;
    status?: string;
}
//# sourceMappingURL=booking.d.ts.map