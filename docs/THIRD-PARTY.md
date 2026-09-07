The Host bundle includes `resolveDshHome` and its pure helpers from DeepSeek Harness, commit d347e703908d0406b7a7ef80e3a0e594d86b2215, `packages/util/home-paths/src/index.ts` (MIT; see DSH-LICENSE). That commit's 0.1.3-alpha.1 package was not available from npm when verified on 2026-09-07. The build consumes that exact source; no substitute implementation or unavailable runtime dependency is used.

Both bundles contain Zod (MIT; see ZOD-LICENSE). React and Cordis are supplied by the DSH browser module table and are not bundled.
