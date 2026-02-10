#!/usr/bin/env bun
/**
 * publish-opentuah.ts
 *
 * This script temporarily renames all @opentui packages to @opentuah,
 * publishes them to npm, and then restores the original state.
 *
 * Instead of a hardcoded file list, it auto-discovers ALL files containing
 * @opentui references using `git grep`, so new files are never missed.
 *
 * Usage (from repo root):
 *   bun scripts/publish-opentuah.ts --dry-run  # Preview changes
 *   bun scripts/publish-opentuah.ts             # Actually publish
 *   bun scripts/publish-opentuah.ts --bump      # Bump version first
 */

import { existsSync, readFileSync, writeFileSync, readdirSync } from "fs"
import { join } from "path"
import { spawnSync } from "child_process"

const ROOT_DIR = process.cwd()
const OLD_SCOPE = "@opentui"
const NEW_SCOPE = "@opentuah"

const args = process.argv.slice(2)
const isDryRun = args.includes("--dry-run")
const skipBuild = args.includes("--skip-build")
const skipPublish = args.includes("--skip-publish")
const bumpVersion = args.includes("--bump")

// Directories to skip when discovering files (not relevant to build/publish)
const SKIP_DIRS = ["node_modules", ".git", "dist", "opensrc", "packages/web/src/content"]
// File patterns to skip
const SKIP_PATTERNS = [/\.wasm$/, /bun\.lock$/, /publish-opentuah\.ts$/]

// Store backups
const backups = new Map<string, string>()

function log(message: string) {
  console.log(`[opentuah] ${message}`)
}

function logError(message: string) {
  console.error(`[opentuah] ERROR: ${message}`)
}

/**
 * Auto-discover all files containing @opentui using git grep.
 * This ensures we never miss a file, even if new ones are added later.
 */
function discoverFiles(): string[] {
  const result = spawnSync("git", ["grep", "-l", OLD_SCOPE, "--", "."], {
    cwd: ROOT_DIR,
    encoding: "utf8",
  })

  if (result.status !== 0 && result.status !== 1) {
    logError("git grep failed")
    return []
  }

  const allFiles = (result.stdout || "").trim().split("\n").filter(Boolean)

  return allFiles.filter((file) => {
    // Skip excluded directories
    for (const dir of SKIP_DIRS) {
      if (file.startsWith(dir + "/") || file === dir) return false
    }
    // Skip excluded patterns
    for (const pattern of SKIP_PATTERNS) {
      if (pattern.test(file)) return false
    }
    return true
  })
}

function backup(filePath: string): void {
  const fullPath = join(ROOT_DIR, filePath)
  if (existsSync(fullPath)) {
    const content = readFileSync(fullPath, "utf8")
    backups.set(filePath, content)
  } else {
    logError(`File not found: ${filePath}`)
  }
}

function restore(filePath: string): void {
  const content = backups.get(filePath)
  if (content !== undefined) {
    const fullPath = join(ROOT_DIR, filePath)
    writeFileSync(fullPath, content)
  }
}

function restoreAll(): void {
  log(`Restoring ${backups.size} files...`)
  for (const filePath of backups.keys()) {
    restore(filePath)
  }

  // Restore lockfile
  log("Restoring bun.lock...")
  const result = spawnSync("bun", ["install"], {
    cwd: ROOT_DIR,
    stdio: "inherit",
  })
  if (result.status !== 0) {
    logError("Failed to restore bun.lock")
  }
}

/**
 * Replace all forms of @opentui with @opentuah in a file.
 * Handles: package refs, standalone names, template literals, Symbol.for, etc.
 */
function replaceScope(content: string): string {
  return content.replace(/@opentui(?=\/|["'\s`),;:]|$)/g, NEW_SCOPE)
}

function modifyFile(filePath: string): void {
  const original = backups.get(filePath)
  if (original === undefined) {
    logError(`No backup found for: ${filePath}`)
    return
  }

  const modified = replaceScope(original)

  if (isDryRun) {
    if (original !== modified) {
      log(`Would modify: ${filePath}`)
      const originalLines = original.split("\n")
      const modifiedLines = modified.split("\n")
      for (let i = 0; i < Math.max(originalLines.length, modifiedLines.length); i++) {
        if (originalLines[i] !== modifiedLines[i]) {
          if (originalLines[i]) console.log(`  - ${originalLines[i].trim()}`)
          if (modifiedLines[i]) console.log(`  + ${modifiedLines[i].trim()}`)
        }
      }
    }
  } else {
    const fullPath = join(ROOT_DIR, filePath)
    writeFileSync(fullPath, modified)
    log(`Modified: ${filePath}`)
  }
}

/**
 * Recursively fix @opentui references in dist output files.
 * The bundler uses packages: "external" so import strings are preserved
 * verbatim and need post-build rewriting.
 */
function fixDistImports(dir: string): void {
  const entries = readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      fixDistImports(fullPath)
    } else if (/\.(js|ts|d\.ts|json|md)$/.test(entry.name)) {
      const content = readFileSync(fullPath, "utf8")
      if (content.includes(OLD_SCOPE)) {
        const fixed = replaceScope(content)
        writeFileSync(fullPath, fixed)
        log(`Fixed dist: ${fullPath.replace(ROOT_DIR + "/", "")}`)
      }
    }
  }
}

function runCommand(command: string, args: string[], description: string): boolean {
  log(`Running: ${description}`)
  if (isDryRun) {
    log(`  (dry-run) Would run: ${command} ${args.join(" ")}`)
    return true
  }

  const result = spawnSync(command, args, {
    cwd: ROOT_DIR,
    stdio: "inherit",
  })

  if (result.status !== 0) {
    logError(`Command failed: ${command} ${args.join(" ")}`)
    return false
  }
  return true
}

async function main() {
  log("=".repeat(60))
  log(`Publishing ${NEW_SCOPE} packages`)
  log(`Mode: ${isDryRun ? "DRY RUN" : "PRODUCTION"}`)
  log(`Working directory: ${ROOT_DIR}`)
  log("=".repeat(60))

  // Verify we're in the right directory
  const rootPackageJsonPath = join(ROOT_DIR, "package.json")
  if (!existsSync(rootPackageJsonPath)) {
    logError("package.json not found. Are you in the opentui repo root?")
    process.exit(1)
  }

  const rootPackageJson = JSON.parse(readFileSync(rootPackageJsonPath, "utf8"))
  if (rootPackageJson.name !== "@opentui") {
    logError(`Expected root package name to be "@opentui", got "${rootPackageJson.name}"`)
    process.exit(1)
  }

  try {
    // Phase 0: Bump version if requested
    if (bumpVersion) {
      log("\n--- PHASE 0: BUMP VERSION ---")
      if (!runCommand("bun", ["scripts/prepare-release.ts", "*"], "bun scripts/prepare-release.ts *")) {
        throw new Error("Version bump failed")
      }
    }

    // Phase 1: Discover and backup
    log("\n--- PHASE 1: DISCOVER & BACKUP ---")
    const filesToModify = discoverFiles()
    log(`Found ${filesToModify.length} files containing "${OLD_SCOPE}"`)
    for (const file of filesToModify) {
      backup(file)
    }

    // Phase 2: Modify
    log("\n--- PHASE 2: MODIFY ---")
    for (const file of filesToModify) {
      modifyFile(file)
    }

    if (!isDryRun) {
      if (!runCommand("bun", ["install"], "bun install (update lockfile)")) {
        throw new Error("Failed to update lockfile")
      }
    }

    // Phase 3: Build
    log("\n--- PHASE 3: BUILD ---")
    if (skipBuild) {
      log("Skipping build (--skip-build)")
    } else {
      if (!runCommand("bun", ["run", "build"], "bun run build")) {
        throw new Error("Build failed")
      }
    }

    // Verify dist package.json has the right names
    if (!isDryRun && !skipBuild) {
      const coreDistPkg = join(ROOT_DIR, "packages/core/dist/package.json")
      if (existsSync(coreDistPkg)) {
        const distPkg = JSON.parse(readFileSync(coreDistPkg, "utf8"))
        if (distPkg.name === `${NEW_SCOPE}/core`) {
          log(`Verified: dist/package.json has name "${NEW_SCOPE}/core"`)
        } else {
          logError(`dist/package.json has wrong name: "${distPkg.name}"`)
          throw new Error("Build produced wrong package name")
        }
      }
    }

    // Phase 3.5: Fix import strings in bundled output
    // The bundler uses packages: "external" so import strings like
    // `@opentui/core` are preserved verbatim in the output JS.
    if (!isDryRun && !skipBuild) {
      log("\n--- PHASE 3.5: FIX DIST IMPORTS ---")
      const distDirs = ["packages/react/dist", "packages/solid/dist", "packages/core/dist"]
      for (const distDir of distDirs) {
        const fullDistDir = join(ROOT_DIR, distDir)
        if (!existsSync(fullDistDir)) continue
        fixDistImports(fullDistDir)
      }
    }

    // Phase 3.6: Final verification - ensure no @opentui leaks in dist
    if (!isDryRun && !skipBuild) {
      log("\n--- PHASE 3.6: VERIFY NO LEAKS ---")
      let leakCount = 0
      for (const distDir of ["packages/core/dist", "packages/react/dist", "packages/solid/dist"]) {
        const fullDistDir = join(ROOT_DIR, distDir)
        if (!existsSync(fullDistDir)) continue
        const leaks = findLeaks(fullDistDir)
        for (const leak of leaks) {
          logError(`Leaked @opentui ref in: ${leak}`)
          leakCount++
        }
      }
      if (leakCount > 0) {
        throw new Error(`Found ${leakCount} leaked @opentui references in dist`)
      }
      log("No @opentui leaks found in dist directories")
    }

    // Phase 4: Publish
    log("\n--- PHASE 4: PUBLISH ---")
    if (skipPublish) {
      log("Skipping publish (--skip-publish)")
    } else {
      // Run individual publish commands (skip pre-publish interactive prompt)
      if (!runCommand("bun", ["run", "publish:core"], "bun run publish:core")) {
        throw new Error("Publish core failed")
      }
      if (!runCommand("bun", ["run", "publish:react"], "bun run publish:react")) {
        throw new Error("Publish react failed")
      }
      if (!runCommand("bun", ["run", "publish:solid"], "bun run publish:solid")) {
        throw new Error("Publish solid failed")
      }
    }

    log("\n--- SUCCESS ---")
    log(`Successfully published ${NEW_SCOPE} packages!`)
  } catch (error) {
    logError(`Failed: ${error}`)
    throw error
  } finally {
    // Phase 5: Restore (always runs)
    log("\n--- PHASE 5: RESTORE ---")
    if (!isDryRun) {
      restoreAll()
    } else {
      log("(dry-run) Would restore all files")
    }
  }
}

/**
 * Recursively find files in a directory that still contain @opentui.
 * Used for leak detection after dist fixup.
 */
function findLeaks(dir: string): string[] {
  const leaks: string[] = []
  const entries = readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      leaks.push(...findLeaks(fullPath))
    } else if (/\.(js|ts|d\.ts|json)$/.test(entry.name)) {
      const content = readFileSync(fullPath, "utf8")
      if (content.includes(OLD_SCOPE)) {
        leaks.push(fullPath.replace(ROOT_DIR + "/", ""))
      }
    }
  }
  return leaks
}

main().catch((error) => {
  logError(`Script failed: ${error.message}`)
  process.exit(1)
})
