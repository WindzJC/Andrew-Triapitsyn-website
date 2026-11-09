/* Andrew Triapitsyn — author homepage concept
   Progressive enhancement only: every section is fully readable without JS. */
(function () {
  "use strict";

  var root = document.documentElement;
  root.classList.add("js");

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  /* ---------- Mobile menu (disclosure pattern) ---------- */
  var toggle = document.querySelector("[data-nav-toggle]");
  var list = document.querySelector("[data-nav-list]");

  function setMenu(open) {
    if (!toggle || !list) return;
    toggle.setAttribute("aria-expanded", String(open));
    list.classList.toggle("is-open", open);
    toggle.querySelector(".site-nav__toggle-label").textContent = open ? "Close" : "Menu";
  }

  if (toggle && list) {
    toggle.addEventListener("click", function () {
      setMenu(toggle.getAttribute("aria-expanded") !== "true");
    });
    list.addEventListener("click", function (e) {
      if (e.target.closest("a")) setMenu(false);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
        setMenu(false);
        toggle.focus();
      }
    });
    document.addEventListener("click", function (e) {
      if (toggle.getAttribute("aria-expanded") === "true" && !e.target.closest(".site-nav")) setMenu(false);
    });
    window.matchMedia("(min-width: 861px)").addEventListener("change", function (mq) {
      if (mq.matches) setMenu(false);
    });
  }

  /* ---------- Skip link: move focus into main for screen readers ---------- */
  var skip = document.querySelector(".skip-link");
  if (skip) {
    skip.addEventListener("click", function () {
      var main = document.getElementById("main");
      if (main) setTimeout(function () { main.focus({ preventScroll: true }); }, 0);
    });
  }

  /* ---------- Header rule once the page scrolls ---------- */
  var header = document.querySelector("[data-header]");
  function onScroll() {
    if (header) header.classList.toggle("is-scrolled", window.scrollY > 8);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---------- Current section in nav ----------
     Every page section maps to a nav item (or to none), so the highlight never goes stale. */
  var navLinks = Array.prototype.slice.call(document.querySelectorAll('.site-nav__list a[href^="#"]'));
  var sectionToNav = { top: null, author: "author", writing: "writing", featured: "featured", inside: "featured", sources: "sources", "continue": null };
  function markNav(navId) {
    navLinks.forEach(function (a) {
      if (navId && a.getAttribute("href") === "#" + navId) a.setAttribute("aria-current", "true");
      else a.removeAttribute("aria-current");
    });
  }
  if ("IntersectionObserver" in window && navLinks.length) {
    var navObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) markNav(sectionToNav[entry.target.id]);
      });
    }, { rootMargin: "-45% 0px -54% 0px" });
    Object.keys(sectionToNav).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) navObserver.observe(el);
    });
  }

  /* ---------- Restrained reveal on scroll ---------- */
  var reveals = document.querySelectorAll(".reveal");
  function showAll() {
    for (var i = 0; i < reveals.length; i++) reveals[i].classList.add("is-in");
  }
  if (reduceMotion.matches || !("IntersectionObserver" in window)) {
    showAll();
  } else {
    var revealObserver = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-in");
          obs.unobserve(entry.target);
        }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.05 });
    for (var i = 0; i < reveals.length; i++) revealObserver.observe(reveals[i]);
    // Safety net: never leave content hidden (e.g. print, deep links, full-page capture)
    window.addEventListener("beforeprint", showAll);
    window.addEventListener("hashchange", showAll);
  }
  reduceMotion.addEventListener && reduceMotion.addEventListener("change", function (mq) { if (mq.matches) showAll(); });

  window.addEventListener("load", function () { document.body.classList.add("is-loaded"); });
  if (document.readyState === "complete") document.body.classList.add("is-loaded");

  /* ---------- Inspect the frame: mirror radio state for browsers without :has() ---------- */
  var stage = document.querySelector(".inspect__stage");
  if (stage) {
    var radios = stage.querySelectorAll('input[name="layer"]');
    var sync = function () {
      for (var r = 0; r < radios.length; r++) {
        if (radios[r].checked) stage.setAttribute("data-layer", radios[r].value);
      }
    };
    for (var r = 0; r < radios.length; r++) radios[r].addEventListener("change", sync);
    sync();
  }
})();
