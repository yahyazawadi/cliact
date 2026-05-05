
/**
 * runtime_env.js - Clean Version (Firebase Removed)
 * Handles loading environment variables from the .env file.
 */

export async function loadRuntimeEnv(path = ".env") {
    const env = {};
    try {
        const response = await fetch(path);
        if (!response.ok) return env;
        const text = await response.text();
        text.split("\n").forEach((line) => {
            const [key, ...valueParts] = line.split("=");
            if (key && valueParts.length > 0) {
                const k = key.trim();
                const v = valueParts.join("=").trim();
                if (k) env[k] = v;
            }
        });
        console.log("[runtime_env] Loaded successfully.");
    } catch (err) {
        console.error("[runtime_env] Error loading env:", err);
    }
    return env;
}