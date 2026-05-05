# Climate Action Interactive Platform 🌍
**Status: Production Live (Security Verified)**
& Media Hub

A high-performance, cinematic portfolio and community platform for climate action, featuring session recordings, event management, and a rich blog.

## 🚀 Deployment Guide

This project consists of a **Frontend** (HTML/JS) and a **Backend** (Cloudflare Worker + R2).

### 1. Backend (Cloudflare Worker)
The backend handles data persistence, social interactions (likes, comments), and event RSVPs using Cloudflare R2 storage.

**Prerequisites:**
- A Cloudflare account.
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-setup/) installed.

**Steps:**
1. Create an R2 bucket named `climate-action-data` in your Cloudflare dashboard.
2. Initialize the `data.json` file (optional, the worker will auto-create if missing).
3. Deploy the worker:
   ```bash
   wrangler deploy
   ```
4. Note the URL provided by Cloudflare (e.g., `https://your-worker.your-subdomain.workers.dev`).

### 2. Frontend (Cloudflare Pages / GitHub Pages)
The frontend is a static site.

**Steps:**
1. Update `admin_auth.js` and other JS files with your new **WORKER_URL**.
2. Upload the entire project directory to **Cloudflare Pages** or **GitHub Pages**.
3. If using Cloudflare Pages, you can connect your GitHub repository for automatic deployments.

## 🛠️ Configuration & Security

This project uses a **Zero-Secret Frontend** architecture. No passwords or secrets are stored in your public code.

1. **Worker Secret**: Set your `AUTH_SECRET` in the Cloudflare Worker Dashboard (Settings > Variables).
2. **Admin Login**: When you log in to the admin panel, the **Password** you enter is used as the secret key to talk to the Worker.
3. **env_config.js**: Only contains the public `WORKER_URL`.

To change your backend, simply edit `js/env_config.js`.

## ✨ Features
- **Cinematic Recordings Gallery**: Immersive "Theatre Mode" for session playback.
- **Event RSVP System**: Capture guest emails and export them directly to Google Calendar.
- **Social Engagement**: Unified like/unlike toggle and "Wildlife Conversations" comment sections.
- **Admin Dashboard**: Full CRUD for blog posts, events, and recordings.

## 📄 License
This project is for educational and community action purposes.


if this doesnt work i will kms