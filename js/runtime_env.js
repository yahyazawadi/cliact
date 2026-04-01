function parseEnvText(text) {
    const out = {};
    const lines = String(text || "").split(/\r?\n/);

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;

        const idx = trimmed.indexOf("=");
        if (idx <= 0) continue;

        const key = trimmed.slice(0, idx).trim();
        const rawValue = trimmed.slice(idx + 1).trim();
        if (!key) continue;

        out[key] = rawValue;
    }

    return out;
}

function getRuntimeEnvFromWindow() {
    const fromWindow = globalThis?.RUNTIME_ENV;
    if (!fromWindow || typeof fromWindow !== "object") return null;
    return fromWindow;
}

function buildEnvCandidatePaths(envPath) {
    const candidates = [envPath];
    if (envPath.endsWith(".env")) {
        candidates.push(envPath.replace(/\.env$/, "env.public"));
    }
    candidates.push("./env.public");
    candidates.push("../env.public");
    return [...new Set(candidates)];
}

export async function loadRuntimeEnv(envPath = "./.env") {
    const fromWindow = getRuntimeEnvFromWindow();
    if (fromWindow) return fromWindow;

    const candidates = buildEnvCandidatePaths(envPath);
    const errors = [];

    for (const path of candidates) {
        try {
            const response = await fetch(path, { cache: "no-store" });
            if (!response.ok) {
                errors.push(`${path} -> HTTP ${response.status}`);
                continue;
            }

            const text = await response.text();
            return parseEnvText(text);
        } catch (err) {
            errors.push(`${path} -> ${err?.message || "request failed"}`);
        }
    }

    try {
        const mod = await import("../env.public.js");
        const value = mod?.RUNTIME_ENV || mod?.default;
        if (value && typeof value === "object") return value;
    } catch (err) {
        errors.push(`../env.public.js -> ${err?.message || "import failed"}`);
    }

    throw new Error(`Unable to load runtime env. Attempts: ${errors.join(" | ")}`);
}

export function buildFirebaseConfig(env) {
    return {
        apiKey: env.FIREBASE_API_KEY || "",
        authDomain: env.FIREBASE_AUTH_DOMAIN || "",
        projectId: env.FIREBASE_PROJECT_ID || "",
        storageBucket: env.FIREBASE_STORAGE_BUCKET || "",
        messagingSenderId: env.FIREBASE_MESSAGING_SENDER_ID || "",
        appId: env.FIREBASE_APP_ID || "",
        measurementId: env.FIREBASE_MEASUREMENT_ID || "",
    };
}

export function validateFirebaseConfig(config) {
    const required = ["apiKey", "authDomain", "projectId", "appId"];
    const missing = required.filter((key) => !String(config[key] || "").trim());
    return {
        ok: missing.length === 0,
        missing,
    };
}