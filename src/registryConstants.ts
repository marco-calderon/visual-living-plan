/** Loopback port for the shared plan registry. Override with `--registry-port`. */
export const DEFAULT_REGISTRY_PORT = 9477

export const DEFAULT_REGISTRY_HOST = '127.0.0.1'

/** How often a serve/review process tells the registry it is still alive. */
export const HEARTBEAT_MS = 5_000

/** Drop a plan when its heartbeat is older than this, or when its pid is gone. */
export const STALE_MS = 20_000
