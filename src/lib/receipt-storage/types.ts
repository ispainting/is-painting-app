export type ReceiptObject = {
  objectKey: string;
  contentType: string;
  data: ArrayBuffer;
};

export type UploadReceiptInput = {
  objectKey: string;
  data: ArrayBuffer;
  contentType: string;
  originalFilename: string;
};

export type UploadReceiptResult = {
  objectKey: string;
  providerUrl?: string;
};

export type ReplaceReceiptInput = {
  oldObjectKey: string;
  newObjectKey: string;
  data: ArrayBuffer;
  contentType: string;
  originalFilename: string;
};

export type GetProtectedUrlInput = {
  objectKey: string;
  disposition: "inline" | "attachment";
  filename?: string;
};

export interface ReceiptStorageProvider {
  upload(input: UploadReceiptInput): Promise<UploadReceiptResult>;
  download(objectKey: string): Promise<ReceiptObject>;
  preview(objectKey: string): Promise<ReceiptObject>;
  delete(objectKey: string): Promise<void>;
  replace(input: ReplaceReceiptInput): Promise<UploadReceiptResult>;
  getProtectedUrl(input: GetProtectedUrlInput): Promise<string | null>;
}
