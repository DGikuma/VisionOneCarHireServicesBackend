import { Request, Response } from 'express';
export declare const createContactInquiry: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const getContactInquiries: (req: Request, res: Response) => Promise<void>;
export declare const updateInquiryStatus: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const getInquiryStats: (req: Request, res: Response) => Promise<void>;
export declare const getInquiryById: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const resendInquiryEmails: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const contactController: {
    createContactInquiry: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
    getContactInquiries: (req: Request, res: Response) => Promise<void>;
    getInquiryById: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
    updateInquiryStatus: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
    getInquiryStats: (req: Request, res: Response) => Promise<void>;
    resendInquiryEmails: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
};
//# sourceMappingURL=contactController.d.ts.map