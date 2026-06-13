/* =============================================================================
   KAPRIOL.BG — main.js  (plain ES, no dependencies)

   Edit content here, not in index.html:
     • COPY     — every visible UI string (ready for a BG/EN switcher later).
     • PRODUCTS — the catalog. Add/edit/remove items; cards re-render from this.
   ========================================================================== */
(function () {
  "use strict";

  /* ----------------------------------------------------------- 1. COPY ---- */
  /* All chrome strings live here. To add Bulgarian later: make COPY_BG with the
     same keys and swap which object you pass to hydrate(). No HTML edits needed. */
  var COPY = {
    // Nav
    navBrand: "KAPRIOL",
    navProducts: "Discover our products",
    navContact: "Contact us",
    navAbout: "Who are we?",

    // Hero  ( \n in heroH1 becomes a <br> )
    heroLabel: "OFFICIAL BULGARIA DISTRIBUTOR",
    heroH1: "Built for work.\nMade by Kapriol.",
    heroSub: "Premium workwear, footwear and PPE. Distributed exclusively in Bulgaria by ergotrade.bg.",
    heroCta: "Discover the catalog",
    heroGhost: "Who are we?",

    // About
    aboutHeading: "Who we are",
    aboutQuote: "Kapriol has equipped professionals across Europe since 1974.",
    aboutP1: "Founded in Italy in 1974, Kapriol builds workwear, footwear and protective equipment for people who work with their hands. Five decades of field-tested gear, engineered to outlast the job.",
    aboutP2: "In Bulgaria, Kapriol is distributed exclusively by ergotrade.bg. Every item in this catalog is sourced direct, held in local stock and backed by a team that knows the trades it supplies.",
    aboutP3: "From the first layer to the last line of defence, the standard does not move.",

    // Products
    productsHeading: "Our Catalog",
    catWorkwear: "Workwear & Professional Clothing",
    catFootwear: "Footwear & Safety Shoes",
    catPPE: "PPE & Accessories",
    cardLink: "View details",

    // Contact
    contactHeading: "Get in touch",
    contactLead: "Questions on stock, pricing or becoming a reseller? Send a message and the ergotrade.bg team will get back to you.",
    contactPhoneLabel: "Phone",
    contactPhone: "PHONE_PLACEHOLDER",
    contactEmailLabel: "Email",
    contactEmail: "info@kapriol.bg",
    contactAddrLabel: "Address",
    contactAddr: "ADDRESS_PLACEHOLDER",
    formName: "Name",
    formEmail: "Email",
    formPhone: "Phone",
    formMessage: "Message",
    formSubmit: "Send message",
    formSending: "Sending…",
    formSuccess: "Thank you. We'll be in touch.",
    formError: "Something went wrong. Please try again, or email info@kapriol.bg.",
    formInvalid: "Please complete every field with a valid email address.",

    // Footer
    footerWordmark: "KAPRIOL.BG",
    footerTag: "Exclusive distributor for Bulgaria",
    footerAbout: "About",
    footerProducts: "Products",
    footerContact: "Contact",
    footerCopy: "© 2026 ergotrade.bg",
    footerPowered: "Powered by ergotrade.bg"
  };

  /* --------------------------------------------------------- 2. PRODUCTS -- */
  /* Swap real products by editing this array only. To show a photo, set `img`
     to its path, e.g. "assets/img/products/thunder-s3.jpg". Empty img => a clean
     grey placeholder card. category must be one of CATEGORIES[].id below. */
  var PRODUCTS = [
    // Workwear & Professional Clothing
    { category: "workwear", name: "Dynamic Stretch Trousers", img: "", description: "Cordura-reinforced work trousers with floating kneepad pockets." },
    { category: "workwear", name: "Easy Softshell Jacket",    img: "", description: "Wind-resistant softshell for transitional seasons on site." },
    { category: "workwear", name: "Tech Cargo Shorts",        img: "", description: "Ripstop summer shorts with tool-ready cargo pockets." },

    // Footwear & Safety Shoes
    { category: "footwear", name: "Thunder S3 Safety Shoe", img: "", description: "Composite toe, anti-perforation midsole, oil-resistant grip." },
    { category: "footwear", name: "Rock Mid S3 Boot",       img: "", description: "Ankle-support boot for rough ground and heavy loads." },
    { category: "footwear", name: "Air Low S1P Trainer",    img: "", description: "Lightweight breathable safety trainer for all-day wear." },

    // PPE & Accessories
    { category: "ppe", name: "Cut-5 Work Gloves",          img: "", description: "Level-5 cut resistance with a reinforced grip palm." },
    { category: "ppe", name: "Vented Safety Helmet",       img: "", description: "Adjustable industrial helmet with a ratchet harness." },
    { category: "ppe", name: "Wraparound Safety Glasses",  img: "", description: "Anti-scratch, anti-fog lenses with full side coverage." }
  ];

  /* Category order + heading keys (into COPY). */
  var CATEGORIES = [
    { id: "workwear", titleKey: "catWorkwear" },
    { id: "footwear", titleKey: "catFootwear" },
    { id: "ppe",      titleKey: "catPPE" }
  ];

  /* ------------------------------------------------------------ helpers -- */
  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  var reduceMotion = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* --------------------------------------------------- 3. hydrate COPY ---- */
  function hydrate(dict) {
    var nodes = document.querySelectorAll("[data-copy]");
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var key = el.getAttribute("data-copy");
      if (!dict.hasOwnProperty(key)) continue;
      var val = dict[key];
      if (val.indexOf("\n") >= 0) el.innerHTML = esc(val).replace(/\n/g, "<br>");
      else el.textContent = val;
    }
  }

  /* --------------------------------------------------- 4. render catalog -- */
  var ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

  function renderCatalog() {
    var root = document.getElementById("catalog");
    if (!root) return;
    var frag = document.createDocumentFragment();

    CATEGORIES.forEach(function (cat) {
      var items = PRODUCTS.filter(function (p) { return p.category === cat.id; });
      if (!items.length) return;

      var block = document.createElement("section");
      block.className = "category";

      var head = document.createElement("div");
      head.className = "category__head reveal";
      var h3 = document.createElement("h3");
      h3.className = "category__title";
      h3.textContent = COPY[cat.titleKey] || cat.id;
      var hr = document.createElement("span");
      hr.className = "category__rule";
      hr.setAttribute("aria-hidden", "true");
      head.appendChild(h3);
      head.appendChild(hr);

      var grid = document.createElement("div");
      grid.className = "cards";

      items.forEach(function (p, i) {
        var card = document.createElement("article");
        card.className = "card reveal";
        card.style.setProperty("--rd", (i * 0.1) + "s");   // staggered reveal

        var media = document.createElement("div");
        media.className = "card__media";
        if (p.img) {
          var img = document.createElement("img");
          img.src = p.img;
          img.alt = p.name;
          img.loading = "lazy";
          img.decoding = "async";
          img.addEventListener("error", function () {
            media.classList.add("card__media--empty");
            media.innerHTML = '<span class="card__ph" aria-hidden="true">KAPRIOL</span>';
          });
          media.appendChild(img);
        } else {
          media.classList.add("card__media--empty");
          media.innerHTML = '<span class="card__ph" aria-hidden="true">KAPRIOL</span>';
        }

        var body = document.createElement("div");
        body.className = "card__body";
        var name = document.createElement("h4");
        name.className = "card__name";
        name.textContent = p.name;
        var desc = document.createElement("p");
        desc.className = "card__desc";
        desc.textContent = p.description;
        var link = document.createElement("a");
        link.className = "card__link";
        link.href = "#contact";                       // enquire about this item
        link.innerHTML = esc(COPY.cardLink) + ARROW;

        body.appendChild(name);
        body.appendChild(desc);
        body.appendChild(link);

        card.appendChild(media);
        card.appendChild(body);
        grid.appendChild(card);
      });

      block.appendChild(head);
      block.appendChild(grid);
      frag.appendChild(block);
    });

    root.appendChild(frag);
  }

  /* ---------------------------------------------------- 5. scroll reveal -- */
  var io = null;
  function setupReveals() {
    if (!("IntersectionObserver" in window)) {
      // No IO: just show everything.
      var all = document.querySelectorAll(".reveal");
      for (var i = 0; i < all.length; i++) all[i].classList.add("is-visible");
      return;
    }
    io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add("is-visible");
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.15 });
    observeReveals();
  }
  function observeReveals() {
    if (!io) return;
    var els = document.querySelectorAll(".reveal:not(.is-visible)");
    for (var i = 0; i < els.length; i++) io.observe(els[i]);
  }

  /* ---------------------------------------------------------- 6. mobile nav */
  function setupNav() {
    var toggle = document.getElementById("navToggle");
    var menu = document.getElementById("mobileNav");
    var close = document.getElementById("navClose");
    if (!toggle || !menu || !close) return;

    function open() {
      menu.classList.add("is-open");
      toggle.setAttribute("aria-expanded", "true");
      document.body.style.overflow = "hidden";
      close.focus();
    }
    function shut() {
      menu.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
      document.body.style.overflow = "";
      toggle.focus();
    }
    toggle.addEventListener("click", open);
    close.addEventListener("click", shut);
    var links = menu.querySelectorAll("a");
    for (var i = 0; i < links.length; i++) links[i].addEventListener("click", shut);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && menu.classList.contains("is-open")) shut();
    });
  }

  /* ----------------------------------------- 7. hero scrub + parallax + nav */
  function setupHero() {
    var hero = document.getElementById("hero");
    var content = $(".hero__content");
    var video = document.getElementById("heroVideo");
    var nav = document.getElementById("nav");
    if (!hero) return;

    var duration = 0;
    var canScrub = false;     // true once we have a valid, fully-seekable clip
    var curT = 0, tgtT = 0;   // lerped vs target currentTime
    var progress = 0;
    var ticking = false;
    var primed = false;       // iOS: whether the clip has been "played" once

    // Exit-gate state: you can't leave the hero until the man is fully
    // transformed (clip at its last frame), so a fast flick can't outrun it.
    var GATE_EPS = 0.08;      // seconds from the end that count as "done"
    var STALL_MS = 2000;      // never hold longer than this (safety net)
    var heldSince = 0;        // timestamp the current hold began (0 = not held)
    var gaveUp = false;       // released because the decode stalled
    var bypassUntil = 0;      // suspend the gate during anchor navigation
    var html = document.documentElement;

    function nowMs() {
      return (window.performance && performance.now) ? performance.now() : Date.now();
    }
    // Force an instant scroll even though <html> keeps scroll-behavior: smooth
    // for the nav anchors.
    function jumpTo(y) {
      var prev = html.style.scrollBehavior;
      html.style.scrollBehavior = "auto";
      window.scrollTo(0, y);
      html.style.scrollBehavior = prev;
    }

    /* --- scroll -> progress (drives parallax + nav + scrub) -------------- */
    function readProgress() {
      var vh = window.innerHeight;
      var denom = hero.offsetHeight - vh;          // scrollable range of the pin
      progress = denom > 0 ? clamp((window.pageYOffset - hero.offsetTop) / denom, 0, 1) : 0;
    }
    function schedule() {
      if (!ticking) { ticking = true; requestAnimationFrame(frame); }
    }
    function frame() {
      ticking = false;

      // Re-arm the gate once the user has scrolled back up into the hero.
      if (progress < 0.9) { gaveUp = false; heldSince = 0; }

      // EXIT GATE: at the very end of the scrub, hold the scroll here until the
      // clip has actually reached its last frame. This is what stops a fast
      // flick from skipping past a half-transformed man. Safety: never hold
      // more than STALL_MS, and stand down during anchor navigation.
      if (canScrub && video && progress >= 0.999 && !gaveUp && nowMs() > bypassUntil) {
        if (video.currentTime < duration - GATE_EPS) {
          var exitY = hero.offsetTop + (hero.offsetHeight - window.innerHeight);
          if (window.pageYOffset > exitY) jumpTo(exitY);          // hold them here
          if (!heldSince) heldSince = nowMs();
          else if (nowMs() - heldSince > STALL_MS) gaveUp = true; // decode stuck: release
          schedule();                                             // pump until it lands
        } else {
          heldSince = 0;
        }
      }

      // Parallax: drift the hero copy up to -80px across the scroll range.
      if (content && !reduceMotion) {
        content.style.transform = "translateY(" + (-80 * progress) + "px)";
      }

      // Nav hairline fades in once the scrub is complete (past the hero).
      if (nav) nav.classList.toggle("is-bordered", progress >= 0.999);

      // Video scrub: lerp currentTime toward target in BOTH directions.
      if (canScrub && video) {
        tgtT = progress * duration;
        curT += (tgtT - curT) * 0.12;             // smoothing factor
        if (Math.abs(tgtT - curT) < 0.008) curT = tgtT;

        // Commit a seek ONLY when the decoder is idle. Firing a fresh seek on
        // every frame makes browsers drop them, which stalls the scrub after
        // ~1 second. Gating on !seeking lets each seek finish first.
        var pending = Math.abs(video.currentTime - curT) > 0.02;
        if (pending && video.readyState >= 2 && !video.seeking) {
          try { video.currentTime = curT; } catch (e) {/* not seekable yet */}
        }
        if (Math.abs(tgtT - curT) > 0.008 || pending) schedule();
      }
    }
    function onScroll() { readProgress(); schedule(); }
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });

    // Clicking any in-page anchor (nav, hero CTAs, footer, card links) means
    // "take me there" -- suspend the exit gate so the smooth scroll isn't held.
    document.addEventListener("click", function (e) {
      var t = e.target;
      if (t && t.closest && t.closest('a[href^="#"]')) bypassUntil = nowMs() + 1800;
    }, true);

    /* --- video: scrub-only, never autoplays ------------------------------ */
    if (video) {
      video.pause();

      // Defensive: this clip must never play on its own (no autoplay anywhere).
      video.addEventListener("play", function () { if (!primed) video.pause(); });
      video.addEventListener("loadedmetadata", onMeta);
      video.addEventListener("error", function () { canScrub = false; });
      // Each finished seek re-pumps the loop so we keep stepping toward target.
      video.addEventListener("seeked", function () { if (canScrub) schedule(); });

      // iOS won't seek a muted clip until it has "played" once. Prime it
      // invisibly on the FIRST touch only. Desktop has no touchstart, so it
      // never plays there -- that was the "it just autoplays" bug.
      window.addEventListener("touchstart", function primeOnce() {
        window.removeEventListener("touchstart", primeOnce);
        primed = true;
        var pr = video.play();
        if (pr && pr.then) pr.then(function () { video.pause(); }).catch(function () {});
      }, { passive: true });

      preloadVideo();
    }

    function onMeta() {
      duration = video.duration;
      // Fallback per spec: no usable duration => keep poster, skip scrubbing.
      canScrub = !!duration && isFinite(duration) && duration > 0 && !reduceMotion;
      readProgress();
      schedule();
    }

    // The clip is NOT "faststart" (its moov / seek index sits at the END of the
    // file), so progressive seeking only reaches the first ~second until the
    // whole file downloads. It's tiny (~1.5MB): fetch it whole and seek the
    // blob, which makes the ENTIRE timeline instantly seekable on any host.
    function preloadVideo() {
      var srcEl = video.querySelector("source");
      var url = (srcEl && srcEl.getAttribute("src")) || video.currentSrc || video.src;
      if (!url || !("fetch" in window) || reduceMotion) { video.load(); return; }
      fetch(url).then(function (r) {
        if (!r.ok) throw new Error("video fetch failed");
        return r.blob();
      }).then(function (blob) {
        video.src = URL.createObjectURL(blob);
        video.load();
      }).catch(function () {
        // file:// or a blocked fetch: fall back to the <source> element.
        video.load();
      });
    }

    readProgress();
    schedule();

    // Trigger the staggered hero entrance after the first paint.
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { hero.classList.add("is-ready"); });
    });
  }

  /* ------------------------------------------------------- 8. contact form */
  function setupForm() {
    var form = document.getElementById("contactForm");
    if (!form) return;
    var statusEl = document.getElementById("formStatus");
    var successEl = document.getElementById("formSuccess");
    var btn = form.querySelector('button[type="submit"]');
    var emailRe = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      statusEl.textContent = "";
      statusEl.className = "form-status";

      var data = {
        name: form.name.value.trim(),
        email: form.email.value.trim(),
        phone: form.phone.value.trim(),
        message: form.message.value.trim(),
        website: form.website.value.trim()    // honeypot
      };

      if (!data.name || !data.phone || !data.message || !emailRe.test(data.email)) {
        statusEl.textContent = COPY.formInvalid;
        statusEl.classList.add("is-error");
        return;
      }

      var prev = btn.textContent;
      btn.disabled = true;
      btn.textContent = COPY.formSending;

      fetch("send-mail.php", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify(data)
      })
        .then(function (res) {
          return res.json().catch(function () { return {}; })
            .then(function (json) { return { ok: res.ok, json: json }; });
        })
        .then(function (r) {
          if (r.ok && r.json && r.json.success) {
            form.hidden = true;
            if (successEl) successEl.hidden = false;
          } else {
            statusEl.textContent = (r.json && r.json.error) ? r.json.error : COPY.formError;
            statusEl.classList.add("is-error");
            btn.disabled = false;
            btn.textContent = prev;
          }
        })
        .catch(function () {
          statusEl.textContent = COPY.formError;
          statusEl.classList.add("is-error");
          btn.disabled = false;
          btn.textContent = prev;
        });
    });
  }

  /* ------------------------------------------------------------- 9. init -- */
  function init() {
    hydrate(COPY);
    renderCatalog();
    setupReveals();
    setupNav();
    setupHero();
    setupForm();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
