import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-analytics.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
    getFirestore,
    collection,
    getDocs,
    getDoc,
    query,
    orderBy,
    limit,
    doc,
    where,
    deleteDoc,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "YOUR_FIREBASE_API_KEY",
    authDomain: "YOUR_FIREBASE_AUTH_DOMAIN",
    projectId: "YOUR_FIREBASE_PROJECT_ID",
    storageBucket: "YOUR_FIREBASE_STORAGE_BUCKET",
    messagingSenderId: "YOUR_FIREBASE_MESSAGING_SENDER_ID",
    appId: "YOUR_FIREBASE_APP_ID",
    measurementId: "YOUR_FIREBASE_MEASUREMENT_ID",
};

const app = initializeApp(firebaseConfig);
try {
    getAnalytics(app);
} catch (_e) {
    // Ignore analytics failures in local contexts.
}

const db = getFirestore(app);
const auth = getAuth(app);
let allPosts = [];
let attemptedAnonymousAuth = false;

function $(id) {
    return document.getElementById(id);
}

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function setBlogStatus(message) {
    const el = $("blog_status");
    if (!el) return;
    el.innerHTML = message || "";
}

function getAuthorDisplayName(email) {
    const value = (email || "").trim();
    if (!value) return "Unknown author";
    const atIndex = value.indexOf("@");
    return atIndex > 0 ? value.slice(0, atIndex) : value;
}

function getTextFromHtml(html) {
    const wrapper = document.createElement("div");
    wrapper.innerHTML = html || "";
    return (wrapper.textContent || "").replace(/\s+/g, " ").trim();
}

function getPostSnippet(contentHtml, maxLen = 180) {
    const wrapper = document.createElement("div");
    wrapper.innerHTML = contentHtml || "";
    wrapper.querySelectorAll("img, a").forEach((node) => node.remove());

    const text = (wrapper.textContent || "")
        .replace(/https?:\/\/\S+/gi, "")
        .replace(/www\.\S+/gi, "")
        .replace(/\s+/g, " ")
        .trim();

    if (!text) return "No preview available yet.";
    if (text.length <= maxLen) return text;
    return `${text.slice(0, maxLen).trimEnd()}...`;
}

function formatRelativeCardTime(value) {
    if (!value || typeof value.toDate !== "function") return "Unknown time";
    const date = value.toDate();
    const diffMs = Math.max(0, Date.now() - date.getTime());

    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 60) return `${Math.max(1, minutes)}m ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;

    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;

    if (days < 30) {
        const weeks = Math.floor(days / 7);
        return `${Math.max(1, weeks)}w ago`;
    }

    if (days < 180) {
        const months = Math.floor(days / 30);
        return `${Math.max(1, months)}mo ago`;
    }

    return date.toLocaleDateString();
}

function formatCreatedAt(value) {
    if (!value || typeof value.toDate !== "function") return "Unknown date";
    return value.toDate().toLocaleString();
}

async function getAdminProfile(uid) {
    if (!uid) return null;
    try {
        const snap = await getDoc(doc(db, "adminProfiles", uid));
        return snap.exists() ? (snap.data() || {}) : null;
    } catch (_err) {
        return null;
    }
}

async function getAdminProfileByEmail(email) {
    const normalizedEmail = (email || "").trim().toLowerCase();
    if (!normalizedEmail) return null;

    try {
        const q = query(collection(db, "adminProfiles"), where("email", "==", normalizedEmail), limit(1));
        const snap = await getDocs(q);
        if (!snap.empty) return snap.docs[0].data() || null;
    } catch (_err) {
        // Ignore and try scan fallback.
    }

    try {
        const scan = await getDocs(collection(db, "adminProfiles"));
        const hit = scan.docs.find((d) => {
            const value = String(d.data()?.email || "").trim().toLowerCase();
            return value === normalizedEmail;
        });
        return hit ? (hit.data() || null) : null;
    } catch (_err) {
        return null;
    }
}

async function getAuthorProfileForPost(postData) {
    if (!postData) return null;
    const byUid = await getAdminProfile(postData.authorUid);
    if (byUid) return byUid;
    return getAdminProfileByEmail(postData.authorEmail);
}

async function copyText(text) {
    if (!text) return false;
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (_err) {
        return false;
    }
}

function getPostUrl(postId) {
    return new URL(`blog_post_view.html?id=${encodeURIComponent(postId)}`, window.location.href).href;
}

function isPermissionDenied(err) {
    const code = String(err?.code || "").toLowerCase();
    const message = String(err?.message || "").toLowerCase();
    return code.includes("permission-denied") || message.includes("permission-denied");
}

async function tryAnonymousSignIn() {
    if (attemptedAnonymousAuth) return false;
    attemptedAnonymousAuth = true;
    try {
        await signInAnonymously(auth);
        return true;
    } catch (_err) {
        return false;
    }
}

function createPublicPostCard(postId, postData) {
    const card = document.createElement("article");
    card.className = "blog-post-card";

    if (postData.thumbnailUrl) {
        const image = document.createElement("img");
        image.className = "blog-post-thumb";
        image.src = postData.thumbnailUrl;
        image.alt = postData.title ? `${postData.title} thumbnail` : "Post thumbnail";
        card.appendChild(image);
    }

    const body = document.createElement("div");
    body.className = "blog-post-body";

    const title = document.createElement("h3");
    title.className = "blog-post-title";
    title.textContent = postData.title || "Untitled";
    body.appendChild(title);

    const meta = document.createElement("p");
    meta.className = "blog-post-meta";
    const authorName = (postData.authorName || "").trim() || getAuthorDisplayName(postData.authorEmail);
    
    if (postData.authorUid) {
        const authorLink = document.createElement("a");
        authorLink.href = `blog_writer.html?uid=${encodeURIComponent(postData.authorUid)}`;
        authorLink.textContent = authorName;
        authorLink.style.color = "#2d7d4d"; // Giving it a nice clickable color
        authorLink.style.textDecoration = "none";
        authorLink.style.fontWeight = "bold";
        meta.appendChild(authorLink);
        meta.appendChild(document.createTextNode(` | ${formatRelativeCardTime(postData.createdAt)}`));
    } else {
        meta.textContent = `${authorName} | ${formatRelativeCardTime(postData.createdAt)}`;
    }
    body.appendChild(meta);

    const snippet = document.createElement("p");
    snippet.className = "blog-post-snippet";
    snippet.textContent = getPostSnippet(postData.contentHtml);
    body.appendChild(snippet);

    const actions = document.createElement("div");
    actions.className = "blog-post-actions";

    card.onclick = (e) => {
        if (e.target.closest('button, a, input')) return;
        window.location.href = `blog_post_view.html?id=${encodeURIComponent(postId)}`;
    };

    const copyLinkBtn = document.createElement("button");
    copyLinkBtn.type = "button";
    copyLinkBtn.className = "blog-card-btn";
    copyLinkBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>`;
    copyLinkBtn.title = "Copy Link";
    copyLinkBtn.onclick = async (e) => {
        e.stopPropagation();
        const copied = await copyText(getPostUrl(postId));
        setBlogStatus(copied ? "Post link copied." : "Could not copy link in this browser.");
    };
    actions.appendChild(copyLinkBtn);

    body.appendChild(actions);
    card.appendChild(body);
    return card;
}

function renderPublicPosts(posts) {
    const feed = $("blog_posts_feed");
    if (!feed) return;

    feed.innerHTML = "";
    if (!posts.length) {
        setBlogStatus("No posts match your search.");
        return;
    }

    posts.forEach((item) => {
        feed.appendChild(createPublicPostCard(item.id, item.data || {}));
    });

    setBlogStatus(`Showing ${posts.length} post${posts.length === 1 ? "" : "s"}.`);
}

let writerPostObjects = [];

function applyWriterSearch(queryString) {
    const feed = $("blog_writer_posts_feed");
    if (!feed) return;

    if (!queryString || !queryString.trim()) {
        feed.innerHTML = "";
        writerPostObjects.forEach((p) => feed.appendChild(createPublicPostCard(p.id, p.data)));
        return;
    }

    const q = queryString.toLowerCase().trim();
    const filtered = writerPostObjects.filter((p) => {
        const title = String(p.data?.title || "").toLowerCase();
        const content = String(p.data?.contentHtml || "").toLowerCase();
        return title.includes(q) || content.includes(q);
    });

    feed.innerHTML = "";
    filtered.forEach((p) => feed.appendChild(createPublicPostCard(p.id, p.data)));
}

function applySearch(term) {
    const value = (term || "").trim().toLowerCase();
    if (!value) {
        renderPublicPosts(allPosts);
        return;
    }

    const filtered = allPosts.filter((item) => {
        const title = String(item?.data?.title || "").toLowerCase();
        const bodyText = getTextFromHtml(item?.data?.contentHtml || "").toLowerCase();
        return title.includes(value) || bodyText.includes(value);
    });

    renderPublicPosts(filtered);
}

async function loadPublicPosts() {
    setBlogStatus("Loading posts...");

    try {
        let snap;
        try {
            const q = query(collection(db, "posts"), orderBy("createdAt", "desc"), limit(100));
            snap = await getDocs(q);
        } catch (_orderErr) {
            snap = await getDocs(collection(db, "posts"));
        }

        const docs = snap.docs.map((d) => ({ id: d.id, data: d.data() || {} }));
        docs.sort((a, b) => {
            const aTime = a?.data?.createdAt?.toDate ? a.data.createdAt.toDate().getTime() : 0;
            const bTime = b?.data?.createdAt?.toDate ? b.data.createdAt.toDate().getTime() : 0;
            return bTime - aTime;
        });

        allPosts = docs;
        renderPublicPosts(allPosts);
    } catch (err) {
        if (isPermissionDenied(err)) {
            const signedIn = await tryAnonymousSignIn();
            if (signedIn) {
                await loadPublicPosts();
                return;
            }
            setBlogStatus("Blog is currently private by Firestore rules. Enable public read or anonymous read access.");
            return;
        }
        setBlogStatus(`Failed to load posts: ${escapeHtml(err?.message || "Unknown error")}`);
    }
}

async function loadPublicSinglePost(postId) {
    const box = $("blog_post_view_box");
    const titleEl = $("blog_post_view_title");
    const metaEl = $("blog_post_view_meta");
    const contentEl = $("blog_post_view_content");
    const thumbEl = $("blog_post_view_thumb");
    const authorBox = $("blog_post_view_author_box");
    const authorPfp = $("blog_post_view_author_pfp");
    const authorNameEl = $("blog_post_view_author_name");
    const authorShortEl = $("blog_post_view_author_short_description");
    const backBtn = $("blog_post_view_back");
    const copyLinkBtn = $("blog_post_view_copy_link");

    if (!box || !titleEl || !metaEl || !contentEl || !thumbEl) return;

    if (!postId) {
        setBlogStatus("Missing post ID.");
        box.style.display = "none";
        return;
    }

    try {
        const snap = await getDoc(doc(db, "posts", postId));
        if (!snap.exists()) {
            setBlogStatus("Post not found.");
            box.style.display = "none";
            return;
        }

        const post = snap.data() || {};
        const authorName = (post.authorName || "").trim() || getAuthorDisplayName(post.authorEmail);
        const profile = await getAuthorProfileForPost(post);

        titleEl.textContent = post.title || "Untitled";
        metaEl.innerHTML = `${escapeHtml(formatCreatedAt(post.createdAt))}`;
        contentEl.innerHTML = post.contentHtml || "";

        if (authorBox && authorNameEl && authorShortEl) {
            const authorDisplayName = (profile?.displayName || "").trim() || authorName;
            
            if (post.authorUid) {
                authorNameEl.innerHTML = `<a href="blog_writer.html?uid=${encodeURIComponent(post.authorUid)}" style="color: inherit; text-decoration: none;">${escapeHtml(authorDisplayName)}</a>`;
            } else {
                authorNameEl.textContent = authorDisplayName;
            }
            
            authorShortEl.textContent = (profile?.shortDescription || profile?.speciality || post.authorShortDescription || "").trim() || "Writer";

            const profileImage = (profile?.pfpUrl || post.authorPfpUrl || "").trim();
            if (authorPfp && profileImage) {
                authorPfp.src = profileImage;
                authorPfp.style.display = "block";
                if (post.authorUid) {
                    authorPfp.style.cursor = "pointer";
                    authorPfp.onclick = () => {
                        window.location.href = `blog_writer.html?uid=${encodeURIComponent(post.authorUid)}`;
                    };
                } else {
                    authorPfp.style.cursor = "default";
                    authorPfp.onclick = null;
                }
            } else if (authorPfp) {
                authorPfp.style.display = "none";
                authorPfp.removeAttribute("src");
            }

            authorBox.style.display = "flex";
        }

        if (post.thumbnailUrl) {
            thumbEl.src = post.thumbnailUrl;
            thumbEl.style.display = "block";
        } else {
            thumbEl.style.display = "none";
            thumbEl.removeAttribute("src");
        }

        if (backBtn) {
            backBtn.onclick = () => {
                window.location.href = "blog.html";
            };
        }

        if (copyLinkBtn) {
            copyLinkBtn.onclick = async () => {
                const copied = await copyText(getPostUrl(postId));
                setBlogStatus(copied ? "Post link copied." : "Could not copy link in this browser.");
            };
        }

        const editBtn = $("blog_post_view_edit");
        const deleteBtn = $("blog_post_view_delete");
        
        // Show edit and delete buttons only to authorized non-anonymous users
        if (auth.currentUser && !auth.currentUser.isAnonymous) {
            if (editBtn) {
                editBtn.style.display = "inline-block";
                editBtn.onclick = () => {
                    window.location.href = `admin_post.html?edit=${encodeURIComponent(postId)}`;
                };
            }
            if (deleteBtn) {
                deleteBtn.style.display = "inline-block";
                deleteBtn.onclick = async () => {
                    const confirmed = window.confirm("Delete this post permanently?");
                    if (!confirmed) return;
                    try {
                        await deleteDoc(doc(db, "posts", postId));
                        setBlogStatus("Post deleted successfully.");
                        box.style.display = "none";
                        setTimeout(() => { window.location.href = "blog.html"; }, 1500);
                    } catch (err) {
                        setBlogStatus(`Failed to delete post: ${escapeHtml(err?.message)}`);
                    }
                };
            }
        }

        setBlogStatus("");
        box.style.display = "";
    } catch (err) {
        if (isPermissionDenied(err)) {
            const signedIn = await tryAnonymousSignIn();
            if (signedIn) {
                await loadPublicSinglePost(postId);
                return;
            }
            setBlogStatus("This post is currently private by Firestore rules. Enable public read or anonymous read access.");
            box.style.display = "none";
            return;
        }
        setBlogStatus(`Failed to load post: ${escapeHtml(err?.message || "Unknown error")}`);
        box.style.display = "none";
    }
}

async function getPostsByAuthorUid(authorUid) {
    if (!authorUid) return [];
    try {
        try {
            const q = query(
                collection(db, "posts"),
                where("authorUid", "==", authorUid),
                orderBy("createdAt", "desc"),
                limit(100)
            );
            const snap = await getDocs(q);
            return snap.docs.map((d) => ({ id: d.id, data: d.data() || {} }));
        } catch (_indexedError) {
            const snap = await getDocs(collection(db, "posts"));
            return snap.docs
                .map((d) => ({ id: d.id, data: d.data() || {} }))
                .filter((x) => x?.data?.authorUid === authorUid)
                .sort((a, b) => {
                    const aTime = a?.data?.createdAt?.toDate ? a.data.createdAt.toDate().getTime() : 0;
                    const bTime = b?.data?.createdAt?.toDate ? b.data.createdAt.toDate().getTime() : 0;
                    return bTime - aTime;
                })
                .slice(0, 100);
        }
    } catch (_err) {
        return [];
    }
}

function normalizeBirthDate(value) {
    const raw = String(value || "").trim();
    if (!raw) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;

    const date = new Date(`${raw}T00:00:00`);
    if (Number.isNaN(date.getTime())) return null;

    const current = new Date();
    if (date > current) return null;
    if (date.getFullYear() < 1900) return null;
    return raw;
}

function calculateAgeFromBirthDate(value) {
    const normalized = normalizeBirthDate(value);
    if (!normalized) return null;

    const birth = new Date(`${normalized}T00:00:00`);
    const now = new Date();
    let age = now.getFullYear() - birth.getFullYear();
    const monthDiff = now.getMonth() - birth.getMonth();
    const dayDiff = now.getDate() - birth.getDate();
    if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) age--;
    return age >= 0 ? age : null;
}

function renderPublicPostLinksList(container, items, emptyText) {
    if (!container) return;
    container.innerHTML = "";

    if (!items.length) {
        container.innerHTML = `<li>${escapeHtml(emptyText || "No posts yet.")}</li>`;
        return;
    }

    items.forEach((item) => {
        const li = document.createElement("li");
        const link = document.createElement("a");
        link.href = `blog_post_view.html?id=${encodeURIComponent(item.id)}`;
        link.textContent = item?.data?.title || "Untitled post";
        li.appendChild(link);
        container.appendChild(li);
    });
}

function getProfileDisplayName(profile, fallbackEmail) {
    const value = (profile?.displayName || "").trim();
    return value || getAuthorDisplayName(fallbackEmail || "");
}

async function loadPublicWriterProfile(writerUid) {
    const box = $("blog_writer_profile_box");
    const nameEl = $("blog_writer_name");
    const ageEl = $("blog_writer_age");
    const pfpEl = $("blog_writer_pfp");
    const shortDescriptionEl = $("blog_writer_short_description");
    const descriptionEl = $("blog_writer_description");
    const postsCountEl = $("blog_writer_posts_count");
    const postsFeed = $("blog_writer_posts_feed");

    if (!box || !nameEl || !ageEl || !pfpEl || !postsCountEl || !postsFeed) return;
    if (!writerUid) {
        setBlogStatus("Missing writer id.");
        box.style.display = "none";
        return;
    }

    try {
        const [profile, posts] = await Promise.all([getAdminProfile(writerUid), getPostsByAuthorUid(writerUid)]);
        const fallbackEmail = posts[0]?.data?.authorEmail || "";
        const name = getProfileDisplayName(profile, fallbackEmail);
        const legacyYear = Number(profile?.birthYear);
        const birthDate = normalizeBirthDate(profile?.birthDate) || (Number.isFinite(legacyYear) ? `${Math.floor(legacyYear)}-01-01` : null);
        const age = calculateAgeFromBirthDate(birthDate);

        nameEl.textContent = name;
        ageEl.textContent = age ? `${age} years old` : "Age not provided";
        postsCountEl.textContent = `${posts.length} post${posts.length === 1 ? "" : "s"}`;
        
        if (shortDescriptionEl) {
            const fallbackShort = (posts[0]?.data?.authorShortDescription || "").trim();
            shortDescriptionEl.textContent = (profile?.shortDescription || profile?.speciality || fallbackShort || "").trim() || "Speciality not provided";
        }
        if (descriptionEl) {
            descriptionEl.textContent = (profile?.description || "").trim() || "No writer description provided yet.";
        }

        const profileImage = (profile?.pfpUrl || posts[0]?.data?.authorPfpUrl || "").trim();
        if (profileImage) {
            pfpEl.src = profileImage;
            pfpEl.style.display = "block";
        } else {
            pfpEl.style.display = "none";
            pfpEl.removeAttribute("src");
        }

        if (posts.length === 0) {
            postsFeed.innerHTML = `<p>No published posts by this writer yet.</p>`;
        } else {
            writerPostObjects = posts;
            applyWriterSearch("");
        }

        setBlogStatus("");
        box.style.display = "block";
    } catch (err) {
        if (isPermissionDenied(err)) {
            const signedIn = await tryAnonymousSignIn();
            if (signedIn) {
                await loadPublicWriterProfile(writerUid);
                return;
            }
            setBlogStatus("This profile is currently private by Firestore rules. Enable public read access.");
            box.style.display = "none";
            return;
        }
        setBlogStatus(`Failed to load writer: ${escapeHtml(err?.message || "Unknown error")}`);
        box.style.display = "none";
    }
}

function wirePublicBlog() {
    const feed = $("blog_posts_feed");
    const searchInput = $("blog_search_input");
    const postView = $("blog_post_view_box");
    const writerView = $("blog_writer_profile_box");

    if (feed) {
        loadPublicPosts();

        if (searchInput) {
            searchInput.addEventListener("input", (e) => {
                applySearch(e.target.value || "");
            });
        }
        return;
    }

    if (postView) {
        const queryParams = new URLSearchParams(window.location.search || "");
        const viewPostId = (queryParams.get("id") || "").trim();
        loadPublicSinglePost(viewPostId);
        return;
    }

    if (writerView) {
        const queryParams = new URLSearchParams(window.location.search || "");
        const viewWriterUid = (queryParams.get("uid") || "").trim();
        loadPublicWriterProfile(viewWriterUid);

        const writerSearch = $("blog_writer_search_input");
        if (writerSearch) {
            writerSearch.addEventListener("input", (e) => {
                applyWriterSearch(e.target.value || "");
            });
        }
    }
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wirePublicBlog);
} else {
    wirePublicBlog();
}
