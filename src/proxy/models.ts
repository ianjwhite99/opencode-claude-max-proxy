/**
 * Model mapping and Claude executable resolution.
 */

import { exec as execCallback } from "child_process"
import { existsSync } from "fs"
import { fileURLToPath } from "url"
import { join, dirname } from "path"
import { promisify } from "util"

const exec = promisify(execCallback)

export type ClaudeModel = "sonnet" | "sonnet[1m]" | "opus" | "opus[1m]" | "haiku"
export interface ClaudeAuthStatus {
  loggedIn?: boolean
  subscriptionType?: string
  email?: string
}


const AUTH_STATUS_CACHE_TTL_MS = 60_000

let cachedAuthStatus: ClaudeAuthStatus | null = null
let cachedAuthStatusAt = 0
let cachedAuthStatusPromise: Promise<ClaudeAuthStatus | null> | null = null

/**
 * Only Claude 4.6 models support the 1M extended context window.
 * Older models (4.5 and earlier) do not.
 */
function supports1mContext(model: string): boolean {
  // Explicit older versions (4-5, 4.5, etc.) do not support 1M
  if (model.includes("4-5") || model.includes("4.5")) return false
  // Everything else (bare names, 4-6, unknown) defaults to latest (1M capable)
  return true
}

export function mapModelToClaudeModel(model: string, subscriptionType?: string | null): ClaudeModel {
  if (model.includes("haiku")) return "haiku"

  const use1m = supports1mContext(model)

  if (model.includes("opus")) return use1m ? "opus[1m]" : "opus"

  const sonnetOverride = process.env.CLAUDE_PROXY_SONNET_MODEL
  if (sonnetOverride === "sonnet" || sonnetOverride === "sonnet[1m]") return sonnetOverride

  if (!use1m) return "sonnet"
  return subscriptionType === "max" ? "sonnet[1m]" : "sonnet"
}

/**
 * Strip the [1m] suffix from a model, returning the base variant.
 * Used for fallback when the 1M context window is rate-limited.
 */
export function stripExtendedContext(model: ClaudeModel): ClaudeModel {
  if (model === "opus[1m]") return "opus"
  if (model === "sonnet[1m]") return "sonnet"
  return model
}

/**
 * Check whether a model is using extended (1M) context.
 */
export function hasExtendedContext(model: ClaudeModel): boolean {
  return model.endsWith("[1m]")
}

export async function getClaudeAuthStatusAsync(): Promise<ClaudeAuthStatus | null> {
  // Return cached result (positive or negative) if within TTL
  if (cachedAuthStatusAt > 0 && Date.now() - cachedAuthStatusAt < AUTH_STATUS_CACHE_TTL_MS) return cachedAuthStatus
  if (cachedAuthStatusPromise) return cachedAuthStatusPromise

  cachedAuthStatusPromise = (async () => {
    try {
      const { stdout } = await exec("claude auth status", { timeout: 5000 })
      const parsed = JSON.parse(stdout) as ClaudeAuthStatus
      cachedAuthStatus = parsed
      cachedAuthStatusAt = Date.now()
      return parsed
    } catch {
      // Negative cache: avoid re-exec on every request when command fails
      cachedAuthStatus = null
      cachedAuthStatusAt = Date.now()
      return null
    }
  })()

  try {
    return await cachedAuthStatusPromise
  } finally {
    cachedAuthStatusPromise = null
  }
}

// --- Claude Executable Resolution ---

let cachedClaudePath: string | null = null
let cachedClaudePathPromise: Promise<string> | null = null

/**
 * Resolve the Claude executable path asynchronously (non-blocking).
 *
 * Uses a three-tier cache:
 * 1. cachedClaudePath — resolved path, returned immediately on subsequent calls
 * 2. cachedClaudePathPromise — deduplicates concurrent calls during resolution
 * 3. Falls through to resolution logic (SDK cli.js → system `which claude`)
 *
 * The promise is cleared in `finally` to allow retry on failure while
 * cachedClaudePath prevents re-resolution on success.
 */
export async function resolveClaudeExecutableAsync(): Promise<string> {
  if (cachedClaudePath) return cachedClaudePath
  if (cachedClaudePathPromise) return cachedClaudePathPromise

  cachedClaudePathPromise = (async () => {
    // 1. Try the SDK's bundled cli.js (same dir as this module's SDK)
    try {
      const sdkPath = fileURLToPath(import.meta.resolve("@anthropic-ai/claude-agent-sdk"))
      const sdkCliJs = join(dirname(sdkPath), "cli.js")
      if (existsSync(sdkCliJs)) {
        cachedClaudePath = sdkCliJs
        return sdkCliJs
      }
    } catch {}

    // 2. Try the system-installed claude binary
    try {
      const { stdout } = await exec("which claude")
      const claudePath = stdout.trim()
      if (claudePath && existsSync(claudePath)) {
        cachedClaudePath = claudePath
        return claudePath
      }
    } catch {}

    throw new Error("Could not find Claude Code executable. Install via: npm install -g @anthropic-ai/claude-code")
  })()

  try {
    return await cachedClaudePathPromise
  } finally {
    cachedClaudePathPromise = null
  }
}

/** Reset cached path — for testing only */
export function resetCachedClaudePath(): void {
  cachedClaudePath = null
  cachedClaudePathPromise = null
}

/** Reset cached auth status — for testing only */
export function resetCachedClaudeAuthStatus(): void {
  cachedAuthStatus = null
  cachedAuthStatusAt = 0
  cachedAuthStatusPromise = null
}

/**
 * Check if an error is a "Controller is already closed" error.
 * This happens when the client disconnects mid-stream.
 */
export function isClosedControllerError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return error.message.includes("Controller is already closed")
}
