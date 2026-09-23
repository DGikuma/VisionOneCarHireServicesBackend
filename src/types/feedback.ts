export interface FeedbackData {
    id?: string;
    name: string;
    email: string;
    phone?: string;
    category: string;
    rating: number;
    message: string;
    submittedAt?: string;
    status?: 'new' | 'reviewed' | 'resolved';
    userAgent?: string;
    page?: string;
}

export type FeedbackStatus = 'new' | 'reviewed' | 'resolved';