/* ============================================================
   إتقان — صفحة التحديات (challenges.html)
   ست شاشات في صفحة واحدة؛ الرابط (#expert، #onboarding…) يحدد
   الشاشة الظاهرة، فيعمل زر الرجوع وتصلح الروابط للمشاركة.
   عند ظهور شاشة: يُربط مقطعها ويُشغَّل، أو يبدأ تتابع مشهدها
   المرسوم؛ وما عداها يتوقف. بلا JS تظهر الشاشات كلها متتالية.
   ============================================================ */
(function () {
  'use strict';

  var screens = Array.prototype.slice.call(document.querySelectorAll('.chal-screen'));
  if (!screens.length) return;
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.chal-tabs a'));
  var langLinks = Array.prototype.slice.call(document.querySelectorAll('a.lang-switch'));
  var mqReduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  var baseTitle = document.title;

  document.documentElement.classList.add('chal-js');

  function idFromHash() {
    var h = '';
    try { h = decodeURIComponent(location.hash.slice(1)); } catch (err) {}
    for (var i = 0; i < screens.length; i++) if (screens[i].id === h) return h;
    return screens[0].id;
  }

  function startVisual(screen) {
    var video = screen.querySelector('video');
    if (video) {
      if (!video.getAttribute('src')) video.src = video.getAttribute('data-src');
      if (mqReduced.matches) { video.setAttribute('controls', ''); return; }
      try { video.currentTime = 0; } catch (err) {}
      var p = video.play();
      if (p && p.catch) p.catch(function () {});
      return;
    }
    // مشهد مرسوم: يُعاد تتابع عناصره مع كل ظهور
    var stage = screen.querySelector('.istage');
    if (!stage) return;
    stage.classList.add('is-armed');
    stage.classList.remove('is-live');
    void stage.offsetWidth;
    stage.classList.add('is-live');
  }

  function show(id, switched) {
    screens.forEach(function (s) {
      var on = s.id === id;
      s.classList.toggle('is-current', on);
      s.classList.toggle('is-switched', on && switched);
      if (on) { startVisual(s); return; }
      var v = s.querySelector('video');
      if (v) v.pause();
    });
    tabs.forEach(function (a) {
      if (a.getAttribute('href') === '#' + id) {
        a.setAttribute('aria-current', 'true');
        if (a.scrollIntoView && switched) a.scrollIntoView({ block: 'nearest', inline: 'center' });
      } else {
        a.removeAttribute('aria-current');
      }
    });
    // مبدّل اللغة يفتح الشاشة نفسها في النسخة الأخرى
    langLinks.forEach(function (a) {
      a.setAttribute('href', a.getAttribute('href').split('#')[0] + '#' + id);
    });
    var current = document.getElementById(id);
    document.title = current.getAttribute('data-title') + ' — ' + baseTitle;
    window.scrollTo(0, 0);
    if (switched) {
      var h = current.querySelector('.chal-h');
      if (h) h.focus({ preventScroll: true });
    }
  }

  window.addEventListener('hashchange', function () { show(idFromHash(), true); });
  show(idFromHash(), false);
})();
