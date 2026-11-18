import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function probe(client: PrismaClient): Promise<{ ok: boolean; code: string | null; errorName: string | null }> {
  try {
    await client.$queryRaw`SELECT 1`;
    return { ok: true, code: null, errorName: null };
  } catch (error) {
    const candidate = error as { code?: unknown; errorCode?: unknown };
    return {
      ok: false,
      code: typeof candidate?.code === "string" ? candidate.code : typeof candidate?.errorCode === "string" ? candidate.errorCode : null,
      errorName: error instanceof Error ? error.name : "UnknownError",
    };
  }
}

export async function GET() {
  const pooled = await probe(prisma);
  let direct: { ok: boolean; code: string | null; errorName: string | null } | null = null;
  const directUrl = process.env.DIRECT_URL;
  if (directUrl) {
    const client = new PrismaClient({ datasources: { db: { url: directUrl } } });
    direct = await probe(client);
    await client.$disconnect().catch(() => undefined);
  }
  const connected = pooled.ok || direct?.ok === true;
  return NextResponse.json(
    { database: connected ? "connected" : "unavailable", pooled, direct: direct ?? { ok: false, code: null, errorName: "MissingDirectUrl" } },
    { status: connected ? 200 : 503 },
  );
}
