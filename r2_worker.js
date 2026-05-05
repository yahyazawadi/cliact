/**
 * Cloudflare R2 Data & Image Worker - YOUR VERSION + UPLOAD FIX
 * Automatically assigns IDs to legacy comments to enable hearts and replies.
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    let path = url.pathname;
    if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
    path = path.replace(/\/+/g, '/'); // Fix double slashes that break /upload
    
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Filename, X-Auth-Secret",
      "Access-Control-Max-Age": "86400",
    };

    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

    // Support both 'BUCKET' and 'climate-action' as binding names
    const bucket = env.BUCKET || env['climate-action'];
    if (!bucket) return new Response("Error: R2 Bucket binding not found.", { status: 500, headers: corsHeaders });

    // --- HELPER: GET/SAVE/REPAIR DATABASE ---
    const getDB = async () => {
      const obj = await bucket.get("data.json");
      const data = obj ? await obj.json() : { posts: [], events: [], recordings: [] };
      
      // AUTO-REPAIR: Add IDs to comments that don't have them
      let needsRepair = false;
      data.events?.forEach(ev => {
        ev.comments?.forEach((com, idx) => {
          if (!com.id) {
            com.id = `legacy_${ev.id}_${idx}`; // Assign a unique legacy ID
            needsRepair = true;
          }
          if (!com.reactions) com.reactions = {};
          if (!com.replies) com.replies = [];
        });
      });
      
      if (needsRepair) await saveDB(data);
      return data;
    };

    const saveDB = async (data) => {
      await bucket.put("data.json", JSON.stringify(data), { httpMetadata: { contentType: "application/json" } });
    };

    if (request.method === "GET" && path === "/data") {
      return new Response(JSON.stringify(await getDB()), { 
        headers: { 
          ...corsHeaders, 
          "Content-Type": "application/json",
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
          "Pragma": "no-cache",
          "Expires": "0"
        } 
      });
    }

    if (request.method === "GET" && path.startsWith("/img/")) {
      const filename = path.replace("/img/", "");
      const obj = await bucket.get(filename);
      if (!obj) return new Response("Not Found", { status: 404, headers: corsHeaders });
      return new Response(obj.body, { headers: { ...corsHeaders, "Content-Type": obj.httpMetadata.contentType || "image/png" } });
    }

    const engagementPaths = [
      "/react", "/unreact", "/comment", "/comment/react", "/comment/reply", 
      "/post/view", "/post/like", "/post/unlike", "/post/comment",
      "/rec/view", "/rec/like", "/rec/unlike", "/rec/comment",
      "/event/rsvp"
    ];

    if (request.method === "POST" && engagementPaths.includes(path)) {
      const body = await request.json().catch(() => ({}));
      const { eventId, commentId, emoji, text, author, postId, recId, email } = body;
      const data = await getDB();

      // --- EVENT RSVP ---
      if (path === "/event/rsvp") {
        const event = data.events?.find(e => e.id === eventId);
        if (!event) return new Response("Event not found", { status: 404, headers: corsHeaders });
        
        event.rsvps = event.rsvps || [];
        if (!event.rsvps.includes(email)) {
          event.rsvps.push({ email, date: new Date().toISOString() });
          await saveDB(data);
        }
        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      }

      // --- RECORDING ENGAGEMENT ---
      if (path.startsWith("/rec/")) {
        const rec = data.recordings?.find(r => r.id === recId);
        if (!rec) return new Response("Recording not found", { status: 404, headers: corsHeaders });
        
        if (path === "/rec/view") rec.views = (rec.views || 0) + 1;
        else if (path === "/rec/like") rec.likes = (rec.likes || 0) + 1;
        else if (path === "/rec/unlike") rec.likes = Math.max(0, (rec.likes || 1) - 1);
        else if (path === "/rec/comment") {
          rec.comments = rec.comments || [];
          rec.comments.push({ id: `rc_${Date.now()}`, author, text, date: new Date().toISOString() });
        }
        await saveDB(data);
        return new Response(JSON.stringify({ success: true, views: rec.views, likes: rec.likes }), { headers: corsHeaders });
      }

      // --- POST ENGAGEMENT ---
      if (path.startsWith("/post/")) {
        const post = data.posts?.find(p => p.id === postId);
        if (!post) return new Response("Post not found", { status: 404, headers: corsHeaders });
        
        if (path === "/post/view") post.views = (post.views || 0) + 1;
        else if (path === "/post/like") post.likes = (post.likes || 0) + 1;
        else if (path === "/post/unlike") post.likes = Math.max(0, (post.likes || 1) - 1);
        else if (path === "/post/comment") {
          post.comments = post.comments || [];
          post.comments.push({ id: `pc_${Date.now()}`, author, text, date: new Date().toISOString() });
        }
        await saveDB(data);
        return new Response(JSON.stringify({ success: true, views: post.views, likes: post.likes }), { headers: corsHeaders });
      }

      // --- EVENT ENGAGEMENT ---
      const event = data.events?.find(e => e.id === eventId);
      if (!event) return new Response(`Error: Event ${eventId} not found`, { status: 404, headers: corsHeaders });

      if (path === "/react") {
        const actualEmoji = "❤️"; // Single heart only
        event.reactions = event.reactions || {};
        event.reactions[actualEmoji] = (event.reactions[actualEmoji] || 0) + 1;
        await saveDB(data);
        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      }

      if (path === "/unreact") {
        const actualEmoji = "❤️";
        event.reactions = event.reactions || {};
        event.reactions[actualEmoji] = Math.max(0, (event.reactions[actualEmoji] || 1) - 1);
        await saveDB(data);
        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      }

      if (path === "/comment") {
        event.comments = event.comments || [];
        event.comments.push({ id: `c_${Date.now()}`, author, text, date: new Date().toISOString(), reactions: {}, replies: [] });
        await saveDB(data);
        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      }

      const comment = event?.comments?.find(c => c.id === commentId);
      if (!comment && (path === "/comment/react" || path === "/comment/reply")) {
        return new Response(`Error: Comment ${commentId} not found`, { status: 404, headers: corsHeaders });
      }

      if (path === "/comment/react") {
        comment.reactions = comment.reactions || {};
        comment.reactions[emoji] = (comment.reactions[emoji] || 0) + 1;
        await saveDB(data);
        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      }

      if (path === "/comment/reply") {
        comment.replies = comment.replies || [];
        comment.replies.push({ author, text, date: new Date().toISOString() });
        await saveDB(data);
        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      }
    }

    // --- ADMIN ROUTES ---
    const authHeader = request.headers.get("Authorization") || "";
    const isAuthorized = authHeader === `Bearer ${env.AUTH_SECRET || 'climate_action_secret_2026'}`;
    if (!isAuthorized) return new Response("Unauthorized", { status: 401, headers: corsHeaders });

    if (path === "/data" && request.method === "POST") {
      const bodyText = await request.text();
      try {
        const body = JSON.parse(bodyText);
        if (body.ping) {
          return new Response(JSON.stringify({ success: true, authorized: true }), { headers: corsHeaders });
        }
        await bucket.put("data.json", bodyText, { httpMetadata: { contentType: "application/json" } });
        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      } catch (e) {
        await bucket.put("data.json", bodyText, { httpMetadata: { contentType: "application/json" } });
        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      }
    }

    if (path === "/upload" && request.method === "POST") {
      const filename = request.headers.get("X-Filename") || `upload_${Date.now()}.png`;
      let type = request.headers.get("Content-Type") || "image/png";
      let bytes;

      if (type.includes("application/json")) {
        const body = await request.json();
        if (body.image && body.image.includes("base64,")) {
          const base64Data = body.image.split("base64,")[1];
          type = body.image.split(";")[0].split(":")[1];
          const binaryString = atob(base64Data);
          bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
        } else {
          return new Response("Invalid JSON image data", { status: 400, headers: corsHeaders });
        }
      } else {
        bytes = await request.arrayBuffer();
      }

      await bucket.put(filename, bytes, { httpMetadata: { contentType: type } });
      const baseUrl = url.origin;
      return new Response(JSON.stringify({ success: true, url: `${baseUrl}/img/${filename}` }), { headers: corsHeaders });
    }

    return new Response("Not Found", { status: 404, headers: corsHeaders });
  }
}
