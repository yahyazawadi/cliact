import CONFIG from './js/env_config.js';

const env = {
    WORKER_URL: CONFIG.WORKER_URL,
    WORKER_AUTH_SECRET: CONFIG.AUTH_SECRET,
    ADMIN_STATIC_EMAIL: CONFIG.ADMIN_EMAIL,
    ADMIN_STATIC_PASSWORD: CONFIG.ADMIN_PASSWORD
};

async function loadRuntimeEnv() {
    try {
        console.log("[ENV] Attempting to load .env...");
        const response = await fetch('.env'); // try relative path
        
        if (response.ok) {
            const text = await response.text();
            text.split('\n').forEach(line => {
                const [key, ...valueParts] = line.split('=');
                if (key && valueParts.length > 0) {
                    env[key.trim()] = valueParts.join('=').trim();
                }
            });
            console.log("[ENV] Environment loaded from .env.");
        } else {
            console.log("[ENV] Using hardcoded fallbacks (Local .env blocked).");
        }
    } catch (err) {
        console.log("[ENV] Falling back to default config.");
    }
}

function $(id) { return document.getElementById(id); }

function setStatus(message, type = "info") {
    const el = $("admin_auth_status");
    if (!el) return;
    el.innerHTML = message;
    el.style.color = type === "error" ? "#e74c3c" : (type === "success" ? "#27ae60" : "#666");
}

async function wireUi() {
    await loadRuntimeEnv(); // Ensure .env is loaded first

    const isStaticAdmin = localStorage.getItem("static_admin_session") === "true";
    const authStatus = $("admin_auth_status");
    const loginSection = $("admin_login_section");
    const dashboardSection = $("admin_dashboard_section");
    const postingSection = $("admin_posting_section");
    const signOutBtn = $("admin_sign_out_btn");

    // 1. IMMEDIATE AUTH CHECK
    if (isStaticAdmin) {
        console.log("[AUTH] Admin session found.");
        if (authStatus) authStatus.textContent = "Welcome, Administrator";
        if (loginSection) loginSection.style.display = "none";
        if (dashboardSection) dashboardSection.style.display = "block";
        if (postingSection) postingSection.style.display = "block";

        const postingMenu = $("admin_blogposting_menu");
        const listMenu = $("admin_bloglist_menu");
        const eventsMenu = $("admin_events_menu");
        const recordingsMenu = $("admin_recordings_menu");
        if (postingMenu) postingMenu.style.display = "block";
        if (listMenu) listMenu.style.display = "block";
        if (eventsMenu) eventsMenu.style.display = "block";
        if (recordingsMenu) recordingsMenu.style.display = "block";

        window.isAdminLoggedIn = true;
        loadDashboardStats();
    } else {
        console.log("[AUTH] No active session.");
        if (authStatus) authStatus.textContent = "Please sign in to continue.";
        if (loginSection) loginSection.style.display = "block";
        if (dashboardSection) dashboardSection.style.display = "none";
        
        // Redirect if on protected page
        if (postingSection || $("admin_posts_feed")) {
            if (!window.location.pathname.includes("admin.html")) {
                window.location.href = "admin.html";
            }
        }
    }

    const loginForm = $("admin_login_form");
    if (loginForm) {
        loginForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const password = $("admin_password")?.value || "";

            setStatus("Verifying with Cloudflare...", "loading");

            // Try to fetch data to verify the secret directly with the Worker
            try {
                const test = await fetch(`${env.WORKER_URL}/data`, {
                    method: 'POST',
                    headers: { 
                        'Authorization': `Bearer ${password}`,
                        'Content-Type': 'application/json' 
                    },
                    body: JSON.stringify({ ping: true })
                });

                if (test.ok) {
                    localStorage.setItem("admin_auth_key", password);
                    localStorage.setItem("static_admin_session", "true");
                    setStatus("Access Granted!", "success");
                    setTimeout(() => window.location.reload(), 1000);
                } else {
                    throw new Error("Unauthorized");
                }
            } catch(err) {
                setStatus("Invalid Secret. Check your Cloudflare Worker vars.", "error");
                localStorage.removeItem("admin_auth_key");
                localStorage.removeItem("static_admin_session");
            }
        });
    }

    // --- POST PUBLISHING / EDIT MODE LOGIC ---
    const postForm = $("admin_post_form");
    const urlParams = new URLSearchParams(window.location.search);
    const editId = urlParams.get("edit");
    let isEditMode = false;

    if (postForm) {
        const editor = $("admin_post_editor");
        const status = $("admin_post_status");

        // Handle Edit Mode Population
        if (editId) {
            isEditMode = true;
            const publishBtn = postForm.querySelector('button[type="submit"]');
            if (publishBtn) publishBtn.textContent = "Update Story on Cloudflare";
            
            if (status) status.textContent = "Loading post details...";

            getDatabase().then(data => {
                const post = data.posts.find(p => p.id === editId);
                if (post) {
                    if ($("admin_post_title")) $("admin_post_title").value = post.title;
                    if (editor) editor.innerHTML = post.contentHtml;
                    if (post.thumbnailUrl) showThumbnailPreview(post.thumbnailUrl);
                    if (status) status.textContent = "Edit Mode: Ready";
                } else {
                    if (status) status.textContent = "❌ Post not found.";
                }
            });
        }

        postForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const title = ($("admin_post_title")?.value || "").trim();
            const editor = $("admin_post_editor");
            const status = $("admin_post_status");

            if (!title || !editor) return;

            if (status) {
                status.textContent = isEditMode ? "Updating... (Syncing with R2)" : "Publishing... (Uploading images to R2)";
                status.style.color = "blue";
            }

            try {
                // 1. Process and upload images in the editor
                let contentHtml = editor.innerHTML;
                const images = editor.querySelectorAll("img");
                for (const img of images) {
                    if (img.src.startsWith("data:")) {
                        const r2Url = await uploadImageToR2(img.src, "blog");
                        contentHtml = contentHtml.replace(img.src, r2Url);
                    }
                }

                // 2. Handle Thumbnail
                let thumbnailUrl = null;
                const thumbImg = $("admin_thumbnail_image");
                if (thumbImg && thumbImg.src.startsWith("data:")) {
                    thumbnailUrl = await uploadImageToR2(thumbImg.src, "thumbnails");
                } else if (thumbImg) {
                    thumbnailUrl = thumbImg.src;
                }

                // 3. Load database and append/update post
                const data = await getDatabase();
                data.posts = data.posts || [];

                if (isEditMode) {
                    const postIndex = data.posts.findIndex(p => p.id === editId);
                    if (postIndex > -1) {
                        data.posts[postIndex] = {
                            ...data.posts[postIndex],
                            title,
                            contentHtml,
                            thumbnailUrl,
                            updatedAt: new Date().toISOString()
                        };
                    }
                } else {
                    const newPost = {
                        id: `post_${Date.now()}`,
                        title,
                        contentHtml,
                        thumbnailUrl,
                        createdAt: new Date().toISOString(),
                        authorEmail: env.ADMIN_STATIC_EMAIL || "admin",
                        views: 0,
                        likes: 0
                    };
                    data.posts.unshift(newPost);
                }

                // 4. Save back to Cloudflare
                const success = await saveDatabase(data);
                if (success) {
                    if (status) {
                        status.textContent = isEditMode ? "✅ Post Updated Successfully!" : "✅ Post Published Successfully!";
                        status.style.color = "green";
                    }
                    setTimeout(() => window.location.href = "admin_posts.html", 1500);
                } else {
                    throw new Error("Failed to save database to Cloudflare.");
                }

            } catch (err) {
                console.error("[PUBLISH] Error:", err);
                if (status) {
                    status.textContent = "❌ Error: " + err.message;
                    status.style.color = "red";
                }
            }
        });
    }

    // --- THUMBNAIL LOGIC ---
    const thumbFile = $("admin_thumbnail_file");
    const thumbPreview = $("admin_thumbnail_preview");
    const thumbPasteBtn = $("admin_paste_thumb_btn");

    if (thumbFile && thumbPreview) {
        thumbFile.addEventListener("change", (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (re) => showThumbnailPreview(re.target.result);
                reader.readAsDataURL(file);
            }
        });
    }

    if (thumbPasteBtn) {
        thumbPasteBtn.addEventListener("click", async () => {
            try {
                const items = await navigator.clipboard.read();
                for (const item of items) {
                    if (item.types.includes("image/png") || item.types.includes("image/jpeg")) {
                        const blob = await item.getType(item.types.find(t => t.startsWith("image/")));
                        const reader = new FileReader();
                        reader.onload = (re) => showThumbnailPreview(re.target.result);
                        reader.readAsDataURL(blob);
                    }
                }
            } catch (err) {
                alert("Clipboard access denied or no image found.");
            }
        });
    }

    function showThumbnailPreview(dataUrl) {
        if (!thumbPreview) return;
        thumbPreview.innerHTML = `
            <img src="${dataUrl}" id="admin_thumbnail_image" style="max-width: 200px; border-radius: 4px; margin-top: 10px;" />
            <br/><button type="button" class="btn" id="admin_thumbnail_clear" style="background:#ff4757; color:white; border:none; padding:5px 10px; margin-top:5px; cursor:pointer; border-radius:3px;">Remove</button>
        `;
        $("admin_thumbnail_clear").onclick = () => thumbPreview.innerHTML = "";
    }

    // --- EVENT MANAGEMENT LOGIC ---
    const eventForm = $("admin_event_form");
    const eventsFeed = $("admin_events_feed");

    if (eventsFeed) {
        loadAdminEvents();
    }

    if (eventForm) {
        eventForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const title = $("event_title").value;
            const date = $("event_date").value;
            const location = $("event_location").value;
            const desc = $("event_desc").value;
            const status = $("event_status");

            if (status) status.textContent = "Scheduling event...";

            try {
                const data = await getDatabase();
                const newEvent = {
                    id: `event_${Date.now()}`,
                    title,
                    date,
                    location,
                    description: desc
                };
                data.events = data.events || [];
                data.events.push(newEvent);

                const success = await saveDatabase(data);
                if (success) {
                    if (status) status.textContent = "✅ Event Scheduled!";
                    eventForm.reset();
                    loadAdminEvents();
                    loadDashboardStats();
                }
            } catch (err) {
                if (status) status.textContent = "❌ Error scheduling event.";
            }
        });
    }

    async function loadAdminEvents() {
        const feed = $("admin_events_feed");
        if (!feed) return;

        const data = await getDatabase();
        const events = data.events || [];

        feed.innerHTML = events.length === 0 ? '<p>No events scheduled.</p>' : 
            events.map(ev => `
                <div class="event-card">
                    <div class="event-info">
                        <h3>${ev.title}</h3>
                        <p>📅 ${new Date(ev.date).toLocaleString()} | 📍 ${ev.location}</p>
                    </div>
                    <button class="btn-delete" onclick="deleteEvent('${ev.id}')">Delete</button>
                </div>
            `).join('');
    }

    window.deleteEvent = async (id) => {
        if (!confirm("Remove this event?")) return;
        const data = await getDatabase();
        data.events = data.events.filter(e => e.id !== id);
        const success = await saveDatabase(data);
        if (success) {
            loadAdminEvents();
            loadDashboardStats();
        }
    };

    // --- BLOG LIBRARY LOGIC ---
    const postsFeed = $("admin_posts_feed");
    const searchInput = $("admin_posts_search_input");

    if (postsFeed) {
        loadAdminPosts();
    }

    if (searchInput) {
        searchInput.addEventListener("input", (e) => {
            const query = e.target.value.toLowerCase();
            const cards = document.querySelectorAll(".admin-post-card");
            cards.forEach(card => {
                const text = card.textContent.toLowerCase();
                card.style.display = text.includes(query) ? "grid" : "none";
            });
        });
    }

    async function loadAdminPosts() {
        const status = $("admin_posts_status");
        if (status) status.textContent = "Loading posts from Cloudflare...";

        const data = await getDatabase();
        const posts = data.posts || [];

        if (status) status.textContent = posts.length === 0 ? "No posts found." : `Showing ${posts.length} posts.`;
        
        if (!postsFeed) return;
        postsFeed.innerHTML = "";

        posts.forEach(post => {
            const card = document.createElement("div");
            card.className = "admin-post-card";
            card.innerHTML = `
                <img src="${post.thumbnailUrl || 'images/templatemo_image_01.jpg'}" class="card-thumb" />
                <div class="card-content">
                    <h3 class="card-title">${post.title}</h3>
                    <div class="card-meta">Published: ${new Date(post.createdAt).toLocaleDateString()}</div>
                    <div class="card-actions">
                        <button class="btn-small btn-edit edit-btn" data-id="${post.id}">✏️ Edit</button>
                        <button class="btn-small btn-delete delete-btn" data-id="${post.id}">🗑️ Delete</button>
                    </div>
                </div>
            `;
            postsFeed.appendChild(card);
        });

        // Add Edit listeners
        document.querySelectorAll(".edit-btn").forEach(btn => {
            btn.onclick = (e) => {
                const id = e.target.getAttribute("data-id");
                window.location.href = `admin_post.html?edit=${id}`;
            };
        });

        // Add delete listeners
        document.querySelectorAll(".delete-btn").forEach(btn => {
            btn.onclick = async (e) => {
                const id = e.target.getAttribute("data-id");
                if (confirm("Are you sure you want to delete this post?")) {
                    await deletePost(id);
                }
            };
        });
    }

    async function deletePost(id) {
        const data = await getDatabase();
        data.posts = data.posts.filter(p => p.id !== id);
        const success = await saveDatabase(data);
        if (success) {
            loadAdminPosts();
            loadDashboardStats();
        } else {
            alert("Failed to delete post.");
        }
    }

    // --- ADVANCED IMAGE CONTROLS ---
    const editor = $("admin_post_editor");
    const inlineImgFile = $("admin_inline_img_file");
    const insertImgBtn = $("admin_insert_img_btn");
    const resizerUi = $("image_resizer_ui");
    const sizeSlider = $("image_size_slider");
    const removeImgBtn = $("image_remove_btn");
    let activeImage = null;

    if (insertImgBtn) {
        insertImgBtn.onclick = () => inlineImgFile.click();
    }

    if (inlineImgFile) {
        inlineImgFile.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (re) => {
                    const imgHtml = `<img src="${re.target.result}" style="max-width: 100%; border-radius: 8px; margin: 10px 0; display: block;" />`;
                    document.execCommand("insertHTML", false, imgHtml);
                };
                reader.readAsDataURL(file);
            }
        };
    }

    // Detect click on image to show resizer
    if (editor) {
        editor.addEventListener("click", (e) => {
            if (e.target.tagName === "IMG") {
                activeImage = e.target;
                showResizer(activeImage);
            } else {
                if (resizerUi) resizerUi.style.display = "none";
                activeImage = null;
            }
        });
    }

    function showResizer(img) {
        if (!resizerUi || !sizeSlider) return;
        const rect = img.getBoundingClientRect();
        const editorRect = editor.getBoundingClientRect();
        
        resizerUi.style.display = "flex";
        resizerUi.style.top = `${img.offsetTop - 50}px`;
        resizerUi.style.left = `${img.offsetLeft}px`;
        
        // Match slider to current width
        const currentWidth = parseInt(img.style.width) || 100;
        sizeSlider.value = currentWidth;
    }

    if (sizeSlider) {
        sizeSlider.oninput = (e) => {
            if (activeImage) {
                activeImage.style.width = `${e.target.value}%`;
                activeImage.style.height = "auto";
            }
        };
    }

    if (removeImgBtn) {
        removeImgBtn.onclick = () => {
            if (activeImage) {
                activeImage.remove();
                if (resizerUi) resizerUi.style.display = "none";
                activeImage = null;
            }
        };
    }

    // --- LOGOUT LOGIC ---
    if (signOutBtn) {
        signOutBtn.addEventListener("click", () => {
            localStorage.removeItem("static_admin_session");
            window.location.reload();
        });
    }

    // --- FLOATING ADMIN HUD ---
    createAdminHud(isStaticAdmin);
}

function createAdminHud(isAdmin) {
    // Remove existing if any
    const existing = document.getElementById("admin_floating_hud");
    if (existing) existing.remove();

    const hud = document.createElement("div");
    hud.id = "admin_floating_hud";
    hud.style.cssText = `
        position: fixed;
        right: 25px;
        bottom: 25px;
        z-index: 99999;
        font-family: 'Inter', sans-serif;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 12px;
    `;

    if (isAdmin) {
        hud.innerHTML = `
            <div id="admin_hud_menu" style="display: none; flex-direction: column; gap: 8px; margin-bottom: 5px;">
                <a href="admin.html" style="background: white; color: #1e293b; padding: 12px 24px; border-radius: 16px; text-decoration: none; font-weight: 700; font-size: 0.9rem; box-shadow: 0 10px 30px rgba(0,0,0,0.1); border: 1px solid #e2e8f0; white-space: nowrap; transition: all 0.2s;">Dashboard</a>
                <a href="admin_post.html" style="background: white; color: #1e293b; padding: 12px 24px; border-radius: 16px; text-decoration: none; font-weight: 700; font-size: 0.9rem; box-shadow: 0 10px 30px rgba(0,0,0,0.1); border: 1px solid #e2e8f0; white-space: nowrap; transition: all 0.2s;">New Story</a>
                <button id="admin_hud_switch" style="background: #ef4444; color: white; padding: 12px 24px; border-radius: 16px; border: none; font-weight: 700; font-size: 0.9rem; cursor: pointer; box-shadow: 0 10px 25px rgba(239, 68, 68, 0.3); white-space: nowrap; transition: all 0.2s;">Exit Admin Mode</button>
            </div>
            <button id="admin_hud_main_btn" style="background: #24633d; color: white; width: 60px; height: 60px; border-radius: 30px; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 24px; box-shadow: 0 15px 35px rgba(36, 99, 61, 0.4); transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);">
                <span style="transition: transform 0.3s;" id="admin_hud_icon">⚙️</span>
            </button>
        `;
        document.body.appendChild(hud);

        const mainBtn = hud.querySelector("#admin_hud_main_btn");
        const menu = hud.querySelector("#admin_hud_menu");
        const icon = hud.querySelector("#admin_hud_icon");
        const switchBtn = hud.querySelector("#admin_hud_switch");

        mainBtn.onclick = () => {
            const isOpen = menu.style.display === "flex";
            menu.style.display = isOpen ? "none" : "flex";
            icon.style.transform = isOpen ? "rotate(0deg)" : "rotate(90deg)";
            mainBtn.style.transform = isOpen ? "scale(1)" : "scale(1.1)";
        };

        switchBtn.onclick = () => {
            localStorage.removeItem("static_admin_session");
            window.location.href = "index.html";
        };
    } else {
        // Very subtle login indicator on public pages if you're an admin who just wants to jump in
        hud.innerHTML = `
            <a href="admin.html" style="opacity: 0.15; color: #64748b; font-size: 0.75rem; text-decoration: none; font-weight: 600; transition: opacity 0.3s;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.15">Admin Login</a>
        `;
        document.body.appendChild(hud);
    }
}


document.addEventListener("DOMContentLoaded", wireUi);

// 3. CLOUDFLARE R2 IMAGE UPLOAD LOGIC
async function uploadImageToR2(dataUrl, folder = "uploads") {
    const workerUrl = env.WORKER_URL;
    const authSecret = localStorage.getItem("admin_auth_key") || "climate_action_secret_2026";

    const extension = dataUrl.split(';')[0].split('/')[1] || 'png';
    const filename = `${folder}/${Date.now()}-${Math.random().toString(36).substring(7)}.${extension}`;

    console.log(`[R2] Uploading ${filename}...`);
    
    const response = await fetch(workerUrl, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${authSecret}`,
            'X-Filename': filename,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ image: dataUrl })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Upload failed: ${errorText}`);
    }

    const result = await response.json();
    return result.url;
}

// 4. CLOUDFLARE DATABASE LOGIC (Replacing Firestore)
async function getDatabase() {
    const workerUrl = env.WORKER_URL;
    try {
        const response = await fetch(`${workerUrl}/data`);
        if (!response.ok) return { posts: [], events: [], recordings: [] };
        return await response.json();
    } catch (err) {
        console.error("[DB] Failed to load database:", err);
        return { posts: [], events: [], recordings: [] };
    }
}

async function saveDatabase(data) {
    const workerUrl = env.WORKER_URL;
    const authSecret = localStorage.getItem("admin_auth_key") || "climate_action_secret_2026";

    try {
        const response = await fetch(`${workerUrl}/data`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authSecret}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        return response.ok;
    } catch (err) {
        console.error("[DB] Failed to save database:", err);
        return false;
    }
}

window.fetchWorkerData = async function() {
    const workerUrl = env.WORKER_URL;
    const response = await fetch(`${workerUrl}/data`);
    return response.ok ? await response.json() : { posts: [], events: [], recordings: [] };
};

function showSnackbar(message) {
    let snack = $("snackbar");
    if (!snack) {
        snack = document.createElement("div");
        snack.id = "snackbar";
        document.body.appendChild(snack);
    }
    
    // Reset animation if it's already showing
    snack.classList.remove("show");
    void snack.offsetWidth; // Trigger reflow
    
    snack.innerHTML = `<span>${message}</span>`;
    snack.classList.add("show");
    
    // Auto hide after 3s
    setTimeout(() => {
        snack.classList.remove("show");
    }, 3000);
}

window.saveWorkerData = async function(data) {
    const workerUrl = env.WORKER_URL;
    const authSecret = localStorage.getItem("admin_auth_key") || "climate_action_secret_2026";
    
    const response = await fetch(`${workerUrl}/data`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${authSecret}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
    });
    
    if (response.ok) {
        showSnackbar("✅ Published successfully!");
        return true;
    } else {
        showSnackbar("❌ Error publishing changes.");
        return false;
    }
};

async function loadDashboardStats() {
    const data = await window.fetchWorkerData();
    if ($("stat_posts")) $("stat_posts").textContent = data.posts?.length || "0";
    if ($("stat_views")) $("stat_views").textContent = "0"; // Views can be added later
    if ($("stat_events")) $("stat_events").textContent = data.events?.length || "0";
    if ($("stat_recordings")) $("stat_recordings").textContent = data.recordings?.length || "0";
    if ($("stat_messages")) $("stat_messages").textContent = "0";
}

export { uploadImageToR2, getDatabase, saveDatabase };
