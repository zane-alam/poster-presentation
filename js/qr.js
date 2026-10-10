/* Draws the QR code at the bottom of the page.
   The link comes from js/config.js (siteUrl). If that is empty, the QR uses
   the address of the page being viewed, which is correct after deployment. */
(function () {
  "use strict";

  var tile = document.getElementById("qr");
  var link = document.getElementById("qr-link");
  var urlText = document.getElementById("qr-url");
  if (!tile || !link) return;

  function clean(u) {
    return String(u || "").replace(/^\s+|\s+$/g, "");
  }

  var cfg = (window.SITE_CONFIG && clean(window.SITE_CONFIG.siteUrl)) || "";
  var url = cfg;

  if (!url) {
    var proto = location.protocol;
    if (proto === "http:" || proto === "https:") {
      url = location.origin + location.pathname.replace(/index\.html$/, "");
    }
  }

  if (/^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(url) && !/^https?:\/\//i.test(url)) {
    url = "https://" + url;
  }

  function placeholder() {
    tile.className = "qr__tile is-empty";
    tile.textContent = "Your link will appear here after you deploy the site";
    link.removeAttribute("target");
    link.setAttribute("href", "#scan");
    link.setAttribute("aria-label", "QR code placeholder: the link is not set yet");
    if (urlText) urlText.textContent = "Link not set yet. Add it in js/config.js (siteUrl).";
  }

  if (!url || typeof window.qrcode !== "function") {
    placeholder();
    return;
  }

  try {
    var q = window.qrcode(0, "M");
    q.addData(url);
    q.make();
    tile.className = "qr__tile";
    tile.innerHTML = q.createSvgTag({ cellSize: 4, margin: 16, scalable: true });
    var svg = tile.querySelector("svg");
    if (svg) {
      svg.setAttribute("role", "img");
      svg.setAttribute("aria-label", "QR code that opens " + url);
    }
    link.setAttribute("href", url);
    link.setAttribute("target", "_blank");
    link.setAttribute("rel", "noopener");
    link.setAttribute("aria-label", "Open the website: " + url);
    if (urlText) urlText.textContent = url;
  } catch (e) {
    placeholder();
  }
})();
