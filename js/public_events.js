import CONFIG from './env_config.js';

/**
 * public_events.js - IRONCLAD PERSISTENCE VERSION
 * Identity and reactions survive refreshes and browser restarts.
 */

const ANIMALS = ["Lion", "Penguin", "Dolphin", "Panda", "Koala", "Eagle", "Tiger", "Fox", "Wolf", "Elephant", "Giraffe", "Zebra", "Turtle", "Owl", "Bear", "Rabbit", "Deer", "Cheetah", "Sloth", "Kangaroo"];
const ADJECTIVES = ["Inspiring", "Brave", "Hopeful", "Green", "Sustainable", "Global", "Active", "Creative", "Kind", "Strong", "Wise", "Curious", "Bright", "Peaceful", "Bold", "Swift"];

// --- IRONCLAD IDENTITY (localStorage) ---
let userIdentity = localStorage.getItem("climate_action_identity");
if (!userIdentity) {
    userIdentity = `${ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]} ${ANIMALS[Math.floor(Math.random() * ANIMALS.length)]}`;
    localStorage.setItem("climate_action_identity", userIdentity);
}

// --- PERSISTENT REACTION LOCKER ---
let reactedCombos = new Set(JSON.parse(localStorage.getItem("climate_action_reactions") || "[]"));

function saveReactions() {
    localStorage.setItem("climate_action_reactions", JSON.stringify([...reactedCombos]));
}

const workerUrl = CONFIG.WORKER_URL;

async function loadPublicEvents() {
    const feed = document.getElementById("events_container");
    if (!feed) return;

    try {
        const response = await fetch(`${workerUrl}/data`);
        const data = await response.json();
        const events = data.events || [];

        if (events.length === 0) {
            feed.innerHTML = `<div style="text-align:center; padding:60px;"><h2>No Upcoming Events</h2></div>`;
            return;
        }

        events.sort((a, b) => new Date(a.date) - new Date(b.date));

        feed.innerHTML = events.map(ev => {
            const reactions = ev.reactions || {};
            const comments = ev.comments || [];
            const emojis = ["🌍", "❤️", "🙌", "🌱", "💡", "🔥"];

            return `
                <div class="event-card-item">
                    <div class="event-card-header">
                        <div>
                            <h2 class="event-card-title">${ev.title}</h2>
                            <p style="color: #64748b; font-weight: 500;">📅 ${new Date(ev.date).toLocaleString()} | 📍 ${ev.location}</p>
                        </div>
                        <button onclick="openRSVP('${ev.id}')" class="btn-join">Join Event</button>
                    </div>
                    
                    <p style="color: #475569; line-height: 1.6; margin-bottom: 25px; font-size: 1.1rem;">${ev.description}</p>

                    <!-- Event Reactions -->
                    <div style="display: flex; gap: 10px; margin-bottom: 30px; flex-wrap: wrap;">
                        <button onclick="handleReact('${ev.id}', '❤️')" 
                            style="background: ${reactedCombos.has(`${ev.id}-❤️`) ? '#ecfdf5' : '#f8fafc'}; border: 1.5px solid ${reactedCombos.has(`${ev.id}-❤️`) ? '#10b981' : '#e2e8f0'}; padding: 10px 20px; border-radius: 50px; cursor: pointer; display: flex; align-items: center; gap: 8px; transition: all 0.2s;">
                            <span style="font-size: 1.2rem;">❤️</span>
                            <span style="font-weight: 800; font-size: 0.95rem; color: ${reactedCombos.has(`${ev.id}-❤️`) ? '#059669' : '#64748b'}">${reactions["❤️"] || 0}</span>
                        </button>
                    </div>

                    <!-- SOCIAL FEED -->
                    <div class="conversation-box">
                        <h4 style="margin: 0 0 20px 0; font-size: 0.9rem; color: #64748b; text-transform: uppercase; letter-spacing: 1px;">Wildlife Conversations</h4>
                        <div id="comments_${ev.id}" style="display: flex; flex-direction: column; gap: 15px; margin-bottom: 20px;">
                            ${comments.map(c => renderComment(ev.id, c)).join('') || '<p style="color: #94a3b8;">Be the first to speak!</p>'}
                        </div>
                        
                        <div class="comment-input-group">
                            <input type="text" id="input_${ev.id}" placeholder="Speak as ${userIdentity}...">
                            <button onclick="handleComment('${ev.id}')" style="background: #059669; color: white; border: none; padding: 12px 24px; border-radius: 12px; font-weight: 700; cursor: pointer;">Post</button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    } catch (err) { console.error(err); }
}

function renderComment(eventId, comment) {
    const heartCount = comment.reactions?.["❤️"] || 0;
    const replies = comment.replies || [];
    const hasHearted = reactedCombos.has(`${comment.id}-❤️`);

    return `
        <div style="display: flex; flex-direction: column; gap: 10px;">
            <div style="background: white; padding: 16px 20px; border-radius: 18px; border: 1px solid #e2e8f0;">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 5px;">
                    <span style="font-weight: 800; color: #059669; font-size: 0.95rem;">${comment.author}</span>
                    <button onclick="handleCommentReact('${eventId}', '${comment.id}', '❤️')" 
                        style="background: ${hasHearted ? '#fff1f2' : 'transparent'}; border: 1px solid ${hasHearted ? '#fda4af' : '#e2e8f0'}; padding: 4px 10px; border-radius: 50px; cursor: pointer; font-size: 0.8rem; display: flex; align-items: center; gap: 4px;">
                        ❤️ <span style="font-weight: 700;">${heartCount}</span>
                    </button>
                </div>
                <p style="margin: 0; color: #1e293b; font-size: 1rem;">${comment.text}</p>
                <button onclick="toggleReplyBox('${comment.id}')" style="background: none; border: none; color: #64748b; font-size: 0.8rem; font-weight: 600; cursor: pointer; margin-top: 10px; padding: 0;">Reply</button>
                
                <div id="reply_box_${comment.id}" class="reply-input-group" style="display: none;">
                    <input type="text" id="reply_input_${comment.id}" placeholder="Reply to ${comment.author}...">
                    <button onclick="handleReply('${eventId}', '${comment.id}')" style="background: #1e293b; color: white; border: none; padding: 12px 24px; border-radius: 12px; font-weight: 600; cursor: pointer;">Send</button>
                </div>
            </div>

            ${replies.map(r => `
                <div style="margin-left: 40px; background: #f1f5f9; padding: 12px 16px; border-radius: 14px; border: 1px solid #e2e8f0; font-size: 0.9rem;">
                    <span style="font-weight: 700; color: #1e293b;">${r.author}:</span> ${r.text}
                </div>
            `).join('')}
        </div>
    `;
}

window.toggleReplyBox = (cid) => {
    const box = document.getElementById(`reply_box_${cid}`);
    box.style.display = box.style.display === "none" ? "flex" : "none";
};

async function socialFetch(path, body) {
    try {
        const response = await fetch(`${workerUrl}${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        return response.ok;
    } catch (err) { return false; }
}

window.handleReact = async function handleReact(eventId, emoji) {
    const comboId = `${eventId}-${emoji}`;
    const hasReacted = reactedCombos.has(comboId);
    const workerUrl = CONFIG.WORKER_URL;
    
    try {
        const path = hasReacted ? "/unreact" : "/react";
        const res = await fetch(`${workerUrl}${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ eventId, emoji })
        });
        if (res.ok) {
            if (hasReacted) reactedCombos.delete(comboId);
            else reactedCombos.add(comboId);
            localStorage.setItem("climate_action_reactions", JSON.stringify([...reactedCombos]));
            loadPublicEvents();
        }
    } catch (err) { console.error(err); }
}

window.handleComment = async (eventId) => {
    const input = document.getElementById(`input_${eventId}`);
    const text = input?.value.trim();
    if (!text) return;
    if (await socialFetch('/comment', { eventId, text, author: userIdentity })) {
        input.value = "";
        loadPublicEvents();
    }
};

window.handleCommentReact = async (eventId, commentId, emoji) => {
    const combo = `${commentId}-${emoji}`;
    if (reactedCombos.has(combo)) return;
    if (await socialFetch('/comment/react', { eventId, commentId, emoji })) {
        reactedCombos.add(combo);
        saveReactions();
        loadPublicEvents();
    }
};

window.handleReply = async (eventId, commentId) => {
    const input = document.getElementById(`reply_input_${commentId}`);
    const text = input?.value.trim();
    if (!text) return;
    if (await socialFetch('/comment/reply', { eventId, commentId, text, author: userIdentity })) {
        loadPublicEvents();
    }
};

document.addEventListener("DOMContentLoaded", loadPublicEvents);

// RSVP Modal Logic
window.openRSVP = (eventId) => {
    const modal = document.getElementById("rsvp_modal");
    if (!modal) return;
    modal.style.display = "flex";
    modal.dataset.eventId = eventId;
    document.getElementById("rsvp_status").textContent = "";
    document.getElementById("rsvp_email").value = "";
};

window.closeRSVP = () => {
    const modal = document.getElementById("rsvp_modal");
    if (modal) modal.style.display = "none";
};

if (document.getElementById("rsvp_submit_btn")) {
    document.getElementById("rsvp_submit_btn").onclick = async () => {
        const email = document.getElementById("rsvp_email").value.trim();
        const eventId = document.getElementById("rsvp_modal").dataset.eventId;
        const status = document.getElementById("rsvp_status");
        const btn = document.getElementById("rsvp_submit_btn");

        if (!email || !email.includes("@")) {
            status.textContent = "Please enter a valid email.";
            status.style.color = "#ef4444";
            return;
        }

        btn.disabled = true;
        status.textContent = "Registering...";
        status.style.color = "#64748b";

        try {
            const res = await fetch(`${CONFIG.WORKER_URL}/event/rsvp`, {
                method: 'POST',
                body: JSON.stringify({ eventId, email })
            });
            if (res.ok) {
                status.textContent = "✓ Success! You're registered.";
                status.style.color = "#059669";
                setTimeout(window.closeRSVP, 2000);
            } else {
                throw new Error();
            }
        } catch (e) {
            status.textContent = "Something went wrong. Try again.";
            status.style.color = "#ef4444";
        }
        btn.disabled = false;
    };
}
