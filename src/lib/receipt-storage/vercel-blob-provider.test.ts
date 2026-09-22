import { beforeEach, describe, expect, it, vi } from "vitest";

const { getMock, putMock, delMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  putMock: vi.fn(),
  delMock: vi.fn(),
}));

vi.mock("@vercel/blob", () => ({ get: getMock, put: putMock, del: delMock }));

import { VercelBlobReceiptStorageProvider } from "./vercel-blob-provider";

describe("private Vercel Blob receipt reads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.BLOB_READ_WRITE_TOKEN;
  });

  it("reads private Blob data server-side while allowing Vercel OIDC fallback", async () => {
    getMock.mockResolvedValue({
      statusCode: 200,
      blob: { contentType: "image/png" },
      stream: new Blob([new Uint8Array([1, 2, 3])]).stream(),
    });

    const result = await new VercelBlobReceiptStorageProvider().download("expense-receipts/receipt.png");

    expect(getMock).toHaveBeenCalledWith("expense-receipts/receipt.png", {
      access: "private",
      token: undefined,
      useCache: false,
    });
    expect(Array.from(new Uint8Array(result.data))).toEqual([1, 2, 3]);
  });

  it("passes an explicit read-write token when configured without logging or returning it", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "private-test-token";
    getMock.mockRejectedValue(new Error("token rejected"));

    await expect(new VercelBlobReceiptStorageProvider().download("expense-receipts/receipt.png")).rejects.toThrow("Receipt storage credentials are not available");
    expect(getMock.mock.calls[0][1].token).toBe("private-test-token");
  });
});
