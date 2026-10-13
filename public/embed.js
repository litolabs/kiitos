// Testimonial widget loader. Resizes each widget iframe to fit its content.
// Paste once per page, next to any widget iframe.
(function () {
  if (window.__loveWidgets) return;
  window.__loveWidgets = true;
  // Showit wraps embeds in a fixed-width box even when the element is set to
  // stretch, so widen that inner box to fill its stretched parent.
  function fit(f) {
    var p = f.parentElement;
    if (p && p.classList && p.classList.contains("si-embed")) p.style.width = "100%";
  }
  function fitAll() {
    var frames = document.querySelectorAll("iframe[data-love-widget]");
    for (var i = 0; i < frames.length; i++) fit(frames[i]);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fitAll);
  else fitAll();

  addEventListener("message", function (e) {
    var d = e.data;
    if (!d || d.type !== "love-widget:height" || typeof d.height !== "number") return;
    var frames = document.querySelectorAll("iframe[data-love-widget]");
    for (var i = 0; i < frames.length; i++) {
      var f = frames[i];
      // Only the widget's own frame can resize it. The address isn't checked,
      // because an old widget link may have been forwarded to a new domain.
      if (f.contentWindow !== e.source) continue;
      fit(f);
      f.style.height = Math.max(0, Math.ceil(d.height)) + "px";
    }
  });
})();
