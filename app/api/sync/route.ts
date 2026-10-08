import { isAuthorized } from "@/lib/syncLogic";
import { syncPublications } from "@/lib/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  if (!process.env.CRON_SECRET)
    return Response.json(
      { success: false, error: "Sync authorization is not configured." },
      { status: 503, headers },
    );
  if (
    !isAuthorized(request.headers.get("authorization"), process.env.CRON_SECRET)
  ) {
    return Response.json(
      { success: false, error: "Unauthorized" },
      { status: 401, headers },
    );
  }
  try {
    return Response.json(await syncPublications(), { headers });
  } catch {
    console.error(
      "Publication synchronization failed. Previous data was preserved. Check source availability and storage configuration.",
    );
    return Response.json(
      {
        success: false,
        error:
          "Synchronization could not finish. The previous dataset remains available.",
        timestamp: new Date().toISOString(),
      },
      { status: 503, headers },
    );
  }
}

export const POST = GET;
