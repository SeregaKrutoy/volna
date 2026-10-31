type ArchiveLocation = { d1?: string; d2?: string; server?: string; dir?: string };

/** Fetch only from Internet Archive, retrying an item's storage node if a redirect fails. */
export async function fetchArchiveAudio(id: string, file: string, range?: string | null): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  const headers = range ? { Range: range } : undefined;
  const mainUrl = `https://archive.org/download/${encodeURIComponent(id)}/${encodeURIComponent(file)}`;
  const get = async (url: string) => {
    try {
      return await fetch(url, { headers, signal: controller.signal, cache: "no-store" });
    } catch {
      return undefined;
    }
  };
  try {
    let response = await get(mainUrl);
    if (response?.ok || response?.status === 416) return response;
    await response?.body?.cancel().catch(() => undefined);
    try {
      const metadataResponse = await fetch(`https://archive.org/metadata/${encodeURIComponent(id)}`, { signal: controller.signal, next: { revalidate: 3600 } });
      const metadata: ArchiveLocation = await metadataResponse.json();
      const dir = metadata.dir || "";
      if (/^\/\d+\/items\/[\w.-]+$/.test(dir) && dir.endsWith(`/${id}`)) {
        const hosts = Array.from(new Set([metadata.d1, metadata.d2, metadata.server].filter((host): host is string => !!host && /^[\w.-]+\.archive\.org$/.test(host))));
        for (const host of hosts) {
          const path = file.split("/").map(encodeURIComponent).join("/");
          response = await get(`https://${host}${dir}/${path}`);
          if (response?.ok || response?.status === 416) return response;
          await response?.body?.cancel().catch(() => undefined);
        }
      }
    } catch {
      // Retry the public endpoint once even if metadata is temporarily unavailable.
    }
    response = await get(mainUrl);
    if (response?.ok || response?.status === 416) return response;
    await response?.body?.cancel().catch(() => undefined);
    throw new Error("Archive audio unavailable");
  } finally {
    clearTimeout(timer);
  }
}
