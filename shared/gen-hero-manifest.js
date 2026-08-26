/* ============================================================
   shared/gen-hero-manifest.js
   각 스튜디오의 asset/hero/ 폴더를 훑어 manifest.json을 다시 쓴다.

   실행:  node shared/gen-hero-manifest.js
          (리포 어느 위치에서 실행하든 스크립트 기준 경로로 찾는다)

   manifest.json은 히어로 로더가 가장 먼저 읽는 목록이라,
   이 파일을 함께 커밋해 두면 배포본이 GitHub API 조회 없이 곧바로 뜬다.
   ============================================================ */
"use strict";

const fs = require("fs");
const path = require("path");

const MEDIA_RE = /\.(png|jpe?g|webp|mp4|webm)$/i;
const REPO_ROOT = path.resolve(__dirname, "..");
const TARGETS = ["it-studio", "architecture-studio"];

function orderOf(name) {
  const m = name.match(/^(\d+)/);
  return m ? parseInt(m[1], 10) : Number.MAX_SAFE_INTEGER;
}

let wrote = 0;

for (const studio of TARGETS) {
  const dir = path.join(REPO_ROOT, studio, "asset", "hero");
  if (!fs.existsSync(dir)) {
    console.log(`- ${studio}: asset/hero 폴더가 없어 건너뜁니다.`);
    continue;
  }

  const files = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && MEDIA_RE.test(e.name))
    .map((e) => e.name)
    .sort((a, b) => orderOf(a) - orderOf(b) || a.localeCompare(b));

  const manifestPath = path.join(dir, "manifest.json");

  if (files.length === 0) {
    // 에셋을 모두 뺀 경우, 남아 있는 manifest가 404를 유발하지 않도록 지운다.
    if (fs.existsSync(manifestPath)) {
      fs.unlinkSync(manifestPath);
      console.log(`- ${studio}: 에셋이 없어 manifest.json을 삭제했습니다.`);
    } else {
      console.log(`- ${studio}: 에셋이 없습니다.`);
    }
    continue;
  }

  fs.writeFileSync(manifestPath, JSON.stringify(files, null, 2) + "\n", "utf8");
  wrote++;
  console.log(`- ${studio}: ${files.length}개 — ${files.join(", ")}`);
}

console.log(
  wrote > 0
    ? `\nmanifest.json ${wrote}개를 갱신했습니다. 에셋과 함께 커밋하세요.`
    : "\n갱신된 manifest가 없습니다."
);
