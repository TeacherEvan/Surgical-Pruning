/**
 * webResearch — keyless, dependency-free web search used by the Researcher
 * agents (Agent 2 + Agent 7) to ground their suggestions in real, cited
 * sources. Falls back to a static citation when the network is unavailable so
 * the pipeline never hard-fails offline.
 *
 * Implementation note: DuckDuckGo's HTML endpoint is used (no API key), the
 * redirect URLs are percent-decoded, and result links are unwrapped.
 */

export interface ResearchHit {
  title: string;
  url: string;
  snippet: string;
}

function decodeDdgRedirect(href: string): string {
  // DDG wraps results as //duckduckgo.com/l/?uddg=<encoded>&rut=...
  const m = href.match(/[?&]uddg=([^&]+)/);
  if (!m) return href.startsWith("//") ? "https:" + href : href;
  try {
    return decodeURIComponent(m[1]!);
  } catch {
    return href.startsWith("//") ? "https:" + href : href;
  }
}

/**
 * Run a web search and return up to `limit` real result hits. Returns [] on
 * any network failure (caller supplies a static fallback).
 *
 * Strategy: DuckDuckGo HTML first (broad web results). If it yields nothing
 * (rate-limited / blocked), fall back to Wikipedia's open search API, which is
 * stable and keyless, to still return a real, citable source.
 */
export async function webSearch(
  query: string,
  limit = 5,
  timeoutMs = 8000,
): Promise<ResearchHit[]> {
  const ddg = await ddgSearch(query, limit, timeoutMs);
  if (ddg.length > 0) return ddg;
  return wikipediaSearch(query, limit, timeoutMs);
}

async function ddgSearch(
  query: string,
  limit: number,
  timeoutMs: number,
): Promise<ResearchHit[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      },
      signal: controller.signal,
    });
    if (!res.ok) return [];
    const html = await res.text();
    const hits: ResearchHit[] = [];
    const linkRe = /class="result__a"[^>]*href="([^"]+)"[^>]*>([^<]*)</g;
    const snippetRe = /class="result__snippet"[^>]*>([^<]*)</g;
    const links: { url: string; title: string }[] = [];
    let lm: RegExpExecArray | null;
    while ((lm = linkRe.exec(html)) !== null) {
      links.push({
        url: decodeDdgRedirect(lm[1]!),
        title: lm[2]!.replace(/<[^>]+>/g, "").trim(),
      });
    }
    const snippets: string[] = [];
    let sm: RegExpExecArray | null;
    while ((sm = snippetRe.exec(html)) !== null) {
      snippets.push(sm[1]!.replace(/<[^>]+>/g, "").trim());
    }
    for (let i = 0; i < Math.min(links.length, limit); i++) {
      hits.push({
        title: links[i]!.title || links[i]!.url,
        url: links[i]!.url,
        snippet: snippets[i] ?? "",
      });
    }
    return hits;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

async function wikipediaSearch(
  query: string,
  limit: number,
  timeoutMs: number,
): Promise<ResearchHit[]> {
  const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
    query,
  )}&format=json&srlimit=${limit}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "surgical-pruning/0.1 (+research)" },
      signal: controller.signal,
    });
    if (!res.ok) return [];
    const json = (await res.json()) as {
      query?: { search?: Array<{ title: string; snippet: string }> };
    };
    const results = json.query?.search ?? [];
    return results.map((r) => ({
      title: r.title,
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(r.title.replace(/ /g, "_"))}`,
      snippet: r.snippet.replace(/<[^>]+>/g, ""),
    }));
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Convenience: return the first usable citation URL for a query, or a provided
 * static fallback when the network is unavailable / yields nothing.
 */
export async function cite(
  query: string,
  fallback: string,
  timeoutMs = 8000,
): Promise<string> {
  const hits = await webSearch(query, 3, timeoutMs);
  return hits.length > 0 ? hits[0]!.url : fallback;
}
