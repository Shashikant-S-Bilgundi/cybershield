interface ImportMetaEnv {
  readonly VITE_USE_MOCKS?: string;
  readonly VITE_API_URL?: string;
  readonly VITE_MOCK_FRESH?: string;
  readonly VITE_INGEST_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}