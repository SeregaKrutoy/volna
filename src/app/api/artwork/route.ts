import { isAllowedHitmosUrl } from "@/lib/hitmos";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const hitmosImageUrl = params.get("url") || "";
  const id = params.get("id") || "";

  if (hitmosImageUrl) {
    if (!isAllowedHitmosUrl(hitmosImageUrl)) {
      return new Response(null, { status: 400 });
    }
    try {
      const response = await fetch(hitmosImageUrl, {
        headers: {
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          referer: "https://rus.hitmos.fm/",
        },
        signal: AbortSignal.timeout(10000),
        next: { revalidate: 86400 },
      });
      if (!response.ok || !response.body) return new Response(null, { status: 404 });
      return new Response(response.body, {
        headers: {
          "Content-Type": response.headers.get("content-type") || "image/webp",
          "Cache-Control": "public, max-age=86400",
        },
      });
    } catch {
      return new Response(null, { status: 502 });
    }
  }

  if (!/^[\w.-]{1,200}$/.test(id)) return new Response(null, { status: 400 });
  try {
    const response = await fetch(`https://archive.org/services/img/${encodeURIComponent(id)}`, {
      signal: AbortSignal.timeout(12000),
      next: { revalidate: 86400 },
    });
    if (!response.ok || !response.body) return new Response(null, { status: 404 });
    return new Response(response.body, {
      headers: {
        "Content-Type": response.headers.get("content-type") || "image/jpeg",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return new Response(null, { status: 502 });
  }
}
