/* ==========================================================================
   MAIN.JS
   Website / page initialization and coordination.

   - Mobile bottom-navigation "More" sheet behaviour (Part 1).
   - Kicks off interactions.js (scroll reveal, reduced-motion, the hero
     stage-progress storyteller, hotspot-to-section navigation) on every
     page.
   - On the Home page only: loads the Three.js hero scene from
     three-scene.js, wiring its hotspot clicks to interactions.js's
     scroll-to-section handler, with a try/catch fallback to the static
     CSS paper visual if Three.js or WebGL is unavailable.

   Active-page state is set directly in each page's markup via
   aria-current="page" / .is-active, so no path-parsing is needed here.

   main.js does not contain any Three.js scene code itself — that lives
   entirely in three-scene.js — and does not duplicate the interaction
   logic in interactions.js; it only calls into both.
   ========================================================================== */

window.BondSite = window.BondSite || {};

(function () {
  "use strict";

  /* =================================================
   Responsive Handling — fixed header height
================================================= */
  /*
     .site-header is position: fixed (Part 1), so it no longer occupies
     space in normal flow. This keeps a --header-height custom property
     on <html> in sync with the header's real rendered height, which
     drives the spacer padding above the page content and the
     scroll-margin-top used by anchor-jump / smooth-scroll targets, so
     nothing ever renders underneath the fixed bar. Runs on load, on
     resize/orientation-change, and (where supported) whenever the
     header's own size changes, e.g. the brand text wrapping differently. */
  function initFixedHeaderHeight() {
    var header = document.querySelector(".site-header");
    if (!header) return;

    function setHeaderHeightVar() {
      var height = header.getBoundingClientRect().height;
      if (height > 0) {
        document.documentElement.style.setProperty("--header-height", height + "px");
      }
    }

    setHeaderHeightVar();
    window.addEventListener("resize", setHeaderHeightVar);
    window.addEventListener("orientationchange", setHeaderHeightVar);

    if (typeof window.ResizeObserver === "function") {
      var observer = new ResizeObserver(setHeaderHeightVar);
      observer.observe(header);
    }

    // Web fonts swapping in can change the header's height after first
    // paint; re-measure once they're ready.
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(setHeaderHeightVar).catch(function () {});
    }
  }

  /* =================================================
   Mobile Navigation
   Slide-in panel opened by the header menu button.
================================================= */
  function initMobileNavPanel() {
    var toggleBtn = document.querySelector("[data-nav-toggle]");
    var panel = document.querySelector("[data-mobile-nav-panel]");
    var backdrop = document.querySelector("[data-mobile-nav-backdrop]");
    var closeBtn = document.querySelector("[data-mobile-nav-close]");
    var links = document.querySelectorAll("[data-mobile-nav-link]");

    if (!toggleBtn || !panel || !backdrop) return;

    function open() {
      panel.classList.add("is-open");
      backdrop.classList.add("is-open");
      toggleBtn.classList.add("is-open");
      toggleBtn.setAttribute("aria-expanded", "true");
      toggleBtn.setAttribute("aria-label", "Close menu");
      document.documentElement.classList.add("mobile-nav-panel-open");
      // Close the bottom nav's "More" sheet if it happens to be open,
      // so only one mobile overlay is ever visible at a time.
      if (window.BondSite.closeMoreSheet) window.BondSite.closeMoreSheet();
    }

    function close() {
      panel.classList.remove("is-open");
      backdrop.classList.remove("is-open");
      toggleBtn.classList.remove("is-open");
      toggleBtn.setAttribute("aria-expanded", "false");
      toggleBtn.setAttribute("aria-label", "Open menu");
      document.documentElement.classList.remove("mobile-nav-panel-open");
    }

    function toggle() {
      if (panel.classList.contains("is-open")) {
        close();
      } else {
        open();
      }
    }

    toggleBtn.addEventListener("click", function (e) {
      e.preventDefault();
      toggle();
    });

    if (closeBtn) closeBtn.addEventListener("click", close);

    backdrop.addEventListener("click", close);

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") close();
    });

    // Selecting a section closes the panel automatically; the anchor's
    // own href does the smooth-scrolling (html { scroll-behavior: smooth })
    // so no extra scroll handling is needed here.
    links.forEach(function (link) {
      link.addEventListener("click", function () {
        close();
      });
    });

    // Close automatically if the viewport grows past the mobile
    // breakpoint (e.g. device rotation) so it can't get stuck open
    // behind the desktop layout.
    window.addEventListener("resize", function () {
      if (window.innerWidth > 900) close();
    });

    window.BondSite.closeMobileNavPanel = close;
  }

  function initMoreSheet() {
    var moreBtn = document.querySelector("[data-more-toggle]");
    var sheet = document.querySelector("[data-more-sheet]");
    var backdrop = document.querySelector("[data-more-backdrop]");

    if (!moreBtn || !sheet || !backdrop) return;

    function open() {
      sheet.classList.add("is-open");
      backdrop.classList.add("is-open");
      moreBtn.classList.add("is-active");
      moreBtn.setAttribute("aria-expanded", "true");
      if (window.BondSite.closeMobileNavPanel) window.BondSite.closeMobileNavPanel();
    }

    function close() {
      sheet.classList.remove("is-open");
      backdrop.classList.remove("is-open");
      moreBtn.classList.remove("is-active");
      moreBtn.setAttribute("aria-expanded", "false");
    }

    function toggle() {
      if (sheet.classList.contains("is-open")) {
        close();
      } else {
        open();
      }
    }

    moreBtn.addEventListener("click", function (e) {
      e.preventDefault();
      toggle();
    });

    backdrop.addEventListener("click", close);

    sheet.addEventListener("click", function (e) {
      if (e.target.closest("a")) close();
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") close();
    });

    // Close the sheet automatically if the viewport grows past the
    // mobile breakpoint (e.g. device rotation).
    window.addEventListener("resize", function () {
      if (window.innerWidth > 900) close();
    });

    window.BondSite.closeMoreSheet = close;
  }

  /* =================================================
   Three.js Scene — hero document
================================================= */

  function initHeroScene() {
    var container = document.querySelector("[data-hero-3d]");
    if (!container) return; // not the Home page

    var canvas = container.querySelector("[data-hero-canvas]");
    if (!canvas) return;

    var reduced = window.BondSite.Interactions
      ? window.BondSite.Interactions.prefersReducedMotion()
      : false;

    try {
      var controller = window.BondSite.ThreeScene.init(container, canvas, {
        reducedMotion: reduced,
        onHotspotClick: function (stageId) {
          if (window.BondSite.onHeroHotspotClick) {
            window.BondSite.onHeroHotspotClick(stageId);
          }
        }
      });
      window.BondSite.heroSceneController = controller;
      container.classList.add("is-active");
    } catch (err) {
      // Three.js failed to load or WebGL is unavailable: the static
      // CSS paper fallback already in the markup remains visible, and
      // the page stays fully usable.
      if (window.console && console.warn) {
        console.warn("Hero 3D document unavailable, showing static fallback.", err);
      }
    }
  }

  /* =================================================
   Three.js Scene — About document (not present on this page)
================================================= */

  function initAboutScene() {
    var container = document.querySelector("[data-about-3d]");
    if (!container) return; // not the About page

    var canvas = container.querySelector("[data-about-canvas]");
    if (!canvas) return;

    var reduced = window.BondSite.Interactions
      ? window.BondSite.Interactions.prefersReducedMotion()
      : false;

    try {
      var controller = window.BondSite.ThreeScene.initAbout(container, canvas, {
        reducedMotion: reduced
      });
      window.BondSite.aboutSceneController = controller;
      container.classList.add("is-active");
    } catch (err) {
      if (window.console && console.warn) {
        console.warn("About 3D document unavailable, showing static fallback.", err);
      }
    }
  }

  /* =================================================
   Three.js Scene — service stack (not present on this page)
================================================= */

  function initServiceStackScene() {
    var container = document.querySelector("[data-service-3d]");
    if (!container) return; // not the Services page

    var canvas = container.querySelector("[data-service-canvas]");
    if (!canvas) return;

    var reduced = window.BondSite.Interactions
      ? window.BondSite.Interactions.prefersReducedMotion()
      : false;

    try {
      var controller = window.BondSite.ThreeScene.initServiceStack(container, canvas, {
        reducedMotion: reduced,
        onSelect: function (index) {
          if (window.BondSite.onServiceSheetSelect) {
            window.BondSite.onServiceSheetSelect(index);
          }
        }
      });
      window.BondSite.serviceStackController = controller;
      container.classList.add("is-active");
    } catch (err) {
      if (window.console && console.warn) {
        console.warn("Service 3D stack unavailable, showing static fallback.", err);
      }
    }
  }

  /* =================================================
   Three.js Scene — contact document (not present on this page)
================================================= */

  function initContactDocScene() {
    var container = document.querySelector("[data-contact-3d]");
    if (!container) return; // not the Contact page

    var canvas = container.querySelector("[data-contact-canvas]");
    if (!canvas) return;

    var reduced = window.BondSite.Interactions
      ? window.BondSite.Interactions.prefersReducedMotion()
      : false;

    try {
      var controller = window.BondSite.ThreeScene.initContactDoc(container, canvas, {
        reducedMotion: reduced
      });
      window.BondSite.contactDocController = controller;
      container.classList.add("is-active");
    } catch (err) {
      if (window.console && console.warn) {
        console.warn("Contact 3D document unavailable, showing static fallback.", err);
      }
    }
  }

  /* =================================================
   Three.js Scene — FAQ stack (not present on this page)
================================================= */

  function initFaqStackScene() {
    var container = document.querySelector("[data-faq-3d]");
    if (!container) return; // not the FAQ page

    var canvas = container.querySelector("[data-faq-canvas]");
    if (!canvas) return;

    var reduced = window.BondSite.Interactions
      ? window.BondSite.Interactions.prefersReducedMotion()
      : false;

    try {
      var controller = window.BondSite.ThreeScene.initPaperStack(container, canvas, {
        reducedMotion: reduced,
        items: [
          { number: "01", label: "INSURANCE TYPES" },
          { number: "02", label: "ELIGIBILITY" },
          { number: "03", label: "ENQUIRY" },
          { number: "04", label: "DOCUMENTS" },
          { number: "05", label: "OPTIONS" },
          { number: "06", label: "PREMIUMS" },
          { number: "07", label: "SUPPORT" }
        ],
        onSelect: function (index) {
          if (window.BondSite.onFaqSheetSelect) {
            window.BondSite.onFaqSheetSelect(index);
          }
        }
      });
      window.BondSite.faqStackController = controller;
      container.classList.add("is-active");
    } catch (err) {
      if (window.console && console.warn) {
        console.warn("FAQ 3D stack unavailable, showing static fallback.", err);
      }
    }
  }

  /* =================================================
   Three.js Scene — testimonial stack (not present on this page)
================================================= */

  function initTestimonialStackScene() {
    var container = document.querySelector("[data-testimonial-3d]");
    if (!container) return; // not the Testimonials page

    var canvas = container.querySelector("[data-testimonial-canvas]");
    if (!canvas) return;

    var reduced = window.BondSite.Interactions
      ? window.BondSite.Interactions.prefersReducedMotion()
      : false;

    try {
      var controller = window.BondSite.ThreeScene.initPaperStack(container, canvas, {
        reducedMotion: reduced,
        items: [
          { number: "01", label: "STATEMENT" },
          { number: "02", label: "STATEMENT" },
          { number: "03", label: "STATEMENT" },
          { number: "04", label: "STATEMENT" }
        ],
        onSelect: function (index) {
          if (window.BondSite.onTestimonialSheetSelect) {
            window.BondSite.onTestimonialSheetSelect(index);
          }
        }
      });
      window.BondSite.testimonialStackController = controller;
      container.classList.add("is-active");
    } catch (err) {
      if (window.console && console.warn) {
        console.warn("Testimonial 3D stack unavailable, showing static fallback.", err);
      }
    }
  }

  /* =================================================
   MODIFICATION v3 — Image fallback
   If a photo file is missing or fails to load, keep the reserved frame
   (no layout shift, no broken-image icon) and show the alt text instead.
================================================= */
  function initImageFallbacks() {
    var imgs = document.querySelectorAll(".card-media__img");
    imgs.forEach(function (img) {
      var frame = img.closest(".card-media");
      if (!frame) return;
      function onFail() {
        // 1st failure: try the Unsplash CDN copy named in data-fallback-src.
        var fb = img.getAttribute("data-fallback-src");
        if (fb && !img.hasAttribute("data-fallback-tried")) {
          img.setAttribute("data-fallback-tried", "1");
          img.src = fb;
          return;
        }
        // 2nd failure (or no fallback): keep the frame, show the alt text.
        frame.classList.add("is-missing");
        frame.setAttribute("data-alt", img.getAttribute("alt") || "");
      }
      img.addEventListener("error", onFail);
      if (img.complete && img.naturalWidth === 0) onFail();
    });
  }

  /* =================================================
   PART 11 — Testimonial Horizontal Carousel
================================================= */
  function initTestimonialCarousel() {
    var container = document.querySelector("[data-testimonial-carousel]");
    if (!container) return;

    var track = container.querySelector("[data-testimonial-track]");
    var prevBtn = container.querySelector("[data-testimonial-prev]");
    var nextBtn = container.querySelector("[data-testimonial-next]");
    var dotsContainer = container.querySelector("[data-testimonial-dots]");
    var cards = container.querySelectorAll(".testimonial-card");

    if (!track || !cards.length) return;

    var currentIndex = 0;
    var autoPlayTimer = null;
    var touchStartX = 0;
    var touchEndX = 0;

    if (dotsContainer) {
      dotsContainer.innerHTML = "";
      cards.forEach(function (_, i) {
        var dot = document.createElement("button");
        dot.type = "button";
        dot.className = "testimonial-dot" + (i === 0 ? " is-active" : "");
        dot.setAttribute("aria-label", "Go to testimonial " + (i + 1));
        dot.addEventListener("click", function () { goTo(i); });
        dotsContainer.appendChild(dot);
      });
    }

    function metrics() {
      var wrapW = track.parentElement.getBoundingClientRect().width;
      var cardW = cards[0].getBoundingClientRect().width;
      var gap = parseFloat(getComputedStyle(track).columnGap || getComputedStyle(track).gap) || 20;
      var perView = Math.max(1, Math.round((wrapW + gap) / (cardW + gap)));
      return { cardW: cardW, gap: gap, maxIndex: Math.max(0, cards.length - perView) };
    }

    function updateTrack() {
      var m = metrics();
      if (currentIndex > m.maxIndex) currentIndex = m.maxIndex;
      var offset = currentIndex * (m.cardW + m.gap);
      track.style.transform = "translateX(-" + offset + "px)";

      if (dotsContainer) {
        var dots = dotsContainer.querySelectorAll(".testimonial-dot");
        dots.forEach(function (dot, i) {
          dot.classList.toggle("is-active", i === currentIndex);
          dot.style.display = i > m.maxIndex ? "none" : "";
        });
      }
    }

    function goTo(index) {
      var max = metrics().maxIndex;
      if (index < 0) index = max;
      if (index > max) index = 0;
      currentIndex = index;
      updateTrack();
    }

    function next() { goTo(currentIndex + 1); }
    function prev() { goTo(currentIndex - 1); }

    if (prevBtn) prevBtn.addEventListener("click", prev);
    if (nextBtn) nextBtn.addEventListener("click", next);

    function startAutoPlay() {
      stopAutoPlay();
      autoPlayTimer = setInterval(next, 5000);
    }

    function stopAutoPlay() {
      if (autoPlayTimer) clearInterval(autoPlayTimer);
    }

    container.addEventListener("mouseenter", stopAutoPlay);
    container.addEventListener("mouseleave", startAutoPlay);

    container.addEventListener("touchstart", function (e) {
      touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });

    container.addEventListener("touchend", function (e) {
      touchEndX = e.changedTouches[0].screenX;
      if (touchStartX - touchEndX > 40) next();
      if (touchEndX - touchStartX > 40) prev();
    }, { passive: true });

    window.addEventListener("resize", updateTrack);
    updateTrack();
    startAutoPlay();
  }

  /* =================================================
   PART 11 — Active Section Detection via IntersectionObserver
================================================= */
  function initActiveSectionObserver() {
    var sections = document.querySelectorAll("section[id]");
    if (!sections.length || typeof IntersectionObserver === "undefined") return;

    var desktopLinks = document.querySelectorAll(".primary-nav a[href^='#']");
    var bottomLinks = document.querySelectorAll(".mobile-nav a[href^='#'], .mobile-nav button[data-more-toggle]");
    var moreLinks = document.querySelectorAll(".more-sheet a[href^='#']");

    var sectionMap = {
      "home": "home",
      "solutions": "solutions",
      "life": "solutions",
      "health": "solutions",
      "general": "solutions",
      "motor": "solutions",
      "business": "solutions",
      "about": "about",
      "testimonials": "more",
      "career": "more",
      "faq": "more",
      "contact": "contact"
    };

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          var id = entry.target.getAttribute("id");
          if (!id) return;

          desktopLinks.forEach(function (link) {
            var href = link.getAttribute("href").substring(1);
            if (href === id) {
              link.setAttribute("aria-current", "page");
            } else {
              link.removeAttribute("aria-current");
            }
          });

          var navKey = sectionMap[id] || id;

          bottomLinks.forEach(function (el) {
            var key = el.getAttribute("data-bottom-nav");
            if (key === navKey) {
              if (el.tagName.toLowerCase() === "a") {
                el.setAttribute("aria-current", "page");
              } else {
                el.classList.add("is-active");
              }
            } else {
              if (el.tagName.toLowerCase() === "a") {
                el.removeAttribute("aria-current");
              } else {
                el.classList.remove("is-active");
              }
            }
          });

          moreLinks.forEach(function (link) {
            var href = link.getAttribute("href").substring(1);
            if (href === id) {
              link.setAttribute("aria-current", "page");
            } else {
              link.removeAttribute("aria-current");
            }
          });
        }
      });
    }, { threshold: 0.3, rootMargin: "-10% 0px -40% 0px" });

    sections.forEach(function (sec) { observer.observe(sec); });
  }

  /* =================================================
   PART 11 — Career Apply Button Handler
================================================= */
  function initCareerApplyButtons() {
    var applyBtns = document.querySelectorAll("[data-apply-role]");
    var requirementSelect = document.querySelector("#lf-requirement");
    applyBtns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (requirementSelect) {
          requirementSelect.value = "Other";
        }
      });
    });
  }

  /* =================================================
   Application Initialization
================================================= */
  document.addEventListener("DOMContentLoaded", function () {
    initFixedHeaderHeight();
    initMobileNavPanel();
    initMoreSheet();
    initImageFallbacks();
    initTestimonialCarousel();
    initActiveSectionObserver();
    initCareerApplyButtons();

    if (window.BondSite.Interactions) {
      window.BondSite.Interactions.init();
    }

    initHeroScene();
    initAboutScene();
    initServiceStackScene();
    initContactDocScene();
    initFaqStackScene();
    initTestimonialStackScene();
  });
})();
