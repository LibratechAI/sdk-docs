export interface Viewport {
  width: number;
  height: number;
}

// Selectors resolve INSIDE the SDK iframe by default; prefix `host:` to target
// the host page (see frame.ts). `wait_for_url` / `goto` are always page-level.
export type Action =
  | { wait_for: string; timeout?: number }
  | { wait_for_url: string; timeout?: number }
  | { wait_timeout: number }
  | { goto: string }
  | { click: string; force?: boolean }
  | { hover: string }
  | { fill: string; text: string }
  | { press: string; key: string }
  | { scroll: string; to?: 'top' | 'bottom' }
  | { select: string; option: string }
  | { set_files: string; files: string[] };

export interface CaptureSpec {
  mode?: 'page' | 'locator' | 'clip';
  locator?: string;
  padding?: number;
  clip?: { x: number; y: number; width: number; height: number };
  full_page?: boolean;
}

export interface ShotSpec {
  id: string;
  /** Repo-relative PNG path, e.g. assets/images/sdk/auth-screen.png */
  output: string;
  /** Docs page that embeds the output (validate checks the reference). */
  page?: string;
  description?: string;
  viewport: Viewport;
  url: string;
  /** Needs auth/storageState.json (npm run auth); skipped when absent. */
  auth?: boolean;
  /** Reuse the previous shot's page state instead of navigating to `url`. */
  chain?: boolean;
  actions?: Action[];
  capture?: CaptureSpec;
}

export interface RunRecord {
  id: string;
  output: string;
  status: 'ok' | 'failed' | 'skipped';
  durationMs: number;
  bytes?: number;
  error?: string;
}
