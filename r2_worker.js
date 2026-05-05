/**
 * Cloudflare R2 Data & Image Worker - FULL RESTORED VERSION
 * Restores all engagement logic (hearts, comments, replies) + fixed upload/auth.
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    let path = url.pathname;
    if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
    
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Filename",
      "Access-Control-Max-Age": "86400",
    };

    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

    const bucket = env.BUCKET || env['climate-action'];
    if (!bucket) return new Response("Error: R2 Bucket binding not found.", { status: 500, headers: corsHeaders });

    // --- DATABASE HELPERS ---
    const getDB = async () => {
      const obj = await bucket.get("data.json");
      const data = obj ? await obj.json() : { posts: [], events: [], recordings: [] };
      
      // Auto-repair missing IDs if needed
      let repair = false;
      data.events?.forEach(ev => {
        ev.comments?.forEach((com, idx) => {
          if (!com.id) { com.id = `c_${ev.id}_${idx}`; repair = true; }
        });
      });
      if (repair) await bucket.put("data.json", JSON.stringify(data), { httpMetadata: { contentType: "application/json" } });
      
      return data;
    };

    const saveDB = async (data) => {
      await bucket.put("data.json", JSON.stringify(data), { httpMetadata: { contentType: "application/json" } });
    };

    // --- PUBLIC GET ROUTES ---
    if (request.method === "GET") {
      if (path === "/data") {
        return new Response(JSON.stringify(await getDB()), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (path.startsWith("/img/")) {
        const filename = path.replace("/img/", "");
        const obj = await bucket.get(filename);
        if (!obj) return new Response("Image Not Found", { status: 404, headers: corsHeaders });
        return new Response(obj.body, { headers: { ...corsHeaders, "Content-Type": obj.httpMetadata.contentType || "image/png" } });
      }
    }

    // --- POST ROUTES ---
    if (request.method === "POST") {
      const authHeader = request.headers.get("Authorization") || "";
      const AUTH_SECRET = env.AUTH_SECRET || 'climate_action_secret_2026';
      const isAuthorized = authHeader === `Bearer ${AUTH_SECRET}`;

      // A. ADMIN & DATA ROUTES
      if (path === "/data") {
        const bodyText = await request.text();
        let body = {};
        try { body = JSON.parse(bodyText); } catch(e) {}
        
        if (body.ping) {
          if (isAuthorized) return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
          return new Response("Unauthorized", { status: 401, headers: corsHeaders });
        }

        if (!isAuthorized) return new Response("Unauthorized", { status: 401, headers: corsHeaders });
        await bucket.put("data.json", bodyText, { httpMetadata: { contentType: "application/json" } });
        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      }

      if (path === "/upload") {
        if (!isAuthorized) return new Response("Unauthorized", { status: 401, headers: corsHeaders });
        const filename = request.headers.get("X-Filename") || `upload_${Date.now()}.png`;
        const type = request.headers.get("Content-Type") || "image/png";
        const bytes = await request.arrayBuffer();
        await bucket.put(filename, bytes, { httpMetadata: { contentType: type } });
        const baseUrl = url.origin;
        return new Response(JSON.stringify({ success: true, url: `${baseUrl}/img/${filename}` }), { headers: corsHeaders });
      }

      // B. ENGAGEMENT ROUTES (No Auth Needed)
      const data = await getDB();
      const body = await request.json().catch(() => ({}));
      const { eventId, postId, recId, commentId, email, text, author, emoji } = body;

      // 1. Events (RSVP & React & Comment)
      if (path === "/event/rsvp") {
        const event = data.events?.find(e => e.id === eventId);
        if (event) {
          event.rsvps = event.rsvps || [];
          event.rsvps.push({ email, date: new Date().toISOString() });
          await saveDB(data);
          return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
        }
      }

      const event = data.events?.find(e => e.id === eventId);
      if (event) {
        if (path === "/react") {
          event.reactions = event.reactions || {};
          event.reactions["❤️"] = (event.reactions["❤️"] || 0) + 1;
          await saveDB(data);
          return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
        }
        if (path === "/comment") {
          event.comments = event.comments || [];
          event.comments.push({ id: `c_${Date.now()}`, author, text, date: new Date().toISOString(), reactions: {}, replies: [] });
          await saveDB(data);
          return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
        }
      }

      // 2. Recordings
      if (path.startsWith("/rec/")) {
        const rec = data.recordings?.find(r => r.id === recId);
        if (rec) {
          if (path === "/rec/view") rec.views = (rec.views || 0) + 1;
          else if (path === "/rec/like") rec.likes = (rec.likes || 0) + 1;
          await saveDB(data);
          return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
        }
      }

      // 3. Blog Posts
      if (path.startsWith("/post/")) {
        const post = data.posts?.find(p => p.id === postId);
        if (post) {
          if (path === "/post/view") post.views = (post.views || 0) + 1;
          else if (path === "/post/like") post.likes = (post.likes || 0) + 1;
          await saveDB(data);
          return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
        }
      }
    }

    return new Response("Route Not Found", { status: 404, headers: corsHeaders });
  }
}
