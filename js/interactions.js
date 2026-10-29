/* ==========================================================================
   INTERACTIONS.JS
   Part 3 — page interactions that are NOT the Three.js scene itself:
   scroll-reveal for document sections, prefers-reduced-motion handling,
   the scroll-progress → 3D "stage" pipeline, the hero's dock/float
   behaviour once it scrolls out of its normal position, and hotspot
   navigation (clicking a document hotspot scrolls the matching section
   into view). Does not create or duplicate any Three.js scene objects —
   it only reads scroll position and calls methods on the controller
   three-scene.js hands back.
   ========================================================================== */

window.BondSite = window.BondSite || {};

(function () {
  "use strict";

  var STAGE_IDS = ["hero", "intro", "services", "how", "trust", "cta"];

  function prefersReducedMotion() {
    return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  /* =================================================
   Scroll & Animation Effects — reveal on scroll
================================================= */

  function initScrollReveal(reduced) {
    var items = document.querySelectorAll("[data-reveal]");
    if (!items.length) return;

    if (reduced || typeof IntersectionObserver === "undefined") {
      items.forEach(function (el) { el.classList.add("is-visible"); });
      return;
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: "0px 0px -8% 0px" });

    items.forEach(function (el) { observer.observe(el); });
  }

  /* =================================================
   Scroll & Animation Effects — hero 3D stage progress
================================================= */

  function initHeroStoryteller(reduced) {
    var hero3d = document.querySelector("[data-hero-3d]");
    var stageEls = STAGE_IDS.map(function (id) {
      return document.querySelector('[data-3d-stage="' + id + '"]');
    });

    if (!hero3d || stageEls.indexOf(null) !== -1) return; // not the Home page

    var mobileQuery = window.matchMedia("(max-width: 900px)");
    var docked = false;
    var faded = false;
    var ticking = false;

    function getController() { return window.BondSite.heroSceneController; }

    function computeStageProgress() {
      var firstTop = stageEls[0].getBoundingClientRect().top + window.scrollY;
      var lastEl = stageEls[stageEls.length - 1];
      var lastRect = lastEl.getBoundingClientRect();
      var lastBottom = lastRect.bottom + window.scrollY;
      var zoneHeight = Math.max(1, lastBottom - firstTop);
      var viewCenter = window.scrollY + window.innerHeight / 2;
      var raw = (viewCenter - firstTop) / zoneHeight;
      return Math.max(0, Math.min(1, raw)) * (STAGE_IDS.length - 1);
    }

    function update() {
      ticking = false;
      var controller = getController();

      var heroRect = stageEls[0].getBoundingClientRect();

      // Dock (float as a small fixed panel) once the hero section has
      // scrolled up out of view; undock once it's back on screen. A
      // small buffer avoids flicker right at the boundary.
      var shouldDock = heroRect.bottom < -24;
      var shouldUndock = heroRect.bottom > 24;
      if (shouldDock && !docked) { docked = true; hero3d.classList.add("is-docked"); }
      if (shouldUndock && docked) { docked = false; hero3d.classList.remove("is-docked"); }

      // Fade the docked panel out once the user is near the very bottom
      // of the page (footer territory), based on actual distance to the
      // bottom of the document rather than any one section's bounds —
      // robust regardless of how tall the footer ends up being.
      var docHeight = document.documentElement.scrollHeight;
      var distanceFromBottom = docHeight - (window.scrollY + window.innerHeight);
      var shouldFade = docked && distanceFromBottom < 90;
      var shouldUnfade = distanceFromBottom > 130;
      if (shouldFade && !faded) { faded = true; hero3d.classList.add("is-faded"); }
      if (shouldUnfade && faded) { faded = false; hero3d.classList.remove("is-faded"); }

      if (controller && !reduced) {
        controller.setStageProgress(computeStageProgress());
      }
      if (controller) {
        controller.setHotspotsEnabled(!docked);
      }
    }

    function onScroll() {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    mobileQuery.addEventListener && mobileQuery.addEventListener("change", onScroll);

    // Run once the hero scene controller is likely attached, and again
    // shortly after in case Three.js loaded a little later.
    update();
    setTimeout(update, 400);
  }

  /* =================================================
   Navigation — 3D hotspot to section
================================================= */

  function initHotspotNavigation(reduced) {
    // Called back into by three-scene.js when a document hotspot is
    // clicked; scrolls the matching Home-page section into view using
    // the normal page scroll (no separate popups or routes).
    window.BondSite.onHeroHotspotClick = function (stageId) {
      var target = document.querySelector('[data-3d-stage="' + stageId + '"]');
      if (!target) return;
      target.scrollIntoView({
        behavior: reduced ? "auto" : "smooth",
        block: "start"
      });
    };
  }

  /* =================================================
   Three.js Scene — About panel scroll response (not present on this page)
================================================= */

  function initAboutStoryteller(reduced) {
    var panel = document.querySelector("[data-about-3d]");
    if (!panel) return; // not the About page

    var ticking = false;

    function update() {
      ticking = false;
      var controller = window.BondSite.aboutSceneController;
      if (!controller || reduced) return;
      var rect = panel.getBoundingClientRect();
      var vh = window.innerHeight || 1;
      var progress = 1 - (rect.top + rect.height / 2) / (vh / 2);
      controller.setScrollProgress(Math.max(-1, Math.min(1, progress * 0.4)));
    }

    function onScroll() {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    update();
    setTimeout(update, 400);
  }

  /* =================================================
   Three.js Scene — service stack sync (not present on this page)
================================================= */

  function initServiceStackStoryteller(reduced) {
    var panel = document.querySelector("[data-service-3d]");
    var details = document.querySelectorAll("[data-service-index]");
    if (!panel || !details.length) return; // not the Services page

    var indexButtons = document.querySelectorAll("[data-service-jump]");

    function scrollToService(i) {
      var target = document.querySelector('[data-service-index="' + i + '"]');
      if (!target) return;
      target.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
    }

    function setActive(i) {
      var controller = window.BondSite.serviceStackController;
      if (controller) controller.setActiveIndex(i);
      indexButtons.forEach(function (btn) {
        var isActive = Number(btn.getAttribute("data-service-jump")) === i;
        btn.classList.toggle("is-active", isActive);
      });
    }

    // 3D sheet clicked/tapped -> scroll to its detail section.
    window.BondSite.onServiceSheetSelect = function (i) { scrollToService(i); };

    // The plain-HTML index (accessible without the 3D scene) does the
    // same thing, so the stack is never the only way to reach a service.
    indexButtons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        scrollToService(Number(btn.getAttribute("data-service-jump")));
      });
    });

    if (typeof IntersectionObserver === "undefined") return;

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          setActive(Number(entry.target.getAttribute("data-service-index")));
        }
      });
    }, { threshold: 0.5, rootMargin: "-10% 0px -35% 0px" });

    details.forEach(function (el) { observer.observe(el); });
  }

  /* =================================================
     Consultation Forms
     Handles the quick consultation form, the callback form and the
     main enquiry form. Each form is marked with [data-lead-form] and
     sits inside a [data-lead-wrap] element that also holds its own
     success message. Validation is driven by attributes on the inputs:
       required                  -> must not be empty
       data-error-required       -> message shown when it is empty
       data-validate="mobile"    -> 10-digit Indian mobile (6-9 start)
       data-validate="age"       -> whole number from 18 to 100
     No backend endpoint exists in this project yet, so a valid
     submission only shows the success message (see README).
  ================================================= */

  function initLeadForms() {
    var forms = document.querySelectorAll("[data-lead-form]");
    if (!forms.length) return;

    var PHONE_RE = /^[6-9]\d{9}$/; // Indian mobile: 10 digits, starts 6-9

    function setError(wrap, message) {
      var errorEl = wrap.querySelector("[data-field-error]");
      if (message) {
        wrap.classList.add("field--error");
        if (errorEl) errorEl.textContent = message;
      } else {
        wrap.classList.remove("field--error");
        if (errorEl) errorEl.textContent = "";
      }
    }

    // Returns an error message for one field, or "" when it is valid.
    function checkField(input) {
      var value = input.value.trim();
      var rule = input.getAttribute("data-validate");

      if (input.required && !value) {
        return input.getAttribute("data-error-required") || "This field is required.";
      }
      if (!value) return "";

      if (rule === "mobile") {
        var last10 = value.replace(/\D/g, "").slice(-10);
        if (!PHONE_RE.test(last10)) return "Please enter a valid 10-digit Indian mobile number.";
      }
      if (rule === "age") {
        var age = Number(value);
        if (!isFinite(age) || age < 18 || age > 100 || Math.floor(age) !== age) {
          return "Please enter an age between 18 and 100.";
        }
      }
      return "";
    }

    function validate(form) {
      var valid = true;
      form.querySelectorAll("[data-field]").forEach(function (wrap) {
        var input = wrap.querySelector("input, select, textarea");
        if (!input || input.type === "radio") return;
        var message = checkField(input);
        setError(wrap, message);
        if (message) valid = false;
      });
      return valid;
    }

    forms.forEach(function (form) {
      var formWrap = form.closest("[data-lead-wrap]");
      var successEl = formWrap && formWrap.querySelector("[data-form-success]");

      // Clear a field's error as soon as the visitor edits it again.
      form.querySelectorAll("[data-field]").forEach(function (wrap) {
        var input = wrap.querySelector("input, select, textarea");
        if (!input) return;
        input.addEventListener("input", function () {
          if (wrap.classList.contains("field--error")) setError(wrap, checkField(input));
        });
      });

      form.addEventListener("submit", function (e) {
        e.preventDefault(); // no backend connected yet - see README

        if (!validate(form)) {
          var firstError = form.querySelector(
            ".field--error input, .field--error select, .field--error textarea"
          );
          if (firstError) firstError.focus();
          return;
        }

        if (formWrap) formWrap.classList.add("is-submitted");
        if (successEl) {
          successEl.classList.add("is-visible");
          successEl.setAttribute("tabindex", "-1");
          successEl.focus();
        }
      });
    });
  }

  /* =================================================
     WhatsApp Actions
     Adds a pre-filled message to WhatsApp links that carry a
     data-whatsapp-text attribute. The number in each link's href is
     left exactly as written in the HTML.
  ================================================= */

  function initWhatsAppLinks() {
    document.querySelectorAll("a[data-whatsapp-text]").forEach(function (link) {
      var base = link.getAttribute("href");
      if (!base || base.indexOf("text=") !== -1) return;
      var text = encodeURIComponent(link.getAttribute("data-whatsapp-text"));
      link.setAttribute("href", base + (base.indexOf("?") === -1 ? "?" : "&") + "text=" + text);
    });
  }

  /* =================================================
     Insurance Calculators
     Five illustrative calculators. Each card is marked data-calc="..."
     and holds [data-calc-input] fields, a [data-calc-run] button and a
     [data-calc-value] output. Results are indicative only and the
     "Illustrative only" note is part of every result area in the HTML.
  ================================================= */

  function initCalculators() {
    var cards = document.querySelectorAll("[data-calc]");
    if (!cards.length) return;

    function money(n) {
      return "\u20B9" + Math.round(n).toLocaleString("en-IN");
    }

    // Monthly amount needed to reach a future target, given an assumed
    // yearly return and number of years (ordinary annuity, monthly).
    function monthlySaving(target, annualReturnPct, years) {
      var months = Math.max(1, Math.round(years * 12));
      var r = annualReturnPct / 100 / 12;
      if (r === 0) return target / months;
      return (target * r) / (Math.pow(1 + r, months) - 1);
    }

    var calculators = {
      life: function (v) {
        if (!(v.income >= 0) || !(v.years > 0)) return null;
        var liabilities = v.liabilities || 0;
        var existing = v.existing || 0;
        var need = Math.max(0, v.income * v.years + liabilities - existing);
        return "Indicative cover to consider: <strong>" + money(need) + "</strong><br>" +
          "(income to replace " + money(v.income * v.years) + " + liabilities " + money(liabilities) +
          " \u2212 existing cover and savings " + money(existing) + ")";
      },

      term: function (v) {
        if (!(v.age >= 18 && v.age <= 65) || !(v.income > 0)) return null;
        var multiple = Math.min(25, Math.max(5, 60 - v.age));
        return "Indicative cover to consider: <strong>" + money(v.income * multiple) + "</strong><br>" +
          "(" + multiple + "\u00D7 annual income)";
      },

      premium: function (v) {
        if (!(v.cover > 0) || !(v.rate >= 0)) return null;
        var yearly = (v.cover / 1000) * v.rate;
        return "Indicative premium: <strong>" + money(yearly) + " a year</strong> (about " +
          money(yearly / 12) + " a month)";
      },

      retirement: function (v) {
        if (!(v.age > 0) || !(v.retage > v.age) || !(v.expense > 0)) return null;
        var inflation = v.inflation || 0;
        var ret = v.return || 0;
        var years = v.retage - v.age;
        var futureMonthly = v.expense * Math.pow(1 + inflation / 100, years);
        var corpus = futureMonthly * 12 * 25;
        return "Indicative retirement fund: <strong>" + money(corpus) + "</strong><br>" +
          "Monthly expenses at retirement: about " + money(futureMonthly) + "<br>" +
          "Indicative monthly saving: about " + money(monthlySaving(corpus, ret, years));
      },

      education: function (v) {
        if (!(v.cost > 0) || !(v.years > 0)) return null;
        var inflation = v.inflation || 0;
        var ret = v.return || 0;
        var future = v.cost * Math.pow(1 + inflation / 100, v.years);
        return "Estimated future cost: <strong>" + money(future) + "</strong><br>" +
          "Indicative monthly saving: about " + money(monthlySaving(future, ret, v.years));
      }
    };

    cards.forEach(function (card) {
      var run = card.querySelector("[data-calc-run]");
      var output = card.querySelector("[data-calc-value]");
      var calc = calculators[card.getAttribute("data-calc")];
      if (!run || !output || !calc) return;

      run.addEventListener("click", function () {
        var values = {};
        card.querySelectorAll("[data-calc-input]").forEach(function (input) {
          values[input.getAttribute("data-calc-input")] =
            input.value.trim() === "" ? NaN : Number(input.value);
        });

        // Optional inputs fall back to 0 so that blank means "none".
        ["liabilities", "existing"].forEach(function (key) {
          if (key in values && isNaN(values[key])) values[key] = 0;
        });

        var result = calc(values);
        if (result === null) {
          output.classList.add("is-error");
          output.textContent = "Please fill in the required fields with valid numbers.";
        } else {
          output.classList.remove("is-error");
          output.innerHTML = result;
        }
      });
    });
  }

  /* =================================================
   Calculator tabs
   One calculator container; tabs switch between the five calculators.
   Without JavaScript every calculator stays visible, stacked.
================================================= */

  function initCalculatorTabs() {
    var shell = document.querySelector("[data-calc-shell]");
    if (!shell) return;
    var tabs = Array.prototype.slice.call(shell.querySelectorAll("[data-calc-tab]"));
    var panels = Array.prototype.slice.call(shell.querySelectorAll(".calc-panel"));
    if (!tabs.length || !panels.length) return;

    function select(key, focus) {
      tabs.forEach(function (tab) {
        var on = tab.getAttribute("data-calc-tab") === key;
        tab.setAttribute("aria-selected", on ? "true" : "false");
        tab.tabIndex = on ? 0 : -1;
        if (on && focus) tab.focus();
      });
      panels.forEach(function (panel) {
        panel.hidden = panel.getAttribute("data-calc") !== key;
      });
    }

    shell.classList.add("is-tabbed");
    tabs.forEach(function (tab, i) {
      tab.addEventListener("click", function () { select(tab.getAttribute("data-calc-tab"), false); });
      tab.addEventListener("keydown", function (e) {
        var next = null;
        if (e.key === "ArrowRight") next = tabs[(i + 1) % tabs.length];
        else if (e.key === "ArrowLeft") next = tabs[(i - 1 + tabs.length) % tabs.length];
        else if (e.key === "Home") next = tabs[0];
        else if (e.key === "End") next = tabs[tabs.length - 1];
        if (next) { e.preventDefault(); select(next.getAttribute("data-calc-tab"), true); }
      });
    });
    select(tabs[0].getAttribute("data-calc-tab"), false);
  }

  /* =================================================
   FAQ Accordion
   Single item open at a time; the first question starts open.
================================================= */

  function initFaqAccordion() {
    var triggers = document.querySelectorAll(".faq-item__trigger");
    if (!triggers.length) return; // not the FAQ page

    function closeAll() {
      triggers.forEach(function (other) {
        other.setAttribute("aria-expanded", "false");
        var wrap = other.closest(".faq-item").querySelector(".faq-item__panel-wrap");
        if (wrap) wrap.classList.remove("is-open");
      });
    }

    triggers.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var wasOpen = btn.getAttribute("aria-expanded") === "true";
        closeAll();
        if (!wasOpen) {
          btn.setAttribute("aria-expanded", "true");
          var wrap = btn.closest(".faq-item").querySelector(".faq-item__panel-wrap");
          if (wrap) wrap.classList.add("is-open");
        }
      });
    });

    // First question in the first category starts open.
    if (triggers[0]) triggers[0].click();
  }

  /* =================================================
   Three.js Scene — FAQ stack sync (not present on this page)
================================================= */

  function initFaqStackStoryteller(reduced) {
    var groups = document.querySelectorAll("[data-faq-category]");
    if (!groups.length) return; // not the FAQ page

    function scrollToCategory(i) {
      var target = document.querySelector('[data-faq-category="' + i + '"]');
      if (!target) return;
      target.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
    }

    // The visible category links are plain #anchors and work without JS;
    // this only wires the 3D stack's click/tap selection to the same
    // behaviour so the stack is never the only way to reach a category.
    window.BondSite.onFaqSheetSelect = function (i) { scrollToCategory(i); };
  }

  /* =================================================
   Three.js Scene — testimonial stack sync (not present on this page)
================================================= */

  function initTestimonialStackStoryteller(reduced) {
    var cards = document.querySelectorAll("[data-testimonial-index]");
    if (!cards.length) return; // not the Testimonials page

    var jumpButtons = document.querySelectorAll("[data-testimonial-jump]");

    function setActive(i) {
      cards.forEach(function (card) {
        var isActive = Number(card.getAttribute("data-testimonial-index")) === i;
        card.classList.toggle("is-active", isActive);
      });
      jumpButtons.forEach(function (btn) {
        var isActive = Number(btn.getAttribute("data-testimonial-jump")) === i;
        btn.classList.toggle("is-active", isActive);
      });
    }

    function goTo(i) {
      var target = document.querySelector('[data-testimonial-index="' + i + '"]');
      if (!target) return;
      target.scrollIntoView({
        behavior: reduced ? "auto" : "smooth",
        block: "center",
        inline: "center"
      });
      setActive(i);
      var controller = window.BondSite.testimonialStackController;
      if (controller) controller.setActiveIndex(i);
    }

    window.BondSite.onTestimonialSheetSelect = function (i) { goTo(i); };

    jumpButtons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        goTo(Number(btn.getAttribute("data-testimonial-jump")));
      });
    });
  }

  /* =================================================
   Scroll & Animation Effects — testimonial carousel (not present on this page)
================================================= */
  /*
     Native horizontal scroll (so touch swipe and manual drag always work
     on their own, no JS required for that part) plus a small autoplay
     timer that nudges the track forward, pausing on hover/touch/focus,
     and two buttons that step the track one card at a time. */

  function initTestimonialCarousel(reduced) {
    var track = document.querySelector("[data-testimonial-track]");
    if (!track) return; // not the Testimonials page

    var carousel = track.closest("[data-testimonial-carousel]") || track;
    var prevBtn = document.querySelector("[data-testimonial-prev]");
    var nextBtn = document.querySelector("[data-testimonial-next]");
    var isPaused = false;
    var autoplayId = null;

    function cardStep() {
      var card = track.querySelector(".testimonial-card");
      if (!card) return 300;
      var trackStyle = window.getComputedStyle(track);
      var gap = parseFloat(trackStyle.columnGap || trackStyle.gap || "22") || 22;
      return card.getBoundingClientRect().width + gap;
    }

    function atEnd() {
      return track.scrollLeft + track.clientWidth >= track.scrollWidth - 4;
    }

    function step(direction) {
      if (direction > 0 && atEnd()) {
        track.scrollTo({ left: 0, behavior: reduced ? "auto" : "smooth" });
        return;
      }
      if (direction < 0 && track.scrollLeft <= 4) {
        track.scrollTo({ left: track.scrollWidth, behavior: reduced ? "auto" : "smooth" });
        return;
      }
      track.scrollBy({ left: cardStep() * direction, behavior: reduced ? "auto" : "smooth" });
    }

    if (prevBtn) prevBtn.addEventListener("click", function () { step(-1); });
    if (nextBtn) nextBtn.addEventListener("click", function () { step(1); });

    if (reduced) return; // manual nav + native swipe still work; no autoplay

    function startAutoplay() {
      stopAutoplay();
      autoplayId = window.setInterval(function () {
        if (!isPaused) step(1);
      }, 4200);
    }

    function stopAutoplay() {
      if (autoplayId) window.clearInterval(autoplayId);
      autoplayId = null;
    }

    ["mouseenter", "touchstart", "focusin"].forEach(function (evt) {
      carousel.addEventListener(evt, function () { isPaused = true; }, { passive: true });
    });
    ["mouseleave", "touchend", "focusout"].forEach(function (evt) {
      carousel.addEventListener(evt, function () { isPaused = false; }, { passive: true });
    });

    startAutoplay();
  }

  /* =================================================
   Navigation — scroll spy
================================================= */
  /*
     This is a single-page site, so "active section" can only be known by
     watching scroll position — there is no separate page per nav item.
     Watches each top-level section and updates aria-current on every nav
     surface (desktop header, slide-in mobile panel, fixed bottom nav) plus
     the bottom nav's "More" button for FAQ/Testimonials/Career. */

  function initScrollSpyNav() {
    var sectionIds = ["home", "solutions", "life", "health", "general", "motor", "business", "about", "contact"];
    var sections = sectionIds
      .map(function (id) { return document.getElementById(id); })
      .filter(Boolean);

    if (!sections.length || typeof IntersectionObserver === "undefined") return;

    var moreIds = []; // no overflow "More" menu on this single-page site

    var navLinkGroups = [
      document.querySelectorAll('.primary-nav a[href^="#"]'),
      document.querySelectorAll('[data-mobile-nav-link]'),
      document.querySelectorAll('.mobile-nav a[href^="#"]'),
      document.querySelectorAll('.more-sheet a[href^="#"]')
    ];

    var moreBtn = document.querySelector("[data-more-toggle]");
    var current = null;

    function setActive(id) {
      if (id === current) return;
      current = id;

      navLinkGroups.forEach(function (group) {
        group.forEach(function (link) {
          if (link.getAttribute("href") === "#" + id) {
            link.setAttribute("aria-current", "page");
          } else {
            link.removeAttribute("aria-current");
          }
        });
      });

      if (moreBtn) {
        if (moreIds.indexOf(id) !== -1) {
          moreBtn.classList.add("is-active");
        } else {
          moreBtn.classList.remove("is-active");
        }
      }
    }

    // A thin detection band just above vertical centre: a section counts
    // as "active" once it crosses that line, which reads correctly while
    // scrolling in either direction and avoids flicker between sections.
    var visible = {};

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        visible[entry.target.id] = entry.isIntersecting;
      });
      for (var i = 0; i < sections.length; i++) {
        var id = sections[i].id;
        if (visible[id]) {
          setActive(id);
          return;
        }
      }
    }, { rootMargin: "-45% 0px -50% 0px", threshold: 0 });

    sections.forEach(function (s) { observer.observe(s); });

    // Sensible initial state before the first scroll/observer callback.
    setActive("home");
  }

  /* =================================================
   Scroll & Animation Effects — touch feedback on buttons
================================================= */

  function initButtonFeedback() {
    var buttons = document.querySelectorAll(".btn");
    buttons.forEach(function (btn) {
      btn.addEventListener("touchstart", function () {
        btn.classList.add("is-pressed");
      }, { passive: true });
      ["touchend", "touchcancel"].forEach(function (evt) {
        btn.addEventListener(evt, function () {
          btn.classList.remove("is-pressed");
        }, { passive: true });
      });
    });
  }

  /* =================================================
   CTA Modal
   Opens a premium request form for key conversion buttons without
   leaving the current page. Supports overlay, close button, Escape,
   and body-scroll locking while open.
================================================= */

  function initCtaModal() {
    var modal = document.querySelector("[data-cta-modal-root]");
    if (!modal) return;

    var title = modal.querySelector("[data-cta-title]");
    var form = modal.querySelector("[data-cta-form]");
    var requestType = modal.querySelector("[data-request-type]");
    var successMessage = modal.querySelector("[data-cta-success]");
    var errorMessage = modal.querySelector("[data-cta-error]");
    var triggerButtons = document.querySelectorAll("[data-cta-modal]");
    var closeButtons = modal.querySelectorAll("[data-cta-close]");
    var currentRequestType = "Get a Quote";

    var titleMap = {
      quote: "Get Your Insurance Quote",
      health: "Discuss Health Insurance",
      consultation: "Book Your Free Consultation",
      job: "Apply for a Job"
    };

    function setFieldError(wrap, message) {
      var errorEl = wrap && wrap.querySelector("[data-field-error]");
      if (!wrap) return;
      if (message) {
        wrap.classList.add("field--error");
        if (errorEl) errorEl.textContent = message;
      } else {
        wrap.classList.remove("field--error");
        if (errorEl) errorEl.textContent = "";
      }
    }

    function clearErrors() {
      form.querySelectorAll("[data-cta-field]").forEach(function (wrap) {
        setFieldError(wrap, "");
      });
      if (errorMessage) {
        errorMessage.hidden = true;
        errorMessage.textContent = "";
      }
    }

    function openModal(type) {
      var typeKey = type || "quote";
      currentRequestType = {
        quote: "Get a Quote",
        health: "Discuss Health Insurance",
        consultation: "Book Your Free Consultation",
        job: "Apply for Job"
      }[typeKey] || "Get a Quote";

      title.textContent = titleMap[typeKey] || "Get Your Insurance Quote";
      requestType.value = currentRequestType;
      clearErrors();
      if (successMessage) {
        successMessage.hidden = true;
      }
      form.reset();
      requestType.value = currentRequestType;
      modal.classList.add("is-open");
      modal.setAttribute("aria-hidden", "false");
      document.body.classList.add("modal-open");
      window.setTimeout(function () {
        var nameField = form.querySelector('input[name="name"]');
        if (nameField) nameField.focus();
      }, 50);
    }

    function closeModal() {
      modal.classList.remove("is-open");
      modal.setAttribute("aria-hidden", "true");
      document.body.classList.remove("modal-open");
    }

    triggerButtons.forEach(function (button) {
      button.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        openModal(button.getAttribute("data-cta-modal"));
      });
    });

    closeButtons.forEach(function (button) {
      button.addEventListener("click", closeModal);
    });

    modal.addEventListener("click", function (event) {
      if (event.target === modal || event.target === modal.querySelector(".cta-modal__backdrop")) {
        closeModal();
      }
    });

    document.addEventListener("keydown", function (event) {
      if (modal.classList.contains("is-open") && event.key === "Escape") {
        closeModal();
      }
    });

    function validateName(input) {
      var value = (input.value || "").trim();
      if (!value) {
        setFieldError(input.closest("[data-cta-field]"), "Name is required.");
        return false;
      }
      if (value.length < 2) {
        setFieldError(input.closest("[data-cta-field]"), "Name must be at least 2 characters.");
        return false;
      }
      setFieldError(input.closest("[data-cta-field]"), "");
      return true;
    }

    function validateLocation(input) {
      var value = (input.value || "").trim();
      if (!value) {
        setFieldError(input.closest("[data-cta-field]"), "Location is required.");
        return false;
      }
      setFieldError(input.closest("[data-cta-field]"), "");
      return true;
    }

    function validatePhone(input) {
      var value = (input.value || "").trim().replace(/\D/g, "");
      if (!value) {
        setFieldError(input.closest("[data-cta-field]"), "Mobile number is required.");
        return false;
      }
      if (!/^[6-9]\d{9}$/.test(value)) {
        setFieldError(input.closest("[data-cta-field]"), "Please enter a valid 10-digit Indian mobile number.");
        return false;
      }
      setFieldError(input.closest("[data-cta-field]"), "");
      return true;
    }

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var nameInput = form.querySelector('input[name="name"]');
      var locationInput = form.querySelector('input[name="location"]');
      var phoneInput = form.querySelector('input[name="phone"]');

      var valid = validateName(nameInput) && validateLocation(locationInput) && validatePhone(phoneInput);
      if (!valid) {
        var firstError = form.querySelector(".field--error input");
        if (firstError) firstError.focus();
        return;
      }

      if (errorMessage) {
        errorMessage.hidden = true;
        errorMessage.textContent = "";
      }

      var formData = new FormData(form);
      formData.set("request_type", currentRequestType);

      fetch(form.action, {
        method: "POST",
        body: formData,
        headers: {
          Accept: "application/json"
        }
      }).then(function (response) {
        if (!response.ok) {
          throw new Error("Request failed");
        }
        return response.json();
      }).then(function (result) {
        if (!result || result.success !== true) {
          throw new Error("Web3Forms rejected the submission");
        }
        if (successMessage) {
          successMessage.hidden = false;
        }
        form.reset();
        requestType.value = currentRequestType;
      }).catch(function () {
        if (errorMessage) {
          errorMessage.textContent = "Something went wrong. Please try again.";
          errorMessage.hidden = false;
        }
      });
    });

    form.querySelectorAll('input[name="name"], input[name="location"], input[name="phone"]').forEach(function (input) {
      input.addEventListener("input", function () {
        var wrap = input.closest("[data-cta-field]");
        if (!wrap) return;
        var error = "";
        if (input.name === "name") {
          var v = input.value.trim();
          if (v && v.length < 2) error = "Name must be at least 2 characters.";
        }
        if (input.name === "location" && !input.value.trim()) {
          error = "Location is required.";
        }
        if (input.name === "phone") {
          var digits = input.value.trim().replace(/\D/g, "");
          if (digits && !/^[6-9]\d{9}$/.test(digits)) {
            error = "Please enter a valid 10-digit Indian mobile number.";
          }
        }
        setFieldError(wrap, error);
      });
    });
  }

  /* =================================================
   Application Initialization
   Runs every feature once; each one exits quietly if its markup is absent.
================================================= */

  function init() {
    var reduced = prefersReducedMotion();
    if (reduced) document.documentElement.classList.add("reduced-motion");

    initScrollReveal(reduced);
    initHotspotNavigation(reduced);
    initHeroStoryteller(reduced);
    initAboutStoryteller(reduced);
    initServiceStackStoryteller(reduced);
    initLeadForms();
    initCtaModal();
    initWhatsAppLinks();
    initCalculators();
    initCalculatorTabs();
    initFaqAccordion();
    initFaqStackStoryteller(reduced);
    initTestimonialStackStoryteller(reduced);
    initTestimonialCarousel(reduced);
    initButtonFeedback();
    initScrollSpyNav();
  }

  window.BondSite.Interactions = { init: init, prefersReducedMotion: prefersReducedMotion };
})();
