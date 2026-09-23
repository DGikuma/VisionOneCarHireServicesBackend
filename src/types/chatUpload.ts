export interface ChatUpload {
    id: string;
    referenceId: string;
    name: string;
    email: string;
    phone?: string;
    message: string;
    files: UploadedFileMeta[];
    submittedAt: string;
    ipAddress?: string;
    userAgent?: string;
    status?: 'new' | 'reviewed' | 'archived';
}

export interface UploadedFileMeta {
    originalName: string;
    storedName: string;
    storedPath: string;
    size: number;
    mimeType: string;
}