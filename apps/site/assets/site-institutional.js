/* ============================================================
   إتقان — محرك الأقسام المؤسسية (institutional.html)
   كل قسم: نقاط + صورة حية. الصورة إما «مسرح» (.istage) تتبدّل
   طبقاته — مقطع من المنتج لكل نقطة — أو لوحة مرسومة (.inst-frame)
   تتبدّل حالتها بـdata-state.
   ساعة واحدة: شريط تقدّم النقطة النشطة، ومدته مدة مقطعها
   (data-dur بالثواني). عند اكتماله تُفعَّل النقطة التالية.
   النقر يثبّت نقطة ويوقف التقدّم التلقائي · المرور يوقفه مؤقتًا ·
   يتوقف كل شيء خارج الشاشة · الجوال والحركة المخفَّضة بلا تقدّم تلقائي.
   ============================================================ */
(function () {
  'use strict';

  var mqMobile = window.matchMedia('(max-width: 880px)');
  var mqReduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  function setupSection(section) {
    var pointsEl = section.querySelector('.inst-points');
    if (!pointsEl) return;
    var points = Array.prototype.slice.call(pointsEl.querySelectorAll('.inst-point'));
    var frameEl = section.querySelector('.inst-frame');
    var layers = Array.prototype.slice.call(section.querySelectorAll('.istage-layer'));
    var videos = layers.map(function (l) { return l.querySelector('video'); });

    var current = 0;
    var inView = false;
    var manual = false;
    var hover = false;
    var primed = false;

    function auto() { return !manual && !mqMobile.matches && !mqReduced.matches; }

    // المصادر تُربط حين يقترب القسم من الشاشة — لا تحميل قبل الحاجة
    function prime() {
      if (primed) return;
      primed = true;
      videos.forEach(function (v) {
        if (!v) return;
        if (!v.getAttribute('poster')) v.setAttribute('poster', v.getAttribute('data-poster'));
        v.src = v.getAttribute('data-src');
        if (mqReduced.matches) v.setAttribute('controls', '');
      });
    }

    function playActive() {
      videos.forEach(function (v, i) {
        if (!v) return;
        if (i === current && inView && !mqReduced.matches) {
          var p = v.play();
          if (p && p.catch) p.catch(function () {});
        } else {
          v.pause();
        }
      });
    }

    function restartBar() {
      var bar = points[current].querySelector('.inst-bar');
      if (!bar) return;
      bar.style.animation = 'none';
      void bar.offsetWidth;
      bar.style.animation = '';
    }

    function syncClasses() {
      pointsEl.classList.toggle('is-auto', auto());
      pointsEl.classList.toggle('is-paused', !inView || hover);
    }

    function show(index, rewind) {
      current = (index + points.length) % points.length;
      points.forEach(function (p, i) {
        var on = i === current;
        p.classList.toggle('is-active', on);
        var head = p.querySelector('.inst-point-head');
        if (head) head.setAttribute('aria-expanded', on ? 'true' : 'false');
      });
      var dur = parseFloat(points[current].getAttribute('data-dur'));
      pointsEl.style.setProperty('--pdur', (isFinite(dur) ? dur : 6) + 's');
      if (frameEl) frameEl.setAttribute('data-state', String(current + 1));
      layers.forEach(function (l, i) { l.classList.toggle('is-on', i === current); });
      var v = videos[current];
      if (v && rewind && primed) { try { v.currentTime = 0; } catch (err) {} }
      restartBar();
      playActive();
    }

    // اكتمال شريط النقطة النشطة ← النقطة التالية
    pointsEl.addEventListener('animationend', function (e) {
      if (!e.target.classList || !e.target.classList.contains('inst-bar')) return;
      if (!auto() || !inView) return;
      show(current + 1, true);
    });

    pointsEl.addEventListener('click', function (e) {
      var head = e.target.closest('.inst-point-head');
      if (!head) return;
      var idx = points.indexOf(head.parentElement);
      if (idx === -1) return;
      manual = true;
      prime();
      syncClasses();
      show(idx, true);
    });

    pointsEl.addEventListener('mouseenter', function () { hover = true; syncClasses(); });
    pointsEl.addEventListener('mouseleave', function () { hover = false; syncClasses(); });

    function onMode() { syncClasses(); restartBar(); playActive(); }
    if (mqMobile.addEventListener) mqMobile.addEventListener('change', onMode);
    if (mqReduced.addEventListener) mqReduced.addEventListener('change', onMode);

    // المشاهد المرسومة تبدأ تتابعها حين يراها الزائر، لا عند تحميل الصفحة
    var stageEl = section.querySelector('.istage');
    var canObserve = 'IntersectionObserver' in window;
    if (stageEl && canObserve) stageEl.classList.add('is-armed');

    syncClasses();
    show(0, false);

    if (!canObserve) {
      inView = true; prime(); syncClasses(); playActive();
      return;
    }

    // اقتراب القسم: ربط المصادر
    var nearIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) { prime(); nearIO.disconnect(); }
      });
    }, { rootMargin: '700px 0px' });
    nearIO.observe(section);

    // دخول صورة القسم الشاشة يشغّل ساعته، وخروجها يوقفها
    var target = section.querySelector('.istage') || frameEl || pointsEl;
    new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var now = entry.isIntersecting && entry.intersectionRatio >= 0.35;
        if (now === inView) return;
        inView = now;
        if (inView) {
          prime();
          if (stageEl) stageEl.classList.add('is-live');
        }
        syncClasses();
        playActive();
      });
    }, { threshold: [0, 0.35, 0.6] }).observe(target);
  }

  function init() {
    document.querySelectorAll('.inst-section').forEach(setupSection);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

/* ============================================================
   فيلم «مهمة حقيقية» — زر التشغيل فوق الغلاف، وزر الهيرو
   ([data-play-demo]) يمرّر إلى القسم ثم يشغّل الفيلم، وروابط
   الفصول (.ihow-jump[data-t]) تقفز إلى موضع كل فعل في الفيلم.
   ============================================================ */
(function () {
  'use strict';

  var player = document.getElementById('demo-player');
  var video = document.getElementById('demo-video');
  var playBtn = document.getElementById('demo-play');
  if (!player || !video) return;

  function play() {
    video.setAttribute('controls', '');
    var p = video.play();
    if (p && p.catch) p.catch(function () {});
  }

  function reveal() {
    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var r = player.getBoundingClientRect();
    if (r.top < 80 || r.bottom > window.innerHeight) {
      player.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
    }
  }

  function seek(t) {
    function go() { try { video.currentTime = t; } catch (err) {} play(); }
    if (video.readyState >= 1) { go(); return; }
    video.addEventListener('loadedmetadata', go, { once: true });
    video.load();
  }

  video.addEventListener('play', function () { player.classList.add('is-playing'); });
  video.addEventListener('ended', function () { player.classList.remove('is-playing'); });
  if (playBtn) playBtn.addEventListener('click', play);

  document.querySelectorAll('[data-play-demo]').forEach(function (link) {
    link.addEventListener('click', function (e) {
      e.preventDefault();
      reveal();
      play();
    });
  });

  document.querySelectorAll('.ihow-jump').forEach(function (btn) {
    btn.addEventListener('click', function () {
      reveal();
      seek(parseFloat(btn.getAttribute('data-t')) || 0);
    });
  });
})();
