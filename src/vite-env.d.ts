/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SOGNI_APP_ID: string;
  readonly VITE_MODERATION_PASSWORD: string;
  readonly VITE_MODERATION_ENABLED: string;
  readonly VITE_TURNSTILE_KEY: string;
  readonly MODE: string;
  readonly APP_VERSION: string;
  // Add other environment variables as needed
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
} 