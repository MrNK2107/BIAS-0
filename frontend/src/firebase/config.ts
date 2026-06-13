import {
  initializeApp,
  type FirebaseApp,
  type FirebaseOptions,
} from "firebase/app";

const PLACEHOLDER_TOKENS = [
  "your-",
  "your_",
  "changeme",
  "placeholder",
  "example",
  "xxxxx",
];

export const REQUIRED_FIELDS = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_STORAGE_BUCKET",
  "VITE_FIREBASE_MESSAGING_SENDER_ID",
  "VITE_FIREBASE_APP_ID",
] as const;

export class FirebaseConfigError extends Error {
  readonly missing: readonly string[];
  readonly placeholders: readonly string[];

  constructor(missing: readonly string[], placeholders: readonly string[]) {
    const lines: string[] = [
      "Firebase configuration is invalid.",
      "",
      "Auth flows will NOT work until this is fixed.",
    ];
    if (missing.length) {
      lines.push(`Missing env vars: ${missing.join(", ")}`);
    }
    if (placeholders.length) {
      lines.push(`Placeholder values detected in: ${placeholders.join(", ")}`);
    }
    lines.push(
      "",
      "Fix: copy frontend/.env.example to frontend/.env and fill in the values",
      "from your Firebase project (https://console.firebase.google.com/  ->",
      "Project settings -> General -> Your apps -> Web app -> Config).",
      "Then restart `npm run dev`.",
    );
    super(lines.join("\n"));
    this.name = "FirebaseConfigError";
    this.missing = missing;
    this.placeholders = placeholders;
  }
}

function isPlaceholder(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (!v) return true;
  return PLACEHOLDER_TOKENS.some((tok) => v.startsWith(tok) || v.includes(tok));
}

function readEnv(key: string): string {
  return (import.meta.env as Record<string, string | undefined>)[key] ?? "";
}

let _configError: FirebaseConfigError | null = null;
let _app: FirebaseApp | null = null;

function validate(): { config: FirebaseOptions } {
  const values = Object.fromEntries(
    REQUIRED_FIELDS.map((k) => [k, readEnv(k).trim()]),
  ) as Record<(typeof REQUIRED_FIELDS)[number], string>;

  const missing = REQUIRED_FIELDS.filter((k) => !values[k]);
  const placeholders = REQUIRED_FIELDS.filter((k) => isPlaceholder(values[k]));

  if (missing.length || placeholders.length) {
    throw new FirebaseConfigError(missing, placeholders);
  }
  return {
    config: {
      apiKey: values.VITE_FIREBASE_API_KEY,
      authDomain: values.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: values.VITE_FIREBASE_PROJECT_ID,
      storageBucket: values.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: values.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: values.VITE_FIREBASE_APP_ID,
    },
  };
}

export function ensureFirebase(): FirebaseApp {
  if (_app) return _app;
  const { config } = validate();
  _app = initializeApp(config);
  return _app;
}

export function getConfigError(): FirebaseConfigError | null {
  if (_configError) return _configError;
  if (_app) return null;
  try {
    validate();
    return null;
  } catch (err) {
    if (err instanceof FirebaseConfigError) {
      _configError = err;
      return err;
    }
    const fallback = new FirebaseConfigError([], [...REQUIRED_FIELDS]);
    _configError = fallback;
    return fallback;
  }
}

export function isFirebaseConfigured(): boolean {
  return getConfigError() === null;
}
