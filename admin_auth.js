console.log("[admin_auth.js] Starting module initialization...");

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-analytics.js";
import {
    getAuth,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    sendEmailVerification,
    signOut,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
    getFirestore,
    collection,
    addDoc,
    getDocs,
    query,
    orderBy,
    limit,
    serverTimestamp,
    doc,
    getDoc,
    setDoc,
    updateDoc,
    deleteDoc,
    where,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { loadRuntimeEnv, buildFirebaseConfig, validateFirebaseConfig } from "./js/runtime_env.js";

console.log("[admin_auth.js] All imports successful");


const env = await loadRuntimeEnv("./.env");
const firebaseConfig = buildFirebaseConfig(env);
const firebaseConfigCheck = validateFirebaseConfig(firebaseConfig);

if (!firebaseConfigCheck.ok) {
    throw new Error(`Missing Firebase env keys: ${firebaseConfigCheck.missing.join(", ")}`);
}

console.log("[admin_auth.js] Firebase config loaded:", firebaseConfig);

let app, auth, db;
let firebaseInitError = null;

try {
    app = initializeApp(firebaseConfig);
    console.log("[admin_auth.js] ✅ Firebase app initialized successfully:", app);
} catch (initError) {
    firebaseInitError = initError;
    console.error("[admin_auth.js] ❌ CRITICAL ERROR during Firebase app initialization:", initError);
    console.error("Error code:", initError?.code);
    console.error("Error message:", initError?.message);
    console.error("Full error:", JSON.stringify({
        code: initError?.code,
        message: initError?.message,
        name: initError?.name
    }));
}

if (firebaseInitError) {
    console.error("[admin_auth.js] Firebase initialization failed. UI will load but Firebase operations will fail.");
}

try {
    if (app) getAnalytics(app);
    console.log("[admin_auth.js] ✅ Analytics initialized successfully");
} catch (analyticsError) {
    console.warn("[admin_auth.js] Analytics initialization failed (this is usually okay):", analyticsError?.message);
}

try {
    if (app) {
        auth = getAuth(app);
        console.log("[admin_auth.js] ✅ Firebase Auth initialized successfully:", auth);
    }
} catch (authError) {
    console.error("[admin_auth.js] ❌ CRITICAL ERROR during Firebase Auth initialization:", authError);
    console.error("Error code:", authError?.code);
    console.error("Error message:", authError?.message);
    firebaseInitError = authError;
}

try {
    if (app) {
        db = getFirestore(app);
        console.log("[admin_auth.js] ✅ Firestore initialized successfully:", db);
    }
} catch (firestoreError) {
    console.error("[admin_auth.js] ❌ CRITICAL ERROR during Firestore initialization:", firestoreError);
    console.error("Error code:", firestoreError?.code);
    console.error("Error message:", firestoreError?.message);
    firebaseInitError = firestoreError;
}

const IMGBB_API_KEY = env.IMGBB_API_KEY || "";

console.log("[admin_auth.js] Firebase Auth instance:", auth);
console.log("[admin_auth.js] Firestore instance:", db);
if (firebaseInitError) {
    console.error("[admin_auth.js] ⚠️ FIREBASE INITIALIZATION INCOMPLETE - Please check console for errors above");
} else {
    console.log("[admin_auth.js] ✅ Module initialization complete!");
}

function $(id) {
    return document.getElementById(id);
}

function setStatus(message) {
    const el = $("admin_auth_status");
    if (!el) return;
    el.innerHTML = message || "";
}

function setPostStatus(message) {
    const el = $("admin_post_status");
    if (!el) return;
    el.innerHTML = message || "";
}

function setPostsStatus(message) {
    const el = $("admin_posts_status");
    if (!el) return;
    el.innerHTML = message || "";
}

function setProfileStatus(message) {
    const el = $("admin_profile_status");
    if (!el) return;
    el.innerHTML = message || "";
}

function setWriterStatus(message) {
    const el = $("admin_writer_status");
    if (!el) return;
    el.innerHTML = message || "";
}

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#39;");
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

function getAuthorDisplayName(email) {
    const value = (email || "").trim();
    if (!value) return "Unknown author";
    const atIndex = value.indexOf("@");
    return atIndex > 0 ? value.slice(0, atIndex) : value;
}

function getPostSnippet(contentHtml, maxLen = 140) {
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

function formatCreatedAt(value) {
    if (!value || typeof value.toDate !== "function") return "Unknown date";
    return value.toDate().toLocaleString();
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

function getPostShareUrl(postId) {
    return new URL(`blog_post_view.html?id=${encodeURIComponent(postId)}`, window.location.href).href;
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

function normalizeAuthError(err) {
    const code = err?.code || "";
    const withCode = (message) => `${message}${code ? ` (${code})` : ""}`;
    if (code === "auth/invalid-credential" || code === "auth/wrong-password") return withCode("Invalid email or password.");
    if (code === "auth/invalid-login-credentials") return withCode("Invalid email or password.");
    if (code === "auth/user-not-found") return withCode("No account found with that email.");
    if (code === "auth/email-already-in-use") return withCode("That email is already in use.");
    if (code === "auth/weak-password") return withCode("Password is too weak. Use at least 8 characters.");
    if (code === "auth/missing-password") return withCode("Password is required.");
    if (code === "auth/invalid-email") return withCode("Please enter a valid email.");
    if (code === "auth/operation-not-allowed") return withCode("Email/password sign-in is disabled in Firebase Auth settings.");
    if (code === "auth/too-many-requests") return withCode("Too many attempts. Please wait and try again.");
    if (code === "auth/network-request-failed") return withCode("Network request failed. Check your internet connection.");
    if (code === "auth/unauthorized-domain") return withCode("This domain is not authorized in Firebase Auth settings.");
    if (code === "auth/invalid-api-key") return withCode("Firebase API key appears invalid. Check firebaseConfig.");
    const msg = err?.message ? String(err.message) : "Authentication failed.";
    return `${msg}${code ? ` (${code})` : ""}`;
}

function isValidEmail(value) {
    const email = String(value || "").trim();
    if (!email) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeFirestoreError(err) {
    const code = err?.code || "";
    if (code === "permission-denied") {
        return "Permission denied by Firestore security rules.";
    }
    return err?.message || "Firestore operation failed.";
}

function sanitizeHtmlForPost(html) {
    const wrapper = document.createElement("div");
    wrapper.innerHTML = html || "";
    wrapper.querySelectorAll("script").forEach((s) => s.remove());
    wrapper.querySelectorAll("*").forEach((node) => {
        [...node.attributes].forEach((attr) => {
            const name = (attr.name || "").toLowerCase();
            const value = attr.value || "";
            if (name.startsWith("on")) node.removeAttribute(attr.name);
            if ((name === "src" || name === "href") && value.toLowerCase().startsWith("javascript:")) {
                node.removeAttribute(attr.name);
            }
        });
    });
    return wrapper.innerHTML;
}

async function uploadImageToImgbb(dataUrl) {
    const base64Image = (dataUrl.split(",")[1] || "").trim();
    if (!base64Image) throw new Error("Image data is empty.");

    const form = new FormData();
    form.append("image", base64Image);

    const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
        method: "POST",
        body: form,
    });

    const json = await response.json();
    if (!response.ok || !json?.success || !json?.data?.url) {
        throw new Error(json?.error?.message || "imgbb upload failed.");
    }

    return json.data.url;
}

async function uploadDataImagesAndReplace(editorHtml) {
    const wrapper = document.createElement("div");
    wrapper.innerHTML = editorHtml;
    const imgs = [...wrapper.querySelectorAll('img[src^="data:image"]')];
    if (imgs.length === 0) return editorHtml;

    for (const img of imgs) {
        const src = img.getAttribute("src") || "";
        if (!src.startsWith("data:image")) continue;
        const url = await uploadImageToImgbb(src);
        img.setAttribute("src", url);
    }

    return wrapper.innerHTML;
}

async function ensureHostedImageUrl(imageValue) {
    const raw = String(imageValue || "").trim();
    if (!raw) return null;
    if (!raw.startsWith("data:image")) return raw;
    return uploadImageToImgbb(raw);
}

async function isAdminUser(user) {
    if (!user) return false;
    let allow = true;

    try {
        const adminDocSnap = await getDoc(doc(db, "admins", user.uid));
        if (adminDocSnap.exists()) {
            const data = adminDocSnap.data() || {};
            if (typeof data.isAdmin === "boolean") allow = data.isAdmin;
            else if (typeof data.admin === "boolean") allow = data.admin;
            else if (typeof data.enabled === "boolean") allow = data.enabled;
            else if (typeof data.role === "string") allow = data.role.toLowerCase() === "admin";
        }
    } catch (_e) {
        // Keep default behavior if admin lookup fails.
    }

    return allow;
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

function getProfileDisplayName(profile, fallbackEmail) {
    const value = (profile?.displayName || "").trim();
    return value || getAuthorDisplayName(fallbackEmail || "");
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

function renderPostLinksList(container, items, emptyText) {
    if (!container) return;
    container.innerHTML = "";

    if (!items.length) {
        container.innerHTML = `<li>${escapeHtml(emptyText || "No posts yet.")}</li>`;
        return;
    }

    items.forEach((item) => {
        const li = document.createElement("li");
        const link = document.createElement("a");
        link.href = `admin_post_view.html?id=${encodeURIComponent(item.id)}`;
        link.textContent = item?.data?.title || "Untitled post";
        li.appendChild(link);
        container.appendChild(li);
    });
}

function renderPostCards(container, items, emptyText) {
    if (!container) return;
    container.innerHTML = "";

    if (!items.length) {
        container.innerHTML = `<p>${escapeHtml(emptyText || "No posts yet.")}</p>`;
        return;
    }

    items.forEach((item) => {
        container.appendChild(createPostCard(item.id, item.data || {}));
    });
}

function renderProfilePfpPreview(url) {
    const holder = $("admin_profile_pfp_preview");
    if (!holder) return;
    if (!url) {
        holder.innerHTML = "";
        return;
    }
    holder.innerHTML = `<img id="admin_profile_pfp_image" src="${escapeHtml(url)}" alt="Profile picture preview" />`;
}

async function loadAdminProfileEditor(user) {
    const form = $("admin_profile_form");
    if (!form || !user) return null;

    const nameInput = $("admin_profile_name");
    const birthDateInput = $("admin_profile_birth_date");
    const shortDescriptionInput = $("admin_profile_short_description");
    const descriptionInput = $("admin_profile_description");
    const postsFeed = $("admin_profile_posts_feed");

    const profile = await getAdminProfile(user.uid);
    if (nameInput) nameInput.value = profile?.displayName || "";
    if (birthDateInput) {
        const legacyYear = Number(profile?.birthYear);
        const normalizedDate = normalizeBirthDate(profile?.birthDate) || (Number.isFinite(legacyYear) ? `${Math.floor(legacyYear)}-01-01` : "");
        birthDateInput.value = normalizedDate;
    }
    if (shortDescriptionInput) shortDescriptionInput.value = profile?.shortDescription || profile?.speciality || "";
    if (descriptionInput) descriptionInput.value = profile?.description || "";
    renderProfilePfpPreview(profile?.pfpUrl || "");

    const posts = await getPostsByAuthorUid(user.uid);
    renderPostCards(postsFeed, posts, "You have not written any posts yet.");
    return profile || null;
}

async function loadWriterProfile(writerUid) {
    const box = $("admin_writer_profile_box");
    const nameEl = $("admin_writer_name");
    const ageEl = $("admin_writer_age");
    const pfpEl = $("admin_writer_pfp");
    const shortDescriptionEl = $("admin_writer_short_description");
    const descriptionEl = $("admin_writer_description");
    const postsCountEl = $("admin_writer_posts_count");
    const postsFeed = $("admin_writer_posts_feed");

    if (!box || !nameEl || !ageEl || !pfpEl || !postsCountEl || !postsFeed) return;
    if (!writerUid) {
        setWriterStatus("Missing writer id.");
        box.style.display = "none";
        return;
    }

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
        adminPostObjects = posts;
        applyAdminSearch("", "writer");
    }

    setWriterStatus("");
    box.style.display = "";
}

let adminPostObjects = [];

function applyAdminSearch(queryString, type = "posts") {
    let feed, statusEl;
    if (type === "posts") {
        feed = $("admin_posts_feed");
        statusEl = $("admin_posts_status");
    } else if (type === "writer") {
        feed = $("admin_writer_posts_feed");
    }
    if (!feed) return;

    if (!queryString || !queryString.trim()) {
        feed.innerHTML = "";
        adminPostObjects.forEach((p) => feed.appendChild(createPostCard(p.id, p.data)));
        if (statusEl && type === "posts") statusEl.textContent = `Loaded ${adminPostObjects.length} post${adminPostObjects.length === 1 ? "" : "s"}.`;
        return;
    }

    const q = queryString.toLowerCase().trim();
    const filtered = adminPostObjects.filter((p) => {
        const title = (p.data.title || "").toLowerCase();
        const content = (p.data.contentHtml || "").toLowerCase();
        return title.includes(q) || content.includes(q);
    });

    feed.innerHTML = "";
    filtered.forEach((p) => feed.appendChild(createPostCard(p.id, p.data)));
    if (statusEl && type === "posts") statusEl.textContent = `Found ${filtered.length} post${filtered.length === 1 ? "" : "s"} matching "${queryString}".`;
}

function createPostCard(postId, postData) {
    const card = document.createElement("article");
    card.className = "admin-post-card";

    if (postData.thumbnailUrl) {
        const image = document.createElement("img");
        image.className = "admin-post-thumb";
        image.src = postData.thumbnailUrl;
        image.alt = postData.title ? `${postData.title} thumbnail` : "Post thumbnail";
        card.appendChild(image);
    }

    const body = document.createElement("div");
    body.className = "admin-post-body";

    const title = document.createElement("h3");
    title.className = "admin-post-title";
    title.textContent = postData.title || "Untitled";
    body.appendChild(title);

    const meta = document.createElement("p");
    meta.className = "admin-post-meta";

    const authorLink = document.createElement("a");
    authorLink.className = "admin-author-link";
    authorLink.textContent = (postData.authorName || "").trim() || getAuthorDisplayName(postData.authorEmail);
    if (postData.authorUid) {
        authorLink.href = `admin_writer.html?uid=${encodeURIComponent(postData.authorUid)}`;
    } else {
        authorLink.href = "#";
        authorLink.style.pointerEvents = "none";
    }

    const dotSpan = document.createElement("span");
    dotSpan.textContent = " | ";

    const dateSpan = document.createElement("span");
    dateSpan.textContent = formatRelativeCardTime(postData.createdAt);

    meta.appendChild(authorLink);
    meta.appendChild(dotSpan);
    meta.appendChild(dateSpan);
    body.appendChild(meta);

    const snippet = document.createElement("p");
    snippet.className = "admin-post-snippet";
    snippet.textContent = getPostSnippet(postData.contentHtml);
    body.appendChild(snippet);

    const actions = document.createElement("div");
    actions.className = "admin-post-actions";

    card.onclick = (e) => {
        if (e.target.closest('button, a, input')) return;
        window.location.href = `admin_post_view.html?id=${encodeURIComponent(postId)}`;
    };

    const copyLinkBtn = document.createElement("button");
    copyLinkBtn.type = "button";
    copyLinkBtn.className = "admin-card-btn";
    copyLinkBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>`;
    copyLinkBtn.title = "Copy Link";
    copyLinkBtn.onclick = async (e) => {
        e.stopPropagation();
        const copied = await copyText(getPostShareUrl(postId));
        setPostsStatus(copied ? "Post link copied." : "Could not copy link in this browser.");
    };
    actions.appendChild(copyLinkBtn);

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "admin-card-btn";
    editBtn.innerHTML = "&#9998;";
    editBtn.title = "Edit Post";
    editBtn.onclick = (e) => {
        e.stopPropagation();
        window.location.href = `admin_post.html?edit=${encodeURIComponent(postId)}`;
    };
    actions.appendChild(editBtn);

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "admin-card-btn admin-card-btn-danger";
    deleteBtn.innerHTML = "&#128465;";
    deleteBtn.title = "Delete post";
    deleteBtn.onclick = async (e) => {
        e.stopPropagation();
        const confirmed = window.confirm("Delete this post permanently?");
        if (!confirmed) return;
        try {
            await deleteDoc(doc(db, "posts", postId));
            card.remove();
            const feed = $("admin_posts_feed");
            const remaining = feed ? feed.querySelectorAll(".admin-post-card").length : 0;
            setPostsStatus(remaining ? `Loaded ${remaining} post${remaining === 1 ? "" : "s"}.` : "No posts found yet.");
        } catch (err) {
            setPostsStatus(`Failed to delete post: ${normalizeFirestoreError(err)}`);
        }
    };
    actions.appendChild(deleteBtn);

    body.appendChild(actions);
    card.appendChild(body);
    return card;
}

async function loadAdminPosts() {
    const feed = $("admin_posts_feed");
    if (!feed) return;
    feed.innerHTML = "";

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

        adminPostObjects = docs;

        if (!adminPostObjects.length) {
            setPostsStatus("No posts found yet.");
            return;
        }

        applyAdminSearch("", "posts");
    } catch (err) {
        setPostsStatus(`Failed to load posts: ${normalizeFirestoreError(err)}`);
    }
}

async function loadAdminSinglePost(postId) {
    const box = $("admin_post_view_box");
    const titleEl = $("admin_post_view_title");
    const metaEl = $("admin_post_view_meta");
    const contentEl = $("admin_post_view_content");
    const thumbEl = $("admin_post_view_thumb");
    const authorBox = $("admin_post_view_author_box");
    const authorPfp = $("admin_post_view_author_pfp");
    const authorNameEl = $("admin_post_view_author_name");
    const authorShortEl = $("admin_post_view_author_short_description");
    const backBtn = $("admin_post_view_back");
    const copyLinkBtn = $("admin_post_view_copy_link");
    const editBtn = $("admin_post_view_edit");
    const deleteBtn = $("admin_post_view_delete");

    if (!box || !titleEl || !metaEl || !contentEl || !thumbEl) return;

    if (!postId) {
        setPostsStatus("Missing post ID.");
        box.style.display = "none";
        return;
    }

    try {
        const snap = await getDoc(doc(db, "posts", postId));
        if (!snap.exists()) {
            setPostsStatus("Post not found.");
            box.style.display = "none";
            return;
        }

        const post = snap.data() || {};
        const authorName = (post.authorName || "").trim() || getAuthorDisplayName(post.authorEmail);

        titleEl.textContent = post.title || "Untitled";
        metaEl.innerHTML = `${escapeHtml(formatCreatedAt(post.createdAt))}`;
        contentEl.innerHTML = post.contentHtml || "";

        if (authorBox && authorNameEl && authorShortEl) {
            const profile = await getAuthorProfileForPost(post);
            const authorDisplayName = (profile?.displayName || "").trim() || authorName;

            if (post.authorUid) {
                authorNameEl.innerHTML = `<a href="admin_writer.html?uid=${encodeURIComponent(post.authorUid)}" style="color: inherit; text-decoration: none;" class="admin-author-link">${escapeHtml(authorDisplayName)}</a>`;
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
                        window.location.href = `admin_writer.html?uid=${encodeURIComponent(post.authorUid)}`;
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
                window.location.href = "admin_posts.html";
            };
        }

        if (copyLinkBtn) {
            copyLinkBtn.onclick = async () => {
                const copied = await copyText(getPostShareUrl(postId));
                setPostsStatus(copied ? "Post link copied." : "Could not copy link in this browser.");
            };
        }

        if (editBtn) {
            editBtn.onclick = () => {
                window.location.href = `admin_post.html?edit=${encodeURIComponent(postId)}`;
            };
        }

        if (deleteBtn) {
            deleteBtn.onclick = async () => {
                const confirmed = window.confirm("Delete this post permanently?");
                if (!confirmed) return;
                try {
                    await deleteDoc(doc(db, "posts", postId));
                    window.location.href = "admin_posts.html";
                } catch (err) {
                    setPostsStatus(`Failed to delete post: ${normalizeFirestoreError(err)}`);
                }
            };
        }

        setPostsStatus("");
        box.style.display = "";
    } catch (err) {
        setPostsStatus(`Failed to load post: ${normalizeFirestoreError(err)}`);
        box.style.display = "none";
    }
}

function wireUi() {
    const queryParams = new URLSearchParams(window.location.search || "");
    const editPostId = (queryParams.get("edit") || "").trim();
    const viewPostId = (queryParams.get("id") || "").trim();
    const viewWriterUid = (queryParams.get("uid") || "").trim();

    const signInForm = $("admin_signin_form");
    const signUpForm = $("admin_signup_form");
    const actions = $("admin_signed_in_actions");
    const showSignup = $("admin_show_signup");
    const showSignin = $("admin_show_signin");
    const gotoSignup = $("admin_goto_signup");
    const gotoSignin = $("admin_goto_signin");
    const signUpSection = $("admin_signup_section");
    const userEmail = $("admin_user_email");
    const signOutBtn = $("admin_signout_btn");
    const openPostingBtn = $("admin_open_posting_btn");
    const openPostsBtn = $("admin_open_posts_btn");
    const openProfileBtn = $("admin_open_profile_btn");
    const postSection = $("admin_posting_section");
    const postForm = $("admin_post_form");
    const postTitleInput = $("admin_post_title");
    const postEditor = $("admin_post_editor");
    const postClearBtn = $("admin_clear_post_btn");
    const postSubmitBtn = postForm ? postForm.querySelector('input[type="submit"]') : null;
    const postHeading = document.querySelector("#admin_posting_section h4");

    const postMenuItems = document.querySelectorAll("#admin_blogposting_menu");
    const postsListMenuItems = document.querySelectorAll("#admin_bloglist_menu");
    const profileMenuItems = document.querySelectorAll("#admin_profile_menu");
    const hasPostOnlyUi = !!postForm;
    const hasPostsPageUi = !!$("admin_posts_feed");
    const hasSinglePostViewUi = !!$("admin_post_view_content");
    const hasProfileEditorUi = !!$("admin_profile_form");
    const hasWriterPageUi = !!$("admin_writer_profile_box");

    let thumbnailDataUrl = null;
    let existingThumbnailUrl = "";
    let selectedEditorImage = null;
    let profilePfpDataUrl = null;
    let existingProfilePfpUrl = "";

    function showAdminMenus(shouldShow) {
        postMenuItems.forEach((item) => {
            item.style.display = shouldShow ? "" : "none";
        });
        postsListMenuItems.forEach((item) => {
            item.style.display = shouldShow ? "" : "none";
        });
        profileMenuItems.forEach((item) => {
            item.style.display = shouldShow ? "" : "none";
        });
    }

    function showProfilePfpPreview(dataUrl, isHostedImage = false) {
        if (isHostedImage) {
            existingProfilePfpUrl = dataUrl;
            profilePfpDataUrl = null;
        } else {
            profilePfpDataUrl = dataUrl;
            existingProfilePfpUrl = "";
        }
        renderProfilePfpPreview(dataUrl);
    }

    function clearThumbnail() {
        thumbnailDataUrl = null;
        existingThumbnailUrl = "";
        const preview = $("admin_thumbnail_preview");
        if (preview) preview.innerHTML = "";
    }

    function showThumbnailPreview(dataUrl, isHostedImage = false) {
        if (isHostedImage) {
            existingThumbnailUrl = dataUrl;
            thumbnailDataUrl = null;
        } else {
            thumbnailDataUrl = dataUrl;
            existingThumbnailUrl = "";
        }

        const preview = $("admin_thumbnail_preview");
        if (!preview) return;

        preview.innerHTML = `
      <img id="admin_thumbnail_image" src="${dataUrl}" alt="Thumbnail preview" />
      <br />
      <button type="button" id="admin_thumbnail_clear">Remove Thumbnail</button>
    `;

        const clearBtn = $("admin_thumbnail_clear");
        if (clearBtn) {
            clearBtn.addEventListener("click", (e) => {
                e.preventDefault();
                clearThumbnail();
            });
        }
    }

    function getSelectedEditorImage() {
        if (selectedEditorImage && selectedEditorImage.isConnected) return selectedEditorImage;
        const sel = window.getSelection ? window.getSelection() : null;
        const node = sel?.anchorNode;
        if (!node) return null;
        if (node.nodeType === 1 && node.tagName === "IMG") return node;
        if (node.parentElement) return node.parentElement.closest("img");
        return null;
    }

    function resizeSelectedEditorImage(widthPercent) {
        const image = getSelectedEditorImage();
        if (!image) {
            alert("Click an image inside the editor first, then resize it.");
            return;
        }
        const bounded = Math.min(100, Math.max(10, Number(widthPercent) || 100));
        image.style.width = `${bounded}%`;
        image.style.maxWidth = "100%";
        image.style.height = "auto";
    }

    function adjustSelectedEditorImageWidth(deltaPercent) {
        const image = getSelectedEditorImage();
        if (!image) {
            alert("Click an image inside the editor first, then resize it.");
            return;
        }
        const current = parseFloat(image.style.width || "100");
        resizeSelectedEditorImage((isNaN(current) ? 100 : current) + deltaPercent);
    }

    function setSelectedEditorImagePlacement(placement) {
        const image = getSelectedEditorImage();
        if (!image) {
            alert("Click an image inside the editor first, then place it.");
            return;
        }

        image.style.display = "block";
        image.style.float = "none";

        if (placement === "left") {
            image.style.margin = "6px 14px 10px 0";
            image.style.float = "left";
        } else if (placement === "right") {
            image.style.margin = "6px 0 10px 14px";
            image.style.float = "right";
        } else {
            image.style.margin = "10px auto";
        }
    }

    // Surface uncaught script-level failures directly in auth status.
    window.addEventListener("error", (e) => {
        const errorMsg = e?.message ? `Error: ${e.message}` : "An unexpected error occurred.";
        console.error("[GLOBAL ERROR]", errorMsg, e);
        setStatus(errorMsg);
    });

    window.addEventListener("unhandledrejection", (e) => {
        const msg = e?.reason?.message || String(e?.reason || "");
        const finalMsg = msg ? `Promise Rejection Error: ${msg}` : "An unexpected error occurred.";
        console.error("[UNHANDLED REJECTION]", finalMsg, e?.reason);
        setStatus(finalMsg);
    });

    if (!signInForm && !signUpForm && !hasPostOnlyUi && !hasPostsPageUi && !hasSinglePostViewUi && !hasProfileEditorUi && !hasWriterPageUi) {
        setStatus("Admin auth UI: no admin forms found on this page.");
    } else if (signInForm || signUpForm) {
        setStatus(`Admin auth UI loaded.${signInForm ? " Sign-in ready." : ""}${signUpForm ? " Sign-up ready." : ""}`);
    }

    showAdminMenus(false);

    if (showSignup) {
        showSignup.addEventListener("click", (e) => {
            e.preventDefault();
            setStatus("");
            if (signInForm) signInForm.style.display = "none";
            if (signUpForm) signUpForm.style.display = "";
        });
    }

    if (showSignin) {
        showSignin.addEventListener("click", (e) => {
            e.preventDefault();
            setStatus("");
            if (signUpForm) signUpForm.style.display = "none";
            if (signInForm) signInForm.style.display = "";
        });
    }

    if (gotoSignup) {
        gotoSignup.addEventListener("click", (e) => {
            e.preventDefault();
            setStatus("");
            if (signUpSection) signUpSection.style.display = "";
        });
    }

    if (gotoSignin) {
        gotoSignin.addEventListener("click", (e) => {
            e.preventDefault();
            setStatus("");
            if (signUpSection) signUpSection.style.display = "none";
        });
    }

    if (signInForm) {
        signInForm.addEventListener("submit", async (e) => {
            e.preventDefault();

            // Check if Firebase is initialized
            if (!auth || !app) {
                console.error("[SIGN-IN] Firebase is not properly initialized");
                setStatus("❌ Firebase initialization failed. Check browser console for errors and verify your API key.");
                return;
            }

            const email = ($("admin_signin_email")?.value || "").trim();
            const password = $("admin_signin_password")?.value || "";

            if (!email) {
                setStatus("Please enter your email.");
                return;
            }
            if (!isValidEmail(email)) {
                setStatus("Please enter a valid email address.");
                return;
            }
            if (!password) {
                setStatus("Please enter your password.");
                return;
            }

            setStatus("Signing in...");
            console.log("[SIGN-IN] Starting sign-in attempt for:", email);
            try {
                const result = await signInWithEmailAndPassword(auth, email, password);
                console.log("[SIGN-IN] ✅ Sign-in successful:", result.user.uid);
                setStatus("");
            } catch (err) {
                console.error("[SIGN-IN] ❌ Sign-in error details:", err);
                console.error("Error code:", err?.code);
                console.error("Error message:", err?.message);
                console.log("Full error object:", JSON.stringify(err, null, 2));
                const normalizedError = normalizeAuthError(err);
                console.log("[SIGN-IN] Normalized error message:", normalizedError);
                setStatus(`Sign-in failed: ${normalizedError}`);
            }
        });
    }

    if (signUpForm) {
        signUpForm.addEventListener("submit", async (e) => {
            e.preventDefault();

            // Check if Firebase is initialized
            if (!auth || !app) {
                console.error("[SIGN-UP] Firebase is not properly initialized");
                setStatus("❌ Firebase initialization failed. Check browser console for errors and verify your API key.");
                return;
            }

            const email = ($("admin_signup_email")?.value || "").trim();
            const password = $("admin_signup_password")?.value || "";
            const confirmPassword = $("admin_signup_password_confirm")?.value || "";

            if (!email) {
                setStatus("Please enter an email address.");
                return;
            }
            if (!isValidEmail(email)) {
                setStatus("Please enter a valid email address.");
                return;
            }

            if (!password) {
                setStatus("Please enter a password.");
                return;
            }

            if (password.length < 8) {
                setStatus("Password must be at least 8 characters.");
                return;
            }

            if (!confirmPassword) {
                setStatus("Please confirm your password.");
                return;
            }

            if (confirmPassword !== password) {
                setStatus("Passwords do not match.");
                return;
            }

            setStatus("Creating account...");
            console.log("[SIGN-UP] Starting account creation for:", email);
            try {
                const cred = await createUserWithEmailAndPassword(auth, email, password);
                console.log("[SIGN-UP] ✅ Account created, user UID:", cred.user.uid);
                try {
                    await sendEmailVerification(cred.user);
                    console.log("[SIGN-UP] ✅ Verification email sent");
                    setStatus("Account created successfully. Verification email sent. Check inbox/spam, then sign in.");
                } catch (verificationErr) {
                    console.error("[SIGN-UP] ❌ Email verification error:", verificationErr);
                    console.log("Error code:", verificationErr?.code);
                    console.log("Error message:", verificationErr?.message);
                    setStatus(`Account created, but verification email could not be sent: ${normalizeAuthError(verificationErr)}`);
                }
            } catch (err) {
                console.error("[SIGN-UP] ❌ Sign-up error details:", err);
                console.log("Error code:", err?.code);
                console.log("Error message:", err?.message);
                console.log("Full error object:", JSON.stringify(err, null, 2));
                setStatus(`Sign-up failed: ${normalizeAuthError(err)}`);
            }
        });
    }

    if (signOutBtn) {
        signOutBtn.addEventListener("click", async (e) => {
            e.preventDefault();
            setStatus("Signing out...");
            try {
                await signOut(auth);
                setStatus("");
            } catch (err) {
                console.error("Sign-out error details:", err);
                console.log("Error code:", err?.code);
                console.log("Error message:", err?.message);
                setStatus(normalizeAuthError(err));
            }
        });
    }

    if (openPostingBtn) {
        openPostingBtn.addEventListener("click", (e) => {
            e.preventDefault();
            window.location.href = "admin_post.html";
        });
    }

    if (openPostsBtn) {
        openPostsBtn.addEventListener("click", (e) => {
            e.preventDefault();
            window.location.href = "admin_posts.html";
        });
    }

    if (openProfileBtn) {
        openProfileBtn.addEventListener("click", (e) => {
            e.preventDefault();
            window.location.href = "admin_profile.html";
        });
    }

    // Editor and toolbar controls.
    if (postEditor) {
        postEditor.addEventListener("click", (e) => {
            const target = e.target;
            selectedEditorImage = target && target.tagName === "IMG" ? target : null;
        });
    }

    const imgSmallBtn = $("admin_img_small_btn");
    if (imgSmallBtn) imgSmallBtn.addEventListener("click", (e) => { e.preventDefault(); resizeSelectedEditorImage(35); });

    const imgMediumBtn = $("admin_img_medium_btn");
    if (imgMediumBtn) imgMediumBtn.addEventListener("click", (e) => { e.preventDefault(); resizeSelectedEditorImage(60); });

    const imgLargeBtn = $("admin_img_large_btn");
    if (imgLargeBtn) imgLargeBtn.addEventListener("click", (e) => { e.preventDefault(); resizeSelectedEditorImage(100); });

    const imgSmallerBtn = $("admin_img_smaller_btn");
    if (imgSmallerBtn) imgSmallerBtn.addEventListener("click", (e) => { e.preventDefault(); adjustSelectedEditorImageWidth(-10); });

    const imgBiggerBtn = $("admin_img_bigger_btn");
    if (imgBiggerBtn) imgBiggerBtn.addEventListener("click", (e) => { e.preventDefault(); adjustSelectedEditorImageWidth(10); });

    const imgLeftBtn = $("admin_img_left_btn");
    if (imgLeftBtn) imgLeftBtn.addEventListener("click", (e) => { e.preventDefault(); setSelectedEditorImagePlacement("left"); });

    const imgCenterBtn = $("admin_img_center_btn");
    if (imgCenterBtn) imgCenterBtn.addEventListener("click", (e) => { e.preventDefault(); setSelectedEditorImagePlacement("center"); });

    const imgRightBtn = $("admin_img_right_btn");
    if (imgRightBtn) imgRightBtn.addEventListener("click", (e) => { e.preventDefault(); setSelectedEditorImagePlacement("right"); });

    const fileInput = $("admin_thumbnail_file");
    if (fileInput) {
        fileInput.addEventListener("change", (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (event) => {
                showThumbnailPreview(event.target.result);
            };
            reader.readAsDataURL(file);
        });
    }

    const pasteThumbBtn = $("admin_paste_thumb_btn");
    if (pasteThumbBtn) {
        pasteThumbBtn.addEventListener("click", async (e) => {
            e.preventDefault();
            try {
                const items = await navigator.clipboard.read();
                const imageItem = items.find((item) => item.types.some((t) => t.startsWith("image/")));
                if (!imageItem) {
                    alert("No image found in clipboard.");
                    return;
                }
                const imageType = imageItem.types.find((t) => t.startsWith("image/"));
                const blob = await imageItem.getType(imageType);
                const reader = new FileReader();
                reader.onload = (event) => {
                    showThumbnailPreview(event.target.result);
                };
                reader.readAsDataURL(blob);
            } catch (err) {
                alert("Failed to paste image: " + (err?.message || "Check browser permissions."));
            }
        });
    }

    const profilePfpFileInput = $("admin_profile_pfp_file");
    if (profilePfpFileInput) {
        profilePfpFileInput.addEventListener("change", (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (event) => {
                showProfilePfpPreview(event.target.result);
            };
            reader.readAsDataURL(file);
        });
    }

    const profilePfpPasteBtn = $("admin_paste_profile_pfp_btn");
    if (profilePfpPasteBtn) {
        profilePfpPasteBtn.addEventListener("click", async (e) => {
            e.preventDefault();
            try {
                const items = await navigator.clipboard.read();
                const imageItem = items.find((item) => item.types.some((t) => t.startsWith("image/")));
                if (!imageItem) {
                    alert("No image found in clipboard.");
                    return;
                }
                const imageType = imageItem.types.find((t) => t.startsWith("image/"));
                const blob = await imageItem.getType(imageType);
                const reader = new FileReader();
                reader.onload = (event) => {
                    showProfilePfpPreview(event.target.result);
                };
                reader.readAsDataURL(blob);
            } catch (err) {
                alert("Failed to paste image: " + (err?.message || "Check browser permissions."));
            }
        });
    }

    const profilePfpClearBtn = $("admin_profile_pfp_clear");
    if (profilePfpClearBtn) {
        profilePfpClearBtn.addEventListener("click", (e) => {
            e.preventDefault();
            profilePfpDataUrl = null;
            existingProfilePfpUrl = "";
            renderProfilePfpPreview("");
        });
    }

    const boldBtn = $("admin_bold_btn");
    if (boldBtn) boldBtn.addEventListener("click", (e) => { e.preventDefault(); document.execCommand("bold"); postEditor?.focus(); });

    const italicBtn = $("admin_italic_btn");
    if (italicBtn) italicBtn.addEventListener("click", (e) => { e.preventDefault(); document.execCommand("italic"); postEditor?.focus(); });

    const underlineBtn = $("admin_underline_btn");
    if (underlineBtn) underlineBtn.addEventListener("click", (e) => { e.preventDefault(); document.execCommand("underline"); postEditor?.focus(); });

    const fontSizeSelect = $("admin_fontsize_select");
    if (fontSizeSelect) {
        fontSizeSelect.addEventListener("change", (e) => {
            const size = e.target.value;
            if (size) {
                document.execCommand("fontSize", false, size);
                postEditor?.focus();
            }
            e.target.value = "";
        });
    }

    const alignLeftBtn = $("admin_align_left_btn");
    if (alignLeftBtn) alignLeftBtn.addEventListener("click", (e) => { e.preventDefault(); document.execCommand("justifyLeft"); postEditor?.focus(); });

    const alignCenterBtn = $("admin_align_center_btn");
    if (alignCenterBtn) alignCenterBtn.addEventListener("click", (e) => { e.preventDefault(); document.execCommand("justifyCenter"); postEditor?.focus(); });

    const alignRightBtn = $("admin_align_right_btn");
    if (alignRightBtn) alignRightBtn.addEventListener("click", (e) => { e.preventDefault(); document.execCommand("justifyRight"); postEditor?.focus(); });

    const ltrBtn = $("admin_ltr_btn");
    if (ltrBtn) {
        ltrBtn.addEventListener("click", (e) => {
            e.preventDefault();
            if (postEditor) {
                postEditor.dir = "ltr";
                postEditor.focus();
            }
        });
    }

    const rtlBtn = $("admin_rtl_btn");
    if (rtlBtn) {
        rtlBtn.addEventListener("click", (e) => {
            e.preventDefault();
            if (postEditor) {
                postEditor.dir = "rtl";
                postEditor.focus();
            }
        });
    }

    if (postForm) {
        if (editPostId && postHeading) postHeading.textContent = "Edit Blog Post";
        if (editPostId && postSubmitBtn) postSubmitBtn.value = "Update Post";

        postForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            setPostStatus(editPostId ? "Updating post..." : "Publishing post...");

            const title = (postTitleInput?.value || "").trim();
            const contentHtml = postEditor?.innerHTML || "";

            if (!title) {
                setPostStatus("Please enter a title.");
                return;
            }

            const plainTextLen = contentHtml.replace(/<[^>]*>/g, "").trim().length;
            if (!plainTextLen) {
                setPostStatus("Please enter some content in the editor.");
                return;
            }

            try {
                const user = auth.currentUser;
                if (!user) {
                    setPostStatus("You must be signed in to publish.");
                    return;
                }

                const allowed = await isAdminUser(user);
                if (!allowed) {
                    setPostStatus("You are not allowed to publish posts.");
                    return;
                }

                const myProfile = await getAdminProfile(user.uid);
                const authorName = getProfileDisplayName(myProfile, user.email || "");
                const authorPfpUrl = await ensureHostedImageUrl((myProfile?.pfpUrl || "").trim());
                const authorShortDescription = (myProfile?.shortDescription || myProfile?.speciality || "").trim() || null;

                let sanitized = sanitizeHtmlForPost(contentHtml);
                sanitized = await uploadDataImagesAndReplace(sanitized);

                let thumbnailUrl = null;
                if (thumbnailDataUrl) {
                    try {
                        thumbnailUrl = await uploadImageToImgbb(thumbnailDataUrl);
                    } catch (err) {
                        setPostStatus("Failed to upload thumbnail: " + (err?.message || "Unknown error"));
                        return;
                    }
                } else if (existingThumbnailUrl) {
                    try {
                        thumbnailUrl = await ensureHostedImageUrl(existingThumbnailUrl);
                    } catch (err) {
                        setPostStatus("Failed to process thumbnail: " + (err?.message || "Unknown error"));
                        return;
                    }
                }

                const postData = {
                    title,
                    contentHtml: sanitized,
                    authorUid: user.uid,
                    authorEmail: user.email || "",
                    authorName,
                    authorPfpUrl,
                    authorShortDescription,
                    thumbnailUrl: typeof thumbnailUrl === "string" && thumbnailUrl.trim() ? thumbnailUrl : null,
                };

                if (editPostId) {
                    postData.updatedAt = serverTimestamp();
                    await updateDoc(doc(db, "posts", editPostId), postData);
                    setPostStatus("Post updated successfully.");
                } else {
                    postData.createdAt = serverTimestamp();
                    await addDoc(collection(db, "posts"), postData);
                    setPostStatus("Post published successfully.");
                    if (postTitleInput) postTitleInput.value = "";
                    if (postEditor) postEditor.innerHTML = "";
                    clearThumbnail();
                }
            } catch (err) {
                setPostStatus(normalizeFirestoreError(err));
            }
        });
    }

    if (postClearBtn) {
        postClearBtn.addEventListener("click", (e) => {
            e.preventDefault();
            if (postTitleInput) postTitleInput.value = "";
            if (postEditor) postEditor.innerHTML = "";
            clearThumbnail();
            setPostStatus("");
        });
    }

    const profileForm = $("admin_profile_form");
    if (profileForm) {
        profileForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const user = auth.currentUser;
            if (!user) {
                setProfileStatus("Please sign in first.");
                return;
            }

            const displayName = ($("admin_profile_name")?.value || "").trim();
            const birthDateRaw = ($("admin_profile_birth_date")?.value || "").trim();
            const birthDate = birthDateRaw ? normalizeBirthDate(birthDateRaw) : null;
            const shortDescription = ($("admin_profile_short_description")?.value || "").trim();
            const description = ($("admin_profile_description")?.value || "").trim();

            if (birthDateRaw && !birthDate) {
                setProfileStatus("Please enter a valid date in JavaScript format: YYYY-MM-DD.");
                return;
            }

            setProfileStatus("Saving profile...");
            try {
                let pfpUrl = existingProfilePfpUrl || null;
                if (profilePfpDataUrl) {
                    pfpUrl = await uploadImageToImgbb(profilePfpDataUrl);
                } else if (existingProfilePfpUrl) {
                    pfpUrl = await ensureHostedImageUrl(existingProfilePfpUrl);
                }

                const payload = {
                    displayName,
                    birthDate: birthDate || null,
                    shortDescription,
                    speciality: shortDescription,
                    description,
                    pfpUrl: pfpUrl || null,
                    email: (user.email || "").trim().toLowerCase(),
                    updatedAt: serverTimestamp(),
                };

                await setDoc(doc(db, "adminProfiles", user.uid), payload, { merge: true });
                setProfileStatus("Profile saved.");
                existingProfilePfpUrl = pfpUrl || "";
                profilePfpDataUrl = null;

                const posts = await getPostsByAuthorUid(user.uid);
                renderPostCards($("admin_profile_posts_feed"), posts, "You have not written any posts yet.");
            } catch (err) {
                setProfileStatus(`Failed to save profile: ${normalizeFirestoreError(err)}`);
            }
        });
    }

    const postsSearch = $("admin_posts_search_input");
    if (postsSearch) postsSearch.addEventListener("input", (e) => applyAdminSearch(e.target.value, "posts"));

    const writerSearch = $("admin_writer_search_input");
    if (writerSearch) writerSearch.addEventListener("input", (e) => applyAdminSearch(e.target.value, "writer"));

    onAuthStateChanged(auth, async (user) => {
        const isSignedIn = !!user;
        const onSignupPage = !!signUpForm && !signInForm;

        if (isSignedIn) {
            if (actions) actions.style.display = "";
            if (signInForm) signInForm.style.display = "none";
            if (signUpForm) signUpForm.style.display = "none";
            if (signUpSection) signUpSection.style.display = "none";
            if (userEmail) userEmail.textContent = user?.email || "";
            setStatus(user?.email ? `Signed in as <strong>${user.email}</strong>.` : "Signed in.");

            const allowedForPosting = await isAdminUser(user);

            showAdminMenus(!!allowedForPosting);
            if (postSection) postSection.style.display = allowedForPosting ? "" : "none";
            if (openPostingBtn) openPostingBtn.style.display = allowedForPosting ? "" : "none";
            if (openPostsBtn) openPostsBtn.style.display = allowedForPosting ? "" : "none";
            if (openProfileBtn) openProfileBtn.style.display = allowedForPosting ? "" : "none";

            if (hasPostOnlyUi) {
                if (allowedForPosting) {
                    setPostStatus("");
                    setStatus(user?.email ? `Signed in as <strong>${user.email}</strong>. You can publish now.` : "Signed in. You can publish now.");
                } else {
                    setPostStatus("Your account is signed in but not allowed to publish posts.");
                    setStatus("Signed in, but this account cannot publish. Check admins/{uid} and Firestore rules.");
                }
            }

            if (hasPostsPageUi) {
                if (allowedForPosting) {
                    setPostsStatus("Loading posts...");
                    await loadAdminPosts();
                } else {
                    const feed = $("admin_posts_feed");
                    if (feed) feed.innerHTML = "";
                    setPostsStatus("");
                    setStatus("Signed in, but this account cannot access the blog library.");
                }
            }

            if (hasSinglePostViewUi) {
                if (allowedForPosting) {
                    setPostsStatus("Loading post...");
                    await loadAdminSinglePost(viewPostId);
                } else {
                    setPostsStatus("");
                    setStatus("Signed in, but this account cannot access this post.");
                }
            }

            if (hasProfileEditorUi) {
                if (allowedForPosting) {
                    setProfileStatus("Loading your profile...");
                    const profile = await loadAdminProfileEditor(user);
                    existingProfilePfpUrl = profile?.pfpUrl || "";
                    profilePfpDataUrl = null;
                    setProfileStatus("");
                } else {
                    setProfileStatus("");
                    setStatus("Signed in, but this account cannot edit admin profile data.");
                }
            }

            if (hasWriterPageUi) {
                if (allowedForPosting) {
                    setWriterStatus("Loading writer profile...");
                    await loadWriterProfile(viewWriterUid);
                } else {
                    setWriterStatus("");
                    setStatus("Signed in, but this account cannot access writer profiles.");
                }
            }

            if (hasPostOnlyUi && editPostId && allowedForPosting) {
                try {
                    const snap = await getDoc(doc(db, "posts", editPostId));
                    if (!snap.exists()) {
                        setPostStatus("Post not found.");
                    } else {
                        const post = snap.data() || {};
                        if (postTitleInput) postTitleInput.value = post.title || "";
                        if (postEditor) postEditor.innerHTML = post.contentHtml || "";
                        if (post.thumbnailUrl) showThumbnailPreview(post.thumbnailUrl, true);
                        else clearThumbnail();
                    }
                } catch (err) {
                    setPostStatus(`Failed to load post for editing: ${normalizeFirestoreError(err)}`);
                }
            }

            return;
        }

        showAdminMenus(false);
        if (actions) actions.style.display = "none";
        if (openPostingBtn) openPostingBtn.style.display = "none";
        if (openPostsBtn) openPostsBtn.style.display = "none";
        if (openProfileBtn) openProfileBtn.style.display = "none";
        if (signUpForm) signUpForm.style.display = onSignupPage ? "" : "none";
        if (signUpSection) signUpSection.style.display = "none";
        if (signInForm) signInForm.style.display = onSignupPage ? "none" : "";
        if (postSection) postSection.style.display = "none";

        setPostStatus("");
        setPostsStatus("");
        setProfileStatus("");
        setWriterStatus("");

        if (hasPostOnlyUi) {
            setStatus('Please sign in from the <a href="admin.html">Admin page</a> to access blog posting.');
        } else if (hasPostsPageUi) {
            const feed = $("admin_posts_feed");
            if (feed) feed.innerHTML = "";
            setStatus('Please sign in from the <a href="admin.html">Admin page</a> to access the blog library.');
        } else if (hasSinglePostViewUi) {
            setStatus('Please sign in from the <a href="admin.html">Admin page</a> to access this post.');
        } else if (hasProfileEditorUi) {
            setStatus('Please sign in from the <a href="admin.html">Admin page</a> to edit your profile.');
        } else if (hasWriterPageUi) {
            setStatus('Please sign in from the <a href="admin.html">Admin page</a> to view writer profiles.');
        } else {
            setStatus("");
        }
    });
}

try {
    console.log("[admin_auth.js] About to call wireUi()...");
    if (document.readyState === "loading") {
        console.log("[admin_auth.js] Document is loading, attaching DOMContentLoaded listener");
        document.addEventListener("DOMContentLoaded", () => {
            console.log("[admin_auth.js] DOMContentLoaded fired, calling wireUi()");
            wireUi();
            console.log("[admin_auth.js] wireUi() completed successfully");
        });
    } else {
        console.log("[admin_auth.js] Document already loaded, calling wireUi() immediately");
        wireUi();
        console.log("[admin_auth.js] wireUi() completed successfully");
    }
} catch (e) {
    const errorMsg = e?.message || "Error initializing admin auth UI.";
    console.error("[admin_auth.js] ❌ CRITICAL ERROR in wireUi initialization:", e);
    console.error("Error stack:", e?.stack);
    console.error("Full error object:", e);
    // Try to set status, but be prepared for it to fail
    try {
        setStatus(`INIT ERROR: ${errorMsg}`);
    } catch (statusError) {
        console.error("[admin_auth.js] Could not set status message:", statusError?.message);
    }
}
