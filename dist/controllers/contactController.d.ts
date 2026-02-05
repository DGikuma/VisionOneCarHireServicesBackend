import { Request, Response } from 'express';
export declare const createContactInquiry: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const getContactInquiries: (req: Request, res: Response) => Promise<void>;
export declare const updateInquiryStatus: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const getInquiryStats: (req: Request, res: Response) => Promise<void>;
export declare const contactController: {
    createContactInquiry: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
    getContactInquiries: (req: Request, res: Response) => Promise<void>;
    updateInquiryStatus: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
    getInquiryStats: (req: Request, res: Response) => Promise<void>;
};
//# sourceMappingURL=contactController.d.ts.map