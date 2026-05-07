/**
 * Brighton Sea Scouts — Pages Function Middleware (Phase 3B)
 *
 * Intercepts HTML responses and replaces SaySite template markers with
 * live content from D1. This is the "render" layer of the Tier 1 fast path:
 * the Worker writes to D1, and this function serves the updated content on
 * every request — no rebuild required.
 *
 * Template marker syntax (in HTML files):
 *   <!-- ss:section_name -->current value<!-- /ss:section_name -->
 *
 * The text between the markers is replaced with the D1 value for that section.
 * If no D1 value exists, the existing HTML content is left unchanged.
 *
 * D1 binding required: `saysite_db` → database_id in wrangler.toml
 */

interface Env {
  saysite_db: D1Database;
}

const ORG_ID = "brighton-scouts";

// Regex to find all <!-- ss:key -->...<!-- /ss:key --> markers
const MARKER_RE = /<!-- ss:([\w_]+) -->(.*?)<!-- \/ss:\1 -->/gs;

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, next, env } = context;
  const url = new URL(request.url);

  // Only process HTML page requests — pass assets through untouched
  const pathname = url.pathname;
  const isHtml =
    pathname.endsWith(".html") ||
    pathname === "/" ||
    !pathname.includes(".");

  if (!isHtml) {
    return next();
  }

  // Get the static HTML from Pages
  const response = await next();

  // Only process successful HTML responses
  const contentType = response.headers.get("Content-Type") ?? "";
  if (!response.ok || !contentType.includes("text/html")) {
    return response;
  }

  // Read the HTML
  const html = await response.text();

  // Check if there are any markers to replace
  if (!html.includes("<!-- ss:")) {
    return new Response(html, response);
  }

  // Load all content_values for this org from D1
  let contentMap: Record<string, string> = {};
  try {
    const result = await env.saysite_db
      .prepare(
        `SELECT section_name, value FROM content_values WHERE org_id = ?1`
      )
      .bind(ORG_ID)
      .all<{ section_name: string; value: string }>();

    for (const row of result.results) {
      contentMap[row.section_name] = row.value;
    }
  } catch (err) {
    // D1 unavailable — serve static content unchanged
    console.error("D1 read failed in middleware:", err);
    return new Response(html, response);
  }

  // Replace markers with D1 values.
  // Output: bare value only — no markers in the served HTML.
  // This keeps href="mailto:..." attributes clean (markers are only in source files).
  const updated = html.replace(
    MARKER_RE,
    (_match, sectionName: string, fallbackValue: string) => {
      const d1Value = contentMap[sectionName];
      // Use D1 value if present, otherwise the fallback baked into the source HTML
      return d1Value !== undefined ? d1Value : fallbackValue;
    }
  );

  return new Response(updated, {
    status: response.status,
    headers: response.headers,
  });
};
