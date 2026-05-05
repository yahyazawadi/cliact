import CONFIG from './env_config.js';

/**
 * public_blog.js
 * Loads live climate stories from the Cloudflare R2 JSON database.
 */
function $(id) { return document.getElementById(id); }

let allPosts = [];

async function loadPublicPosts() {
    const status = $("blog_status");
    const feed = $("blog_posts_feed");
    
    // Check if we are on a single post page
    const urlParams = new URLSearchParams(window.location.search);
    const postId = urlParams.get("id");

    if (status) status.textContent = "Fetching latest climate stories...";

    try {
        const workerUrl = CONFIG.WORKER_URL;
        
        const response = await fetch(`${workerUrl}/data`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const data = await response.json();
        console.log("[BLOG] Data received:", data);
        
        allPosts = data.posts || [];

        if (postId) {
            // Single Post View Logic
            const post = allPosts.find(p => p.id === postId);
            if (post) {
                renderSinglePost(post, data.users || []);
            } else {
                if (status) status.textContent = "Story not found.";
            }
            return;
        }

        if (allPosts.length === 0) {
            if (status) status.textContent = "No stories published yet. Check back soon!";
            return;
        }

        if (status) status.textContent = ""; // Clear status
        
        // Sort newest first
        allPosts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        renderPosts(allPosts);

    } catch (err) {
        console.error("[BLOG] Fetch error:", err);
        if (status) status.textContent = "Unable to connect to the climate database. Please refresh.";
    }
}

function renderSinglePost(post, users) {
    const status = $("blog_status");
    if (status) status.style.display = "none";

    const viewBox = $("blog_post_view_box");
    if (!viewBox) return;
    viewBox.style.display = "block";

    // Set content
    if ($("blog_post_view_title")) $("blog_post_view_title").textContent = post.title;
    if ($("blog_post_view_content")) $("blog_post_view_content").innerHTML = post.contentHtml;
    if ($("blog_post_view_meta")) $("blog_post_view_meta").textContent = new Date(post.createdAt).toLocaleDateString();
    
    if ($("blog_post_view_thumb")) {
        if (post.thumbnailUrl) {
            $("blog_post_view_thumb").src = post.thumbnailUrl;
            $("blog_post_view_thumb").style.display = "block";
        } else {
            $("blog_post_view_thumb").style.display = "none";
        }
    }

    // Author info
    const author = users.find(u => u.email === post.authorEmail);
    if (author) {
        if ($("blog_post_view_author_name")) $("blog_post_view_author_name").textContent = author.name || "Climate Action Contributor";
        if ($("blog_post_view_author_pfp") && author.profilePicture) $("blog_post_view_author_pfp").src = author.profilePicture;
        if ($("blog_post_view_author_short_description")) $("blog_post_view_author_short_description").textContent = author.shortDescription || "Writer and Advocate";
    }

    // Update title
    document.title = `${post.title} | Climate Action`;

    // Engagement
    wireEngagement(post);
}

async function wireEngagement(post) {
    const workerUrl = CONFIG.WORKER_URL;
    const userIdentity = localStorage.getItem("climate_action_identity") || "EcoHero_" + Math.random().toString(36).substring(7);
    localStorage.setItem("climate_action_identity", userIdentity);

    if ($("comment_identity_label")) $("comment_identity_label").textContent = `Speaking as ${userIdentity}`;
    
    // 1. Initial counts & comments
    if ($("view_count")) $("view_count").textContent = post.views || 0;
    if ($("like_count")) $("like_count").textContent = post.likes || 0;
    renderPostComments(post.comments || []);

    // 2. Register View
    try {
        const res = await fetch(`${workerUrl}/post/view`, {
            method: 'POST',
            body: JSON.stringify({ postId: post.id })
        });
        const result = await res.json();
        if (result.success && $("view_count")) $("view_count").textContent = result.views;
    } catch (e) { console.error("View count error", e); }

    // 3. Like Button (Toggle Like/Unlike)
    const likeBtn = $("like_btn");
    if (likeBtn) {
        likeBtn.onclick = async () => {
            const isLiked = likeBtn.classList.contains("liked");
            const path = isLiked ? "/post/unlike" : "/post/like";
            
            try {
                const res = await fetch(`${workerUrl}${path}`, {
                    method: 'POST',
                    body: JSON.stringify({ postId: post.id })
                });
                const result = await res.json();
                if (result.success) {
                    if ($("like_count")) $("like_count").textContent = result.likes;
                    if (isLiked) {
                        likeBtn.classList.remove("liked");
                        likeBtn.style.color = "";
                    } else {
                        likeBtn.classList.add("liked");
                        likeBtn.style.color = "var(--error)";
                    }
                }
            } catch (e) { console.error("Like toggle error", e); }
        };
    }

    // 4. Share Button
    const shareBtn = $("blog_post_view_copy_link");
    if (shareBtn) {
        shareBtn.onclick = () => {
            navigator.clipboard.writeText(window.location.href);
            const originalText = shareBtn.innerHTML;
            shareBtn.innerHTML = "<span>✓ Copied!</span>";
            setTimeout(() => { shareBtn.innerHTML = originalText; }, 2000);
        };
    }

    // 5. Comments
    const commentSubmit = $("post_comment_submit");
    if (commentSubmit) {
        commentSubmit.onclick = async () => {
            const input = $("post_comment_input");
            const text = input?.value.trim();
            if (!text) return;

            commentSubmit.disabled = true;
            try {
                const res = await fetch(`${workerUrl}/post/comment`, {
                    method: 'POST',
                    body: JSON.stringify({ postId: post.id, text, author: userIdentity })
                });
                if (res.ok) {
                    input.value = "";
                    // Refresh posts to get new comments (quick hack)
                    loadPublicPosts();
                }
            } catch (e) { console.error("Comment error", e); }
            commentSubmit.disabled = false;
        };
    }
}

function renderPostComments(comments) {
    const container = $("post_comments_container");
    if (!container) return;

    if (comments.length === 0) {
        container.innerHTML = '<p style="color: var(--text-light);">No conversations yet. Be the first to speak!</p>';
        return;
    }

    container.innerHTML = comments.map(c => `
        <div style="background: white; padding: 18px 24px; border-radius: 18px; border: 1.5px solid #f1f5f9; box-shadow: 0 4px 15px rgba(0,0,0,0.02);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <span style="font-weight: 800; color: var(--primary); font-size: 0.9rem;">${c.author}</span>
                <span style="font-size: 0.75rem; color: var(--text-light);">${new Date(c.date).toLocaleDateString()}</span>
            </div>
            <p style="margin: 0; color: #1e293b; line-height: 1.5;">${c.text}</p>
        </div>
    `).join("");
}

function renderPosts(posts) {
    const feed = $("blog_posts_feed");
    if (!feed) return;

    feed.innerHTML = posts.map(post => `
        <article class="blog-card" style="background: white; border-radius: 20px; overflow: hidden; box-shadow: 0 15px 35px rgba(0,0,0,0.05); transition: transform 0.3s ease; border: 1px solid #f1f5f9;">
            ${post.thumbnailUrl ? `
                <div style="height: 220px; overflow: hidden; position: relative;">
                    <img src="${post.thumbnailUrl}" alt="${post.title}" style="width: 100%; height: 100%; object-fit: cover; transition: transform 0.5s ease;" />
                    <div style="position: absolute; top: 15px; left: 15px; background: rgba(36, 99, 61, 0.9); color: white; padding: 4px 12px; border-radius: 50px; font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">Story</div>
                </div>
            ` : ''}
            <div style="padding: 28px;">
                <h3 class="playfair" style="font-size: 1.6rem; margin-bottom: 12px; color: #1e293b; line-height: 1.3;">${post.title}</h3>
                <p style="color: #64748b; line-height: 1.7; margin-bottom: 24px; font-size: 1rem;">${extractSnippet(post.contentHtml)}</p>
                <div style="display: flex; align-items: center; justify-content: space-between; padding-top: 20px; border-top: 1px solid #f1f5f9;">
                    <span style="font-size: 0.85rem; color: #94a3b8; font-weight: 500;">${new Date(post.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                    <a href="blog_post_view.html?id=${post.id}" style="color: #24633d; font-weight: 700; text-decoration: none; display: flex; align-items: center; gap: 5px; font-size: 0.95rem;">
                        Read Full Story <span style="font-size: 1.2rem;">→</span>
                    </a>
                </div>
            </div>
        </article>
    `).join("");
}

function extractSnippet(html) {
    const tmp = document.createElement("DIV");
    tmp.innerHTML = html;
    const text = tmp.textContent || tmp.innerText || "";
    return text.length > 140 ? text.substring(0, 140) + "..." : text;
}

function wirePublicBlog() {
    loadPublicPosts();

    const searchInput = $("blog_search_input");
    if (searchInput) {
        searchInput.addEventListener("input", (e) => {
            const query = e.target.value.toLowerCase();
            const filtered = allPosts.filter(p => 
                p.title.toLowerCase().includes(query) || 
                p.contentHtml.toLowerCase().includes(query)
            );
            renderPosts(filtered);
        });
    }
}

document.addEventListener("DOMContentLoaded", wirePublicBlog);
