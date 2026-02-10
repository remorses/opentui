#!/usr/bin/env bun
/**
 * publish-opentuah.ts
 *
 * This script temporarily renames all @opentui packages to @opentuah,
 * publishes them to npm, and then restores the original state.
 *
 * Usage (from repo root):
 *   bun scripts/publish-opentuah.ts --dry-run  # Preview changes
 *   bun scripts/publish-opentuah.ts             # Actually publish
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

// Files to modify (relative to ROOT_DIR)
const FILES_TO_MODIFY = [
  "package.json",
  "packages/core/package.json",
  "packages/react/package.json",
  "packages/solid/package.json",
  "packages/web/package.json",
  "packages/core/scripts/build.ts",
  "packages/react/scripts/build.ts",
  "packages/solid/scripts/build.ts",
  "packages/core/scripts/publish.ts",
  "packages/react/scripts/publish.ts",
  "packages/solid/scripts/publish.ts",
  "packages/solid/scripts/solid-plugin.ts",
  "packages/solid/bunfig.toml",
  "packages/core/src/zig.ts",
  "scripts/pre-publish.ts",
  "scripts/prepare-release.ts",
]

// Store backups
const backups = new Map<string, string>()

function log(message: string) {
  console.log(`[opentuah] ${message}`)
}

function logError(message: string) {
  console.error(`[opentuah] ERROR: ${message}`)
}

function backup(filePath: string): void {
  const fullPath = join(ROOT_DIR, filePath)
  if (existsSync(fullPath)) {
    const content = readFileSync(fullPath, "utf8")
    backups.set(filePath, content)
    log(`Backed up: ${filePath}`)
  } else {
    logError(`File not found: ${filePath}`)
  }
}

function restore(filePath: string): void {
  const content = backups.get(filePath)
  if (content !== undefined) {
    const fullPath = join(ROOT_DIR, filePath)
    writeFileSync(fullPath, content)
    log(`Restored: ${filePath}`)
  }
}

function restoreAll(): void {
  log("Restoring all files...")
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

function modifyFile(filePath: string): void {
  const fullPath = join(ROOT_DIR, filePath)
  const original = backups.get(filePath)
  if (original === undefined) {
    logError(`No backup found for: ${filePath}`)
    return
  }

  // Replace all forms of @opentui with @opentuah:
  // - @opentui/ in any context (package refs, template literals, symbols)
  // - "@opentui" and '@opentui' as standalone names
  let modified = original
    .replace(/@opentui\//g, `${NEW_SCOPE}/`)
    .replace(/"@opentui"/g, `"${NEW_SCOPE}"`)
    .replace(/'@opentui'/g, `'${NEW_SCOPE}'`)

  if (isDryRun) {
    // Show diff
    if (original !== modified) {
      log(`Would modify: ${filePath}`)
      // Show a simple diff of changed lines
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
    writeFileSync(fullPath, modified)
    log(`Modified: ${filePath}`)
  }
}

function fixDistImports(dir: string): void {
  const entries = readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      fixDistImports(fullPath)
    } else if (entry.name.endsWith(".js") || entry.name.endsWith(".ts") || entry.name.endsWith(".d.ts")) {
      const content = readFileSync(fullPath, "utf8")
      if (content.includes(OLD_SCOPE)) {
        const fixed = content.replace(/@opentui\//g, `${NEW_SCOPE}/`).replace(/"@opentui"/g, `"${NEW_SCOPE}"`)
        writeFileSync(fullPath, fixed)
        log(`Fixed dist imports: ${fullPath.replace(ROOT_DIR + "/", "")}`)
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
  log("=" .repeat(60))
  log(`Publishing ${NEW_SCOPE} packages`)
  log(`Mode: ${isDryRun ? "DRY RUN" : "PRODUCTION"}`)
  log(`Working directory: ${ROOT_DIR}`)
  log("=" .repeat(60))

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

    // Phase 1: Backup
    log("\n--- PHASE 1: BACKUP ---")
    for (const file of FILES_TO_MODIFY) {
      backup(file)
    }

    // Phase 2: Modify
    log("\n--- PHASE 2: MODIFY ---")
    for (const file of FILES_TO_MODIFY) {
      modifyFile(file)
    }

    if (!isDryRun) {
      // Update lockfile with new package names
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

    // Phase 3.5: Fix import strings in bundled JS output
    // The bundler uses packages: "external" so import strings like
    // `@opentui/core` are preserved verbatim in the output JS.
    // We need to rewrite them in the dist directories.
    if (!isDryRun && !skipBuild) {
      log("\n--- PHASE 3.5: FIX DIST IMPORTS ---")
      const distDirs = ["packages/react/dist", "packages/solid/dist", "packages/core/dist"]
      for (const distDir of distDirs) {
        const fullDistDir = join(ROOT_DIR, distDir)
        if (!existsSync(fullDistDir)) continue
        fixDistImports(fullDistDir)
      }
    }

    // Phase 4: Publish
    log("\n--- PHASE 4: PUBLISH ---")
    if (skipPublish) {
      log("Skipping publish (--skip-publish)")
    } else {
      // Skip pre-publish (has interactive prompt that doesn't work in non-TTY)
      // and run individual publish commands directly
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

main().catch((error) => {
  logError(`Script failed: ${error.message}`)
  process.exit(1)
})
