import CONFIG from './env_config.js';

function $(id) { return document.getElementById(id); }

async function loadPublicRecordings() {
    const feed = $("recordings_feed");
    if (!feed) return;

    try {
        const workerUrl = CONFIG.WORKER_URL;
        const response = await fetch(`${workerUrl}/data`);
        const data = await response.ok ? await response.json() : { recordings: [] };
        
        const recordings = data.recordings || [];

        if (recordings.length === 0) {
            feed.innerHTML = `
                <div style="text-align: center; padding: 40px; background: white; border-radius: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.05);">
                    <h3 class="playfair">Library is Empty</h3>
                    <p style="color: var(--text-light);">Recordings of our global sessions will appear here soon.</p>
                </div>
            `;
            return;
        }

        feed.innerHTML = "<p>Recordings found! Library rendering coming soon...</p>";

    } catch (err) {
        console.error("[RECORDINGS] Fetch error:", err);
    }
}

document.addEventListener("DOMContentLoaded", loadPublicRecordings);
