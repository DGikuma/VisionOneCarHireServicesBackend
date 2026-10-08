export type TripType = 'flight' | 'flight-hotel' | 'safari';

export interface Traveller {
    fullName: string;
    age: string | number;
}

export interface HotelDetails {
    /** City where the hotel is located (usually same as arrival city). */
    city: string;
    /** ISO date — auto-synced from flight arrival. */
    checkIn: string;
    /** ISO date — auto-synced from flight departure. */
    checkOut: string;
    /** Number of rooms requested. */
    rooms: number;
    /** Star rating preference. */
    starPreference: '3' | '4' | '5' | 'any';
    /** Optional hotel name or brand preference. */
    preferredHotel?: string;
}

export interface TravelEnquiryData {
    id?: string;
    tripType: TripType;

    // Flight fields
    fromCity?: string;
    toCity?: string;

    // Shared fields
    departDate: string;
    returnDate: string;
    flexibleBefore?: boolean;
    flexibleAfter?: boolean;

    // Safari fields
    safariTourId?: string;

    // ✅ NEW — Flight + Hotel fields
    hotel?: HotelDetails;

    // Travellers
    travellers: Traveller[];

    // Contact
    contactName: string;
    contactPhone: string;
    contactEmail: string;
    nationality?: string;
    specialRequests?: string;

    // Meta
    submittedAt?: string;
    status?: 'received' | 'quoted' | 'booked' | 'cancelled';
    source?: string;
}

export type TravelEnquiryStatus = 'received' | 'quoted' | 'booked' | 'cancelled';

export interface TravelEnquiryResponse {
    success: boolean;
    message?: string;
    enquiry?: TravelEnquiryData;
    error?: string;
}