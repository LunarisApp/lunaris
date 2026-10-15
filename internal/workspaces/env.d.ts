interface ImportMetaEnv {
  readonly DEV: boolean;
  [key: string]: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
