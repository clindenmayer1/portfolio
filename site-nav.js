/* ─── <site-nav> ────────────────────────────────────────────────────────
   The shared site navigation, so every page carries an identical bar.

   ONE element in the markup. Internally it holds the two colour layers the
   homepage has always used — a light bar with a dark bar over it — because
   the homepage crossfades between them on scroll: dark text reads over the
   light hero card, light text reads over the dark backdrop once the card
   shrinks away. That crossfade is driven from the page through a single
   custom property:

       document.querySelector('site-nav').style.setProperty('--nav-over', 0)

   --nav-over is the DARK layer's opacity: 1 = dark text, 0 = light text.

   Geometry and type are taken verbatim from the homepage:
     brand  left 24px, top 24px, Inter 20px, "CHRIS" 400 + "LINDENMAYER" 700
     links  right 40px, top 26px, Inter 16px/400, 24px gap
   Those offsets are the reference; do not swap them for a page's own
   padding variable, or the bar shifts between pages.

   Shadow DOM keeps a page's stylesheet from reaching in and moving it. The
   markup lives here rather than in an HTML partial because these pages are
   opened over file://, where fetch() is blocked and a partial would
   silently fail to load.

   Attributes
     base   path prefix for the links, e.g. base="index2.html" from a
            sub-page. Omit on the homepage so they stay in-page anchors.
     autohide
            retract the bar on scroll DOWN and bring it back on scroll UP,
            over a 70% veil in the page's own background colour. Project
            pages only — the homepage bar stays put, since it is part of
            the hero's colour crossfade.
─────────────────────────────────────────────────────────────────────── */
(function () {
  var LAYER = `
      <a class="brand" part="brand">
        <span class="b1">CHRIS</span><span class="b2">LINDENMAYER</span>
      </a>
      <nav class="links" part="links" aria-label="Primary">
        <a data-to="#work">Work</a>
        <a data-to="#about">About</a>
        <a data-to="#contact">Contact</a>
      </nav>`;

  var TEMPLATE = `
    <style>
      :host {
        position: fixed;
        inset: 0 0 auto 0;
        z-index: 1000;
        display: block;
        pointer-events: none;          /* only the links take the cursor */
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        --nav-over: 1;                 /* dark layer opacity; page drives this */
        --nav-h: 72px;                 /* the veil's height; type sits inside it */
        --nav-veil: transparent;       /* resolved from the page's own background */
        visibility: visible;
        transition: transform 320ms cubic-bezier(.22,.72,.38,1),
                    visibility 0s linear 0s;
      }
      /* Retracted. visibility flips only AFTER the slide finishes, so the
         links leave the tab order without the bar blinking out. */
      :host([data-nav-hidden]) {
        /* -100% would be ZERO: the host's own box has no height (brand and
           links are both absolutely positioned inside it), so a percentage
           translate had nothing to resolve against and the bar blinked out
           instead of sliding. Move it by the bar's height in px. */
        transform: translateY(calc(-1 * var(--nav-h)));
        visibility: hidden;
        transition-delay: 0s, 320ms;
      }
      /* The backdrop only exists once the bar has come BACK — at the top of
         the page it is the bare hero, as before. */
      .veil {
        position: absolute;
        inset: 0 0 auto 0;
        block-size: var(--nav-h);
        background: var(--nav-veil);
        opacity: 0;
        transition: opacity 240ms ease;
        pointer-events: none;
      }
      :host([data-nav-veiled]) .veil { opacity: 0.7; }

      @media (prefers-reduced-motion: reduce) {
        :host, .veil { transition-duration: 1ms; }
      }

      .layer { position: absolute; inset: 0 0 auto 0; }
      /* Light layer underneath, dark layer over it — same stack as the
         homepage's .nav-under / .nav-over. */
      .under { color: #FCFCFA; }
      .over  { color: #4A4A44; opacity: var(--nav-over); }

      a { pointer-events: auto; text-decoration: none; color: inherit; }

      .brand {
        position: absolute;
        top: 24px;
        left: 24px;
        display: flex;
        align-items: center;
        gap: 2px;
        font-size: 20px;
        line-height: 1;
        letter-spacing: 0;
        white-space: nowrap;
        opacity: 0.7;
      }
      .brand .b1 { font-weight: 400; }
      .brand .b2 { font-weight: 700; }

      .links {
        position: absolute;
        top: 26px;                     /* 2px below the brand, as on the homepage */
        right: 40px;
        display: flex;
        align-items: center;
        gap: 24px;
        font-size: 16px;
        font-weight: 400;
        line-height: 1;
        opacity: 0.7;
      }

      /* The dark layer sits on top, so only its links should be clickable
         while it is opaque; below that the light layer's take over. */
      .over[style*="opacity: 0"] a { pointer-events: none; }
    </style>
    <div class="veil" aria-hidden="true"></div>
    <div class="layer under" aria-hidden="true">${LAYER}</div>
    <div class="layer over">${LAYER}</div>`;

  // How far down the page the bar stays put regardless of direction. Above
  // this the hero is still in view and the bar belongs to it.
  var TOP_ZONE = 80;
  // Movement below this is noise — a trackpad settling, or the rubber-band
  // at either end — and must not flip the bar.
  var JITTER = 6;

  class SiteNav extends HTMLElement {
    connectedCallback() {
      if (!this.shadowRoot) {
        this.attachShadow({ mode: 'open' }).innerHTML = TEMPLATE;
      }
      this.#applyBase();
      // Opt-IN, and only the project pages opt in. The homepage's bar is
      // tied to its hero crossfade and must stay put.
      if (this.hasAttribute('autohide')) this.#watchScroll();
    }
    static get observedAttributes() { return ['base']; }
    attributeChangedCallback() { if (this.shadowRoot) this.#applyBase(); }

    disconnectedCallback() {
      if (this.__onScroll) removeEventListener('scroll', this.__onScroll);
    }

    /* The veil has to match whatever the page is actually painted on, and
       that differs per page (dark on the homepage, cream on a project
       page). Reading it from the document means no page has to declare it,
       and it cannot drift out of step with the design. */
    #resolveVeil() {
      var el = document.body, c = '';
      for (var i = 0; i < 2 && el; i++) {
        c = getComputedStyle(el).backgroundColor;
        if (c && c !== 'transparent' && !/rgba\(0,\s*0,\s*0,\s*0\)/.test(c)) break;
        el = el.parentElement;
        c = '';
      }
      if (c) this.style.setProperty('--nav-veil', c);
    }

    /* Hide on the way down, come back on the way up. Direction is taken
       from the scroll position itself rather than from wheel events, so a
       drag on the scrollbar or a keyboard PageUp behaves the same way. */
    #watchScroll() {
      var self = this;
      var last = window.scrollY;
      var queued = false;

      requestAnimationFrame(function () { self.#resolveVeil(); });

      function settle() {
        queued = false;
        var y = window.scrollY;
        var dy = y - last;

        if (y <= TOP_ZONE) {
          // At the top the bar is simply part of the page: shown, bare.
          self.removeAttribute('data-nav-hidden');
          self.removeAttribute('data-nav-veiled');
          last = y;
          return;
        }
        if (Math.abs(dy) < JITTER) return;   // leave `last` alone: small
                                             // moves accumulate into a real
                                             // one rather than being lost
        if (dy > 0) {
          self.setAttribute('data-nav-hidden', '');
          self.removeAttribute('data-nav-veiled');
        } else {
          self.removeAttribute('data-nav-hidden');
          self.setAttribute('data-nav-veiled', '');
        }
        last = y;
      }

      this.__onScroll = function () {
        if (queued) return;
        queued = true;
        requestAnimationFrame(settle);
      };
      addEventListener('scroll', this.__onScroll, { passive: true });
      settle();
    }

    #applyBase() {
      var base = this.getAttribute('base') || '';
      var root = this.shadowRoot;
      root.querySelectorAll('.brand').forEach(function (a) {
        a.setAttribute('href', base || '#top');
      });
      root.querySelectorAll('.links a').forEach(function (a) {
        a.setAttribute('href', base + a.dataset.to);
      });
      // Only the visible (dark) layer should be reachable by assistive tech
      // and the keyboard; the duplicate underneath is decorative.
      root.querySelector('.under').setAttribute('aria-hidden', 'true');
      root.querySelectorAll('.under a').forEach(function (a) {
        a.setAttribute('tabindex', '-1');
      });
    }
  }
  if (!customElements.get('site-nav')) customElements.define('site-nav', SiteNav);
})();
