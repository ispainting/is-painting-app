import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function databaseErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const candidate = error as { code?: unknown; errorCode?: unknown; cause?: unknown };
  if (typeof candidate.code === "string") return candidate.code;
  if (typeof candidate.errorCode === "string") return candidate.errorCode;
  return candidate.cause ? databaseErrorCode(candidate.cause) : null;
}

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ database: "connected" });
  } catch (error) {
    return NextResponse.json(
      { database: "unavailable", code: databaseErrorCode(error) },
      { status: 503 },
    );
  }
}
