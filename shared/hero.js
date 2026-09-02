/* ============================================================
   shared/hero.js — 풀스크린 히어로 슬라이드 로더 (it/architecture 공용)

   <section class="hero" data-hero
            data-hero-base="asset/hero/"
            data-hero-repo="Philip-sung/SIMPLE-PHILIP_STUDIO"
            data-hero-path="it-studio/asset/hero">

   에셋 목록 확보 순서 (앞에서 하나라도 건지면 거기서 멈춘다):
     - 로컬(localhost·file:) — 디렉터리 목록 → manifest.json → GitHub API
       폴더의 실제 내용을 가장 먼저 믿으므로, 파일을 넣고 빼기만 해도 바로 반영된다.
     - 배포본 — manifest.json → GitHub API → 디렉터리 목록
       GitHub Pages는 디렉터리 목록을 주지 않으므로 manifest(없으면 API)로 읽는다.
   모두 실패하면 페이지 자체의 그라데이션 히어로로 남는다.

   파일명 규칙:
     - "01_이름.ext" — 맨 앞 숫자 오름차순으로 슬라이드 순서 결정
     - "_GRAYSCALE"    토큰 → 회색조
     - "_BLUR-6"       토큰 → 6px 블러 (숫자 = px)
     - "_TITLE-제목"   토큰 → 우측 하단 번호 왼쪽에 그 제목 표시
     - 토큰은 중복 적용 가능. 예: 03_lobby_TITLE-로비 개선공사_GRAYSCALE_BLUR-4.jpg
       (제목은 다음 토큰 직전 또는 확장자 직전까지를 그대로 읽으므로 공백·하이픈을 써도 된다)
   ============================================================ */
(function () {
  "use strict";

  var MEDIA_RE = /\.(png|jpe?g|webp|mp4|webm)$/i;
  var VIDEO_RE = /\.(mp4|webm)$/i;
  var AUTOPLAY_MS = 6000;        // 이미지 슬라이드 유지 시간
  var VIDEO_MAX_MS = 90000;      // 영상 슬라이드가 머무를 수 있는 최대 시간(상한)

  function parseAsset(fileName) {
    var base = fileName.replace(MEDIA_RE, "");
    var orderMatch = base.match(/^(\d+)/);
    var blurMatch = base.match(/_BLUR-(\d+(?:\.\d+)?)/i);
    // 제목은 다음 토큰(_GRAYSCALE·_BLUR-·_TITLE-) 직전 또는 끝까지 — 공백·하이픈 허용
    var titleMatch = base.match(/_TITLE-(.*?)(?=_GRAYSCALE|_BLUR-|_TITLE-|$)/i);
    return {
      file: fileName,
      order: orderMatch ? parseInt(orderMatch[1], 10) : Number.MAX_SAFE_INTEGER,
      grayscale: /_GRAYSCALE(?=[_.]|$)/i.test(base + "."),
      blur: blurMatch ? parseFloat(blurMatch[1]) : 0,
      title: titleMatch ? titleMatch[1].trim() : "",
      isVideo: VIDEO_RE.test(fileName)
    };
  }

  function listFromManifest(baseUrl) {
    return fetch(baseUrl + "manifest.json", { cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error("manifest not found");
        return res.json();
      })
      .then(function (names) {
        if (!Array.isArray(names)) throw new Error("manifest must be an array");
        return names.filter(function (n) {
          return typeof n === "string" && MEDIA_RE.test(n);
        });
      });
  }

  /* 서버가 폴더 요청에 내주는 디렉터리 목록 HTML에서 파일명을 긁어낸다.
     python -m http.server · Live Server · nginx autoindex 가 여기에 해당하며,
     파일을 폴더에 넣기만 하면 커밋도 manifest도 없이 바로 잡힌다.
     GitHub Pages는 디렉터리 목록을 주지 않으므로 여기서 실패하고 다음 단계로 넘어간다. */
  function listFromDirectoryIndex(baseUrl) {
    return fetch(baseUrl, { cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error("directory index " + res.status);
        return res.text();
      })
      .then(function (html) {
        var doc = new DOMParser().parseFromString(html, "text/html");
        var names = [];
        Array.prototype.forEach.call(doc.querySelectorAll("a[href]"), function (a) {
          // 속성 원문을 써야 한다. a.href는 file:// 등에서 절대경로로 정규화된다.
          var href = a.getAttribute("href") || "";
          if (/^[a-z]+:/i.test(href) || href.indexOf("/") === 0) return; // 외부·절대 링크 제외
          var name;
          try { name = decodeURIComponent(href); } catch (e) { name = href; }
          name = name.split("?")[0].split("#")[0];
          if (name.indexOf("/") >= 0) return;   // 하위 폴더·상위 링크 제외
          if (MEDIA_RE.test(name) && names.indexOf(name) < 0) names.push(name);
        });
        if (names.length === 0) throw new Error("no media in directory index");
        return names;
      });
  }

  function listFromGitHub(repo, path) {
    if (!repo || !path) return Promise.reject(new Error("no repo/path configured"));
    var url = "https://api.github.com/repos/" + repo + "/contents/" + path;
    return fetch(url, { headers: { Accept: "application/vnd.github+json" } })
      .then(function (res) {
        if (!res.ok) throw new Error("github api " + res.status);
        return res.json();
      })
      .then(function (entries) {
        if (!Array.isArray(entries)) throw new Error("unexpected api response");
        return entries
          .filter(function (e) { return e.type === "file" && MEDIA_RE.test(e.name); })
          .map(function (e) { return e.name; });
      });
  }

  function buildMediaElement(asset, baseUrl, single, isFirst) {
    var el;
    if (asset.isVideo) {
      el = document.createElement("video");
      el.muted = true;
      el.playsInline = true;
      el.setAttribute("muted", "");
      el.setAttribute("playsinline", "");
      /* 첫 슬라이드는 곧바로 보여야 하므로 미리 받아 둔다.
         나머지는 메타데이터만 받아 초기 트래픽을 아낀다. */
      el.preload = isFirst ? "auto" : "metadata";
      el.loop = single; // 슬라이드가 하나뿐이면 반복 재생
      el.src = baseUrl + asset.file;
    } else {
      el = document.createElement("img");
      el.src = baseUrl + asset.file;
      el.alt = "";
      el.decoding = "async";
      el.loading = "eager";
    }
    /* 필터를 인라인으로 굳히지 않고 CSS 변수로 넘긴다.
       실제 filter 조합은 hero.css(.fx)가 담당하므로, 화면 폭에 따라
       블러 강도를 미디어쿼리에서 줄일 수 있다(모바일은 화면이 작아
       같은 px 블러도 훨씬 강하게 느껴진다). */
    if (asset.grayscale || asset.blur > 0) {
      el.classList.add("fx");
      el.style.setProperty("--gs", asset.grayscale ? "1" : "0");
      el.style.setProperty("--blur", asset.blur + "px");
    }
    // 블러는 가장자리가 비쳐 보이므로 살짝 확대해 상쇄
    if (asset.blur > 0) {
      el.style.transform = "scale(" + (1.03 + Math.min(asset.blur, 20) * 0.008).toFixed(3) + ")";
    }
    return el;
  }

  function initHero(hero, assets, baseUrl) {
    var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var count = assets.length;
    var index = 0;
    var timer = null;

    // ---- DOM 구성 ----
    var media = document.createElement("div");
    media.className = "hero-media";
    media.setAttribute("aria-hidden", "true");
    var strip = document.createElement("div");
    strip.className = "hero-strip";
    media.appendChild(strip);

    var videos = [];
    assets.forEach(function (asset, i) {
      var slide = document.createElement("div");
      slide.className = "hero-slide";
      var el = buildMediaElement(asset, baseUrl, count === 1, i === 0);
      slide.appendChild(el);
      strip.appendChild(slide);
      videos.push(asset.isVideo ? el : null);
    });

    var overlay = document.createElement("div");
    overlay.className = "hero-overlay";

    hero.insertBefore(overlay, hero.firstChild);
    hero.insertBefore(media, overlay);
    hero.classList.add("has-media");

    // 캐러셀 위 안내문구 — 페이지가 data-hero-note로 지정한 경우에만
    var noteText = hero.getAttribute("data-hero-note");
    if (noteText) {
      var note = document.createElement("p");
      note.className = "hero-note";
      note.textContent = noteText;
      hero.appendChild(note);
    }

    /* ---- 우측 하단 메타 줄: [ 제목 ]  [ 01 / 08 ] ----
       제목과 번호를 한 줄에 묶어, 제목이 번호 왼쪽에 우측정렬로 붙게 한다.
       (번호는 슬라이드가 2장 이상일 때만 이 줄에 추가된다) */
    var meta = document.createElement("div");
    meta.className = "hero-meta";
    hero.appendChild(meta);

    var titleEl = null;
    if (assets.some(function (a) { return a.title; })) {
      titleEl = document.createElement("div");
      titleEl.className = "hero-title";
      meta.appendChild(titleEl);
    }
    function renderTitle() {
      if (titleEl) titleEl.textContent = assets[index].title || "";
    }
    renderTitle();

    if (count < 2) {
      if (videos[0]) videos[0].play().catch(function () {});
      return;
    }

    // ---- 컨트롤 (2장 이상일 때만) ----
    hero.classList.add("has-marks");
    var marks = document.createElement("div");
    marks.className = "hero-marks";
    marks.setAttribute("role", "tablist");
    var markButtons = assets.map(function (asset, i) {
      var b = document.createElement("button");
      b.type = "button";
      b.setAttribute("aria-label", (i + 1) + "번째 슬라이드");
      b.addEventListener("click", function () { goTo(i); });
      marks.appendChild(b);
      return b;
    });

    var counter = document.createElement("div");
    counter.className = "hero-counter";

    function arrow(dir, label, glyph) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "hero-arrow " + (dir < 0 ? "prev" : "next");
      b.setAttribute("aria-label", label);
      b.textContent = glyph;
      b.addEventListener("click", function () { goTo(index + dir); });
      return b;
    }

    hero.appendChild(arrow(-1, "이전 슬라이드", "‹"));
    hero.appendChild(arrow(1, "다음 슬라이드", "›"));
    hero.appendChild(marks);
    meta.appendChild(counter);   // 제목 오른쪽에 번호

    function pad(n) { return String(n).padStart(2, "0"); }

    function render() {
      strip.style.transform = "translateX(-" + index * 100 + "%)";
      markButtons.forEach(function (b, i) {
        b.classList.toggle("on", i === index);
      });
      counter.innerHTML = "<strong>" + pad(index + 1) + "</strong>&nbsp;/&nbsp;" + pad(count);
      renderTitle();
      videos.forEach(function (v, i) {
        if (!v) return;
        if (i === index) {
          v.currentTime = 0;
          v.play().catch(function () {});
        } else {
          v.pause();
        }
      });
    }

    function schedule() {
      if (reducedMotion) return; // 모션 최소화 환경에서는 자동 재생 없음
      window.clearTimeout(timer);
      if (document.hidden) return;

      /* 영상 슬라이드는 ended 이벤트로 넘어가고, 타이머는 그 이벤트가 오지 않을 때를
         대비한 안전장치다. 길이를 알 수 있으면 그 길이에 여유를 더해 잡아야
         영상이 끝나기 전에 넘어가 잘리지 않는다. */
      var wait = AUTOPLAY_MS;
      var v = videos[index];
      if (v) {
        wait = isFinite(v.duration) && v.duration > 0
          ? v.duration * 1000 + 2000
          : VIDEO_MAX_MS;
        if (wait > VIDEO_MAX_MS) wait = VIDEO_MAX_MS;
      }
      timer = window.setTimeout(next, wait);
    }

    function goTo(i) {
      index = (i + count) % count;
      render();
      schedule();
    }
    function next() { goTo(index + 1); }

    videos.forEach(function (v, i) {
      if (!v) return;
      v.addEventListener("ended", function () {
        if (i === index) next();
      });
    });

    // 좌우 스와이프
    var touchX = null;
    hero.addEventListener("touchstart", function (e) {
      touchX = e.touches[0].clientX;
    }, { passive: true });
    hero.addEventListener("touchend", function (e) {
      if (touchX === null) return;
      var delta = touchX - e.changedTouches[0].clientX;
      touchX = null;
      if (Math.abs(delta) > 50) goTo(index + (delta > 0 ? 1 : -1));
    }, { passive: true });

    // 탭이 다시 보이면 타이머 재가동
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) schedule();
      else window.clearTimeout(timer);
    });

    render();
    schedule();
  }

  function boot() {
    var hero = document.querySelector("[data-hero]");
    if (!hero) return;
    var baseUrl = hero.getAttribute("data-hero-base") || "asset/hero/";
    if (!/\/$/.test(baseUrl)) baseUrl += "/";
    var repo = hero.getAttribute("data-hero-repo");
    var path = hero.getAttribute("data-hero-path");

    /* 미디어가 있다고 먼저 가정하고 시작한다.
       이 스크립트는 defer라 첫 페인트 전에 실행되므로, 여기서 has-media를 붙여 두면
       "원래 색으로 한 번 그려졌다가 흰색으로 바뀌는" 깜빡임이 생기지 않는다.
       목록 확보에 모두 실패하면 아래에서 다시 떼어내 원래 히어로로 되돌린다. */
    hero.classList.add("has-media");

    /* 목록 확보 전략을 순서대로 시도하고, 하나라도 파일을 건지면 거기서 멈춘다.

       순서를 환경에 따라 바꾸는 이유:
       manifest.json은 "그때 찍어 둔 목록"이라 폴더에 파일을 넣고 빼면 곧바로 낡는다.
       로컬에서는 서버가 폴더 내용을 그대로 내주므로, 그 실제 목록을 manifest보다
       먼저 믿어야 파일만 넣으면 바로 반영된다.
       배포본(GitHub Pages)은 디렉터리 목록을 주지 않으므로 manifest를 먼저 쓰고,
       manifest가 없거나 비어 있으면 GitHub API로 커밋된 파일을 조회한다. */
    var isLocal =
      location.protocol === "file:" ||
      /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[?::1\]?)$/.test(location.hostname);

    var fromManifest = function () { return listFromManifest(baseUrl); };
    var fromDirectory = function () { return listFromDirectoryIndex(baseUrl); };
    var fromGitHub = function () { return listFromGitHub(repo, path); };

    var strategies = isLocal
      ? [fromDirectory, fromManifest, fromGitHub]
      : [fromManifest, fromGitHub, fromDirectory];

    strategies
      .reduce(function (chain, attempt) {
        return chain.catch(function () {
          return attempt().then(function (names) {
            if (!names || names.length === 0) throw new Error("empty listing");
            return names;
          });
        });
      }, Promise.reject(new Error("start")))
      .then(function (names) {
        var assets = names.map(parseAsset).sort(function (a, b) {
          return a.order - b.order || a.file.localeCompare(b.file);
        });
        if (assets.length === 0) throw new Error("no assets");
        initHero(hero, assets, baseUrl);
      })
      .catch(function () {
        /* 에셋 없음 — 가정을 물리고 페이지 기본 그라데이션 히어로로 되돌린다 */
        hero.classList.remove("has-media");
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
