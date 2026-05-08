# Cherry-Pick List: Pro 1.18.1 → 1.19.0

- **Range**: `5cf7ef6e` (release 1.18.1) → `ada94096` (release 1.19.0)
- **Total commits**: 152
- **Summary**: PICK 103 · SKIP 42 · CAUTION 7
- **Decisions**: ✅ electron-vite · ✅ pnpm · ❌ Guide/Onboarding · ❌ JK Analytics

## Legend

| Status | Meaning |
|--------|---------|
| **PICK** | Cherry-pick directly |
| **SKIP** | Do not cherry-pick |
| **CAUTION** | Cherry-pick with `--no-commit`, review/remove problematic parts, then commit |

## Full Pick List (chronological order)

### 1. Post-1.18.1 Fixes & File Features (→ 1.18.2)

| # | Hash | Message | Status | Notes |
|---|------|---------|--------|-------|
| 1 | `c67a82e8` | fix: android version name | SKIP | Pure mobile (android only) |
| 2 | `87e05c06` | fix: hard to select text on ios when opening a modal | PICK | Touches `src/renderer/modals/` only — general UI fix |
| 3 | `254a4ec2` | fix: enhance support tool usage for read-file scope (#475) | PICK | |
| 4 | `0e3f6a97` | feat: add file parsing error modal and improve error handling (#474) | PICK | |
| 5 | `da63385a` | Revert "fix: do not reply non user message" | PICK | |
| 6 | `dcf30a55` | feat: add content viewer modal and update translations (#477) | PICK | |
| 7 | `145ed834` | feat: enhance file type validation and error handling for uploads (#476) | PICK | |
| 8 | `a82c2bb5` | feat: implement log export and management features across platforms (#478) | CAUTION | Cross-platform — review for mobile-specific parts |
| 9 | `4f2f18e0` | feat: add DeepSeek integration with updated model handling (#479) | PICK | |
| 10 | `6a613fcb` | fix: file pre-processing state (#473) | PICK | |
| 11 | `ad59c521` | Feat/upgrade capacitor 7 (#422) | SKIP | Pure mobile (capacitor/android/ios + package.json mobile deps) |
| 12 | `bc2dd578` | fix: #2761 add temperature&topP to gemini provider setting | PICK | |
| 13 | `c61c3a1a` | feat: enhance toolset descriptions for file, kb, and web search tools (#480) | PICK | |
| 14 | `81f4b384` | Feat/in app tracking (#482) | CAUTION | Touches shared UI components + license views; review for Pro-only tracking code |
| 15 | `23ef4168` | refactor: tweak quota display; extract shared components | PICK | |
| 16 | `5dcbe058` | feat: add support for image file types in file accept configuration | PICK | |
| 17 | `467a7db6` | feat: enhance knowledge base file processing (#484) | PICK | |
| 18 | `37b940f5` | feat: suspend kb file parsing enhance for now | PICK | |
| 19 | `09458fad` | feat: update gemini image model support | PICK | |
| 20 | `a3ee3645` | feat: enhance mobile exporter with detailed logging and error handling | SKIP | Touches only `mobile_exporter.ts` — mobile-specific |
| 21 | `f07fc071` | fix: log in constructor cause mobile load failed | SKIP | Touches only `mobile_exporter.ts` — mobile-specific |
| 22 | `bcd362e6` | feat: optimize trial ux | CAUTION | License/trial UI — review for Pro-only references |
| 23 | `f9227d58` | Fix/input-file-ext (#485) | PICK | |
| 24 | `2e27a417` | release 1.18.2 | SKIP | Intermediate release |

### 2. Test & KB Improvements

| # | Hash | Message | Status | Notes |
|---|------|---------|--------|-------|
| 25 | `7240b77a` | fix: version | PICK | |
| 26 | `e2ce78df` | fix(test): tool call args is object (#488) | PICK | |
| 27 | `60f46a98` | feat: auto focus message input on window focused (#486) | PICK | |
| 28 | `63dac20b` | fix: file name and optimise file tools (#487) | PICK | |
| 29 | `aa92c83e` | feat: Add integration tests for file conversation feature (#483) | PICK | |
| 30 | `43a2f95c` | Feat/kb using backend parsing as a fallback (only Pro user) (#489) | CAUTION | Title says "only Pro user" — review for conditional logic |
| 31 | `d57abb8d` | chore: i18n | PICK | |
| 32 | `d0df5167` | chore: more i18n | PICK | |
| 33 | `177f47a4` | fix(test): rename grep_file to search_file_content, update vite (#490) | PICK | |
| 34 | `5cf055b7` | fix: kb add fallback if 0 chunk | PICK | |

### 3. CI & Mobile-Only

| # | Hash | Message | Status | Notes |
|---|------|---------|--------|-------|
| 35 | `27d0ae85` | chore: android ci (#491) | SKIP | Touches only `.github/workflows/release-android.yml` |
| 36 | `7aff7114` | feat: upload dmg & exe release file to Github Release too | SKIP | Pro CI/CD |

### 4. Session Search, Web Search, Storage

| # | Hash | Message | Status | Notes |
|---|------|---------|--------|-------|
| 37 | `2e46c7c3` | feat: auto enable web search when using chatbox as provider (#494) | PICK | |
| 38 | `1c0fd5e9` | feat: add search on sessionList | PICK | |
| 39 | `bbfa451b` | fix: add error handling and logging for storage operations (#495) | PICK | |

### 5. Build Tool Migration (MAJOR)

| # | Hash | Message | Status | Notes |
|---|------|---------|--------|-------|
| 40 | `2fa50fe2` | use electron-vite as the build tool (#481) | CAUTION | **MAJOR**: 140 files changed. Migrates webpack→electron-vite. Pick with `--no-commit`, verify package.json name stays `xyz.chatboxapp.ce` |

### 6. More Features & Fixes

| # | Hash | Message | Status | Notes |
|---|------|---------|--------|-------|
| 41 | `f3b27e22` | Fix/web browsing setting (#496) | PICK | |
| 42 | `67e0255b` | Mobile experience optimization (#493) | CAUTION | 20+ files, mainly `src/renderer/components/` + package.json. Pick `src/` changes, drop mobile-specific parts |
| 43 | `17396fb6` | fix(test): add alias @shared to vitest config | PICK | |
| 44 | `bdc606e9` | fix: delete for nav (#498) | PICK | |
| 45 | `d54b3da6` | test: add model provider integration tests (#497) | PICK | |
| 46 | `11f73006` | perf: parallelize blob fetches in genMessageContext (#500) | PICK | |
| 47 | `5b1531c4` | chore: update CLAUDE.md | SKIP | Pro-specific AI config |
| 48 | `fc237a37` | fix: add cache eviction and cleanup to prevent memory leaks (#499) | PICK | |
| 49 | `d4548d67` | feat: inject file list into kb toolset prompt (#501) | PICK | |
| 50 | `804c2036` | feat: add model icons and update ModelSelector components (#502) | PICK | |
| 51 | `6b9f8451` | feat: enable update reminder for Android (#503) | PICK | Touches shared `Sidebar.tsx`, `useVersion.ts`, `about.tsx` — general update reminder logic |
| 52 | `4eab0e5b` | fix: add es-toolkit dependency required by lobehub icons | PICK | |

### 7. Claude/Pro-Specific Config

| # | Hash | Message | Status | Notes |
|---|------|---------|--------|-------|
| 53 | `e9137ce9` | chore: add claude commands | SKIP | `.claude/` only |
| 54 | `4dac1d2a` | chore: add claude commands | SKIP | `.claude/` only |
| 55 | `fa109d7d` | fix(ci): add explicit rollup platform package installation | SKIP | Pro CI fix |

### 8. KB, License, Error Handling

| # | Hash | Message | Status | Notes |
|---|------|---------|--------|-------|
| 56 | `90818661` | fix: revert kb prompt injecting to user msg; enrich kb tool desc | PICK | |
| 57 | `acc32823` | feat: add visual indicators for expired license status (#506) | PICK | License UI — CE also has license key support |
| 58 | `f35b38d3` | fix: improve Check Update button responsiveness on About page | PICK | |
| 59 | `23aa5041` | feat: add automatic retry mechanism for 5xx errors (#508) | PICK | |
| 60 | `28f57846` | fix: prevent duplicate quote prefixes in sequenceMessages (#509) | PICK | |
| 61 | `eaa1488d` | test: add test for quote prefix accumulation prevention | PICK | |
| 62 | `2b45b479` | fix: message edit modal height (#512) | PICK | |
| 63 | `c5f97a72` | refactor: consolidate release workflows with Slack notifications (#510) | SKIP | Pro CI/CD |
| 64 | `ec1a2a56` | chore: fix lint and type issues (#507) | PICK | |
| 65 | `839c04a6` | debug: add logging to track settings reset issue (#513) | PICK | |
| 66 | `754eae75` | refactor: enhance file conversation integration tests | PICK | |
| 67 | `ba39fc1a` | Feat/optimize kb file parse (#511) | PICK | |
| 68 | `72c93183` | fix: improve 5xx error detection for ApiError in retry mechanism | PICK | |
| 69 | `fbc72d2b` | fix: adaptive modal height (#514) | PICK | |

### 9. Pro Docs & KB Tools

| # | Hash | Message | Status | Notes |
|---|------|---------|--------|-------|
| 70 | `be343d84` | chore: better wording | PICK | |
| 71 | `6e38bf4d` | chore: open-spec docs | SKIP | Pro-specific `.claude/`, `AGENTS.md`, `CLAUDE.md`, `openspec/` |
| 72 | `26a121ef` | docs: add AGENTS.md with project-specific development guide | SKIP | Pro AGENTS.md |
| 73 | `929b0439` | fix: test mineru connection | PICK | |
| 74 | `4a78ba69` | refactor: remove document parser auto fallback; unify ux with web search | PICK | |
| 75 | `d5b02547` | fix: ensure global search located to the target place | PICK | |
| 76 | `b2c414de` | chore: web search ui | PICK | |
| 77 | `7433022a` | chore: improve err msg | PICK | |
| 78 | `7e5b1cbf` | chore: improve err msg | PICK | |

### 10. Slack/Claude Code Contributions & Code Block Fix

| # | Hash | Message | Status | Notes |
|---|------|---------|--------|-------|
| 79 | `cce10b1b` | Claude/slack add chatbox new conversation e ykj u (#520) | PICK | Touches `Sidebar.tsx` — actual UI improvement |
| 80 | `b04332d9` | fix: inline file content for small files (≤500 lines) (#518) | PICK | |
| 81 | `e4b2b54c` | Fix Code Block Visibility in Light Mode (#521) | PICK | |
| 82 | `5fc6f47c` | Claude/slack fix edit message close c3 qz o (#522) | PICK | i18n + MessageEdit.tsx — actual bug fix |

### 11. Release 1.18.3 & 1.18.4

| # | Hash | Message | Status | Notes |
|---|------|---------|--------|-------|
| 83 | `c4018565` | release 1.18.3 | SKIP | Intermediate release |
| 84 | `9fe9853f` | fix: set build target to es2020 for browser compatibility | PICK | Build config for electron-vite |
| 85 | `bbc9e5a8` | fix: update changelog date for version 1.18.3 | PICK | |
| 86 | `bb26e007` | fix: try fix web app relative path issue | PICK | Build config for electron-vite |
| 87 | `5d3cab4a` | chore: robuster building config | PICK | Build config for electron-vite |
| 88 | `62b39b87` | fix: prevent Claude API error when both temperature and top_p are set (#525) | PICK | |
| 89 | `701f4b5a` | release 1.18.4 | SKIP | Intermediate release |

### 12. Major Refactors (Provider, AI SDK, Context Management)

| # | Hash | Message | Status | Notes |
|---|------|---------|--------|-------|
| 90 | `b91d7c06` | feat: move chatboxai from providers to top-level settings (#527) | PICK | |
| 91 | `28fe3eab` | feat: refactor image generation to standalone tool page (#504) | PICK | |
| 92 | `538c853a` | chore: update claude command | SKIP | `.claude/` only |
| 93 | `958b0461` | feat: upgrade AI SDK from v5 to v6 (#515) | PICK | **MAJOR** |
| 94 | `0206f709` | Feat/context-management (#528) | PICK | **MAJOR**: New feature |
| 95 | `0724cb33` | feat: token percentage display and context length error detection (#530) | PICK | |
| 96 | `c7a5ddcb` | fix: compaction error message overflow and add dismiss button | PICK | |
| 97 | `2c976182` | chore: add prd doc | SKIP | Pro-specific `tasks/` doc |
| 98 | `fb39d71b` | feat: change default max context message count to unlimited | PICK | |
| 99 | `61d5cbe2` | feat: Provider System Refactor - Registry-based Architecture (#533) | PICK | **MAJOR** |
| 100 | `e87f4d15` | feat: update img tool ui | PICK | |
| 101 | `8d0fd68d` | feat: update img tool ui; i18n | PICK | |
| 102 | `8e19b454` | refactor: Code organization optimization - session module split (#534) | PICK | **MAJOR**: Touches README.md — `git checkout HEAD -- README.md` after pick |
| 103 | `6f7a330a` | fix(token-estimation): fix session switching and context change handling (#535) | PICK | Touches README.md — `git checkout HEAD -- README.md` after pick |
| 104 | `251bce8f` | fix(ui): remove calculating animation and text from token menu header | PICK | |
| 105 | `e893e0d2` | perf(compaction): use cached tokens to avoid UI lag on message send (#536) | PICK | |
| 106 | `a1ddc757` | feat(chat): improve error message UX with expand/collapse and copy (#537) | PICK | |
| 107 | `3cb202c5` | fix(input-box): fix auto-compaction toggle isolation and custom model support (#539) | PICK | |
| 108 | `5abc55b1` | fix(session): copy compactionPoints with correct ID mapping (#538) | PICK | |
| 109 | `d3261f0a` | fix: optimize build to reduce memory usage (#532) | PICK | Build config for electron-vite |
| 110 | `c97fc07d` | fix(settings): fix navigation from Chatbox AI to Chat Settings | PICK | |

### 13. New User Onboarding & Guide (Pro Feature)

| # | Hash | Message | Status | Notes |
|---|------|---------|--------|-------|
| 111 | `19e858b9` | Feat/new user onboarding (#531) | SKIP | **54 files, 4052 insertions** — entirely new Pro feature (guide system) + `tasks/` PRD |
| 112 | `1187843c` | feat: improve stability; split guide hook | SKIP | Depends on #111 guide system; also touches `capacitor.config.ts` |
| 113 | `57ec992d` | refactor(context-management): remove deprecated code and optimize token calculations | PICK | |
| 114 | `cbbdbdae` | feat: minor ui | SKIP | Touches only `routes/guide/` — depends on onboarding system |
| 115 | `fd0e57ea` | Merge branch 'next' of github.com:chatboxai/chatbox-pro into next | SKIP | Merge commit |
| 116 | `55cfe62d` | feat: add tooltip to inputbox btns | PICK | |
| 117 | `185f5b96` | feat: add free trial entry in several places; minor improve guide text | SKIP | Pro trial/guide feature — touches guide hooks |
| 118 | `c98b9a13` | feat: add free trial entry in several places; minor improve guide text | SKIP | Duplicate of above |
| 119 | `39c8f204` | Merge branch 'next' of github.com:chatboxai/chatbox-pro into next | SKIP | Merge commit |

### 14. Token Estimation, Summary, Guide Optimization

| # | Hash | Message | Status | Notes |
|---|------|---------|--------|-------|
| 120 | `412f5d97` | chore: update i18n | PICK | |
| 121 | `02cb867e` | Feat/unify-token-estimation-v2 (#541) | PICK | |
| 122 | `829c13c4` | feat(chat): add edit button to SummaryMessage (#544) | PICK | |
| 123 | `9efef510` | Feat/guide optimization (#548) | SKIP | Guide/onboarding system (Pro feature) |
| 124 | `667c8a4e` | fix: ensure ChatboxAI provider appears first in model selector (#549) | PICK | |

### 15. Package Manager Migration (MAJOR)

| # | Hash | Message | Status | Notes |
|---|------|---------|--------|-------|
| 125 | `4d1085da` | build: migrate from npm to pnpm (#547) | CAUTION | **MAJOR**: 15 files, 29k insertions. Pick with `--no-commit`, verify package.json name stays `xyz.chatboxapp.ce` |

### 16. Post-Migration Fixes & Guide

| # | Hash | Message | Status | Notes |
|---|------|---------|--------|-------|
| 126 | `66947964` | feat: add playwright-cli skill for browser automation (#550) | SKIP | `.claude/skills/` only |
| 127 | `83fcd742` | fix: PDF parsing broken after pnpm migration (#551) | PICK | Depends on pnpm migration (#125) — adopted |
| 128 | `316ff3bd` | docs: update npm to pnpm in AGENTS.md and CLAUDE.md (#552) | SKIP | Pro docs only |
| 129 | `621a711f` | Feat/optimize guide (#553) | SKIP | Guide system (Pro) + touches `capacitor.config.ts` |
| 130 | `fdc0a662` | Feat/add jk tracking (#554) | SKIP | JK analytics (Pro feature) |
| 131 | `3abca200` | Feat/optimize guide (#555) | SKIP | Guide system (Pro) |
| 132 | `57206253` | Feat/optimize guide (#556) | SKIP | Guide system (Pro) |
| 133 | `d3912257` | fix: add value prop for cmdk (#557) | PICK | |
| 134 | `ec0089c1` | Feat/add jk tracking (#558) | SKIP | JK analytics (Pro feature) |
| 135 | `55066651` | feat: add i18n for error msgs (#559) | PICK | |
| 136 | `31e548a0` | fix: pass modelSupportVision to convertToModelMessages (#562) | PICK | |
| 137 | `609525f5` | feat: add i18n for guide (#563) | SKIP | Guide system (Pro) |
| 138 | `ab59ca63` | feat: optimize message attachment display and increase upload limit (#564) | PICK | Touches README.md — `git checkout HEAD -- README.md` after pick |

### 17. Version Bumps & Beta Fixes

| # | Hash | Message | Status | Notes |
|---|------|---------|--------|-------|
| 139 | `fd6487ff` | chore: bump version to 1.19.0 (build 115) | SKIP | Version bump |
| 140 | `23112663` | chore: bump version to 1.19.0-beta.0 (build 115) and fix CI npm auth | SKIP | Version bump + CI |
| 141 | `05fac3c1` | fix: jotai async storage error (#566) | PICK | |
| 142 | `fa56ee7b` | fix: prevent win-arm64 startup crash on Windows ARM64 (#569) | PICK | |
| 143 | `94e54c54` | chore: bump version to 1.19.0-beta.1 (build 115) | SKIP | Version bump |
| 144 | `61037b0f` | fix: restore version-based provider hiding and reorder providers | PICK | |
| 145 | `00873905` | Fix/UI 1.19 (#572) | PICK | |
| 146 | `44d0362a` | fix: hide guide during ios review (#574) | SKIP | Guide + iOS review — Pro feature |
| 147 | `5cecae98` | fix(build): prevent macOS "app is damaged" error caused by CI (#575) | SKIP | Pro CI-specific |
| 148 | `b26b1dc1` | chore: bump version to 1.19.0-beta.2 (build 115) | SKIP | Version bump |
| 149 | `e7c5fd27` | fix: use user-configured OCR model and attribute OCR errors correctly (#576) | PICK | |
| 150 | `564025fd` | fix: wrap OCR model setup errors and refine Sentry reporting | PICK | |
| 151 | `d9324d12` | chore: bump version to 1.19.0-alpha.23 (build 115) | SKIP | Version bump |
| 152 | `ada94096` | release 1.19.0 | SKIP | Will create our own CE release commit |

## Summary Statistics

| Status | Count | Percentage |
|--------|-------|------------|
| **PICK** | 103 | 68% |
| **SKIP** | 42 | 27% |
| **CAUTION** | 7 | 5% |

## Decisions Applied

| Decision | Answer | Impact |
|----------|--------|--------|
| Adopt electron-vite? | ✅ YES | Pick `2fa50fe2` + build-related commits |
| Adopt pnpm? | ✅ YES | Pick `4d1085da` + `83fcd742` |
| Include Guide/Onboarding? | ❌ NO | Skip 10+ guide commits (`19e858b9`, `1187843c`, `9efef510`, `621a711f`, `3abca200`, `57206253`, `609525f5`, `cbbdbdae`, `185f5b96`, `c98b9a13`, `44d0362a`) |
| Include JK Analytics? | ❌ NO | Skip `fdc0a662`, `ec0089c1` |

## Remaining CAUTION Commits — Detailed Handling

These 7 commits require `--no-commit` + manual review before committing:

| Hash | Message | Action Required |
|------|---------|-----------------|
| `a82c2bb5` | implement log export across platforms | Review for mobile-specific platform code |
| `81f4b384` | in app tracking | Review for Pro-only tracking/license code in UI components |
| `bcd362e6` | optimize trial ux | Review for Pro-only license/trial logic |
| `43a2f95c` | kb backend parsing (Pro only) | Title says "only Pro user" — check conditional logic is preserved |
| `2fa50fe2` | **electron-vite migration** | **140 files**. `--no-commit`, verify `package.json` name stays `xyz.chatboxapp.ce`, remove mobile scripts |
| `67e0255b` | Mobile experience optimization | 20+ shared components changed. Pick `src/` changes, drop mobile-specific package.json changes |
| `4d1085da` | **npm→pnpm migration** | **29k insertions**. `--no-commit`, verify `package.json` name stays `xyz.chatboxapp.ce`, remove `.github/workflows/` changes |

### Post-Pick Checklist

After all cherry-picks complete:

```bash
# 1. Verify identity
grep '"name"' package.json           # Must be "xyz.chatboxapp.ce"
grep '"productName"' package.json    # Must be "xyz.chatboxapp.ce"

# 2. Verify skip-list files untouched
git diff HEAD -- README.md LICENSE AGENTS.md  # Should be empty

# 3. Verify no mobile/Pro/CI artifacts leaked
ls ios/ android/ capacitor.config.ts 2>/dev/null  # Should not exist
ls .github/workflows/ 2>/dev/null                 # Should not exist
grep -r "routes/guide" src/ | head -5             # Should not exist (guide system)
grep -r "jk-events" src/ | head -5                # Should not exist (JK analytics)

# 4. Build and test
pnpm install
pnpm run build
pnpm test

# 5. Create release commit
git add -A
git commit -m "release <version>"
```
