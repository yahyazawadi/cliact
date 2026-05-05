/**
 * Global Environment Configuration
 * Public configuration only. DO NOT put secrets here.
 */

const CONFIG = {
    // The base URL of your Cloudflare Worker
    WORKER_URL: "https://climate-action.super-yahyaaa.workers.dev"
};

// Auto-clean the URL
CONFIG.WORKER_URL = CONFIG.WORKER_URL.replace(/\/$/, "");

export default CONFIG;
