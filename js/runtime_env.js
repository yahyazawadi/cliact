function parseEnvText(text) {
    const out = {};
    const lines = String(text || "").split(/\r?\n/);

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;

        const idx = trimmed.indexOf("=");
        if (idx <= 0) continue;

        const key = trimmed.slice(0, idx).trim();
        let rawValue = trimmed.slice(idx + 1).trim();
        if (!key) continue;

        // Allow quoted .env values without keeping wrapper quotes.
        if (
            (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
            (rawValue.startsWith("'") && rawValue.endsWith("'"))
        ) {
            rawValue = rawValue.slice(1, -1);
        }

        out[key] = rawValue;
    }

    return out;
}

function getRuntimeEnvFromWindow() {
    const fromWindow = globalThis?.RUNTIME_ENV;
    if (!fromWindow || typeof fromWindow !== "object") return null;
    return fromWindow;
}

export async function loadRuntimeEnv(envPath = "./.env") {
    const fromWindow = getRuntimeEnvFromWindow();
    if (fromWindow) return fromWindow;

    try {
        const response = await fetch(envPath, { cache: "no-store" });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const text = await response.text();
        return parseEnvText(text);
    } catch (err) {
        throw new Error(`Unable to load runtime env from ${envPath}: ${err?.message || "request failed"}`);
    }
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