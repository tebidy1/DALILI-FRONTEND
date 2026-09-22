/* ============================================================
   إتقان — محرك الأقسام المؤسسية (institutional.html)
   لكل قسم: نقاط تتبدل تلقائيًا كل ٦ ثوانٍ بشريط تقدم،
   النقر يفعّل نقطة ويوقف التلقائي، المرور يوقفه مؤقتًا.
   يبدأ عند دخول ٤٠٪ من القسم. الجوال: أكورديون يدوي.
   ============================================================ */
(function () {
  'use strict';

  var POINT_MS = 6000;
  var mqMobile = window.matchMedia('(max-width: 880px)');
  var mqReduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  function activate(pointsEl, frameEl, index) {
    var points = pointsEl.querySelectorAll('.inst-point');
    var count = points.length;
    if (index >= count) index = 0;
    if (index < 0) index = count - 1;
    for (var i = 0; i < count; i++) {
      var p = points[i];
      var on = i === index;
      p.classList.toggle('is-active', on);
      var head = p.querySelector('.inst-point-head');
      if (head) head.setAttribute('aria-expanded', on ? 'true' : 'false');
    }
    if (frameEl) frameEl.setAttribute('data-state', String(index + 1));
  }

  function setupSection(section) {
    var pointsEl = section.querySelector('.inst-points');
    if (!pointsEl) return;
    var frameEl = section.querySelector('.inst-frame');
    var points = pointsEl.querySelectorAll('.inst-point');
    var current = 0;
    var started = false;
    var paused = false;
    var manual = false;
    var hoverPause = false;

    pointsEl.classList.add('is-paused');

    function markManual() {
      if (manual) return;
      manual = true;
      pointsEl.classList.add('is-manual');
    }

    function go(index) {
      current = index;
      activate(pointsEl, frameEl, current);
    }

    function restartBar() {
      // إعادة تشغيل أنميشن الشريط للنقطة النشطة (بإزاحة وإرجاع في إطار واحد)
      var active = points[current];
      var bar = active.querySelector('.inst-bar');
      if (!bar) return;
      bar.style.animation = 'none';
      void bar.offsetWidth;
      bar.style.animation = '';
    }

    function tick() {
      if (!started || paused || hoverPause || manual || mqMobile.matches || mqReduced.matches) return;
      go((current + 1) % points.length);
      restartBar();
      schedule();
    }

    var timer = null;
    function schedule() {
      if (timer) clearTimeout(timer);
      if (manual || mqMobile.matches || mqReduced.matches) return;
      timer = setTimeout(tick, POINT_MS);
    }

    function stopSchedule() { if (timer) { clearTimeout(timer); timer = null; } }

    // النقر: تفعيل يدوي يوقف التقدم التلقائي
    pointsEl.addEventListener('click', function (e) {
      var head = e.target.closest('.inst-point-head');
      if (!head) return;
      var pointEl = head.parentElement;
      var idx = Array.prototype.indexOf.call(points, pointEl);
      if (idx === -1) return;
      markManual();
      pointsEl.classList.remove('is-paused');
      go(idx);
    });

    // مرور المؤشر فوق النقاط: توقف مؤقت
    pointsEl.addEventListener('mouseenter', function () {
      if (manual || mqMobile.matches) return;
      hoverPause = true;
      pointsEl.classList.add('is-paused');
    });
    pointsEl.addEventListener('mouseleave', function () {
      if (manual || mqMobile.matches) return;
      hoverPause = false;
      pointsEl.classList.remove('is-paused');
      restartBar();
      schedule();
    });

    // بدء عند دخول ٤٠٪ من القسم
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.intersectionRatio >= 0.4 && !started) {
            started = true;
            io.disconnect();
            if (mqReduced.matches || mqMobile.matches) {
              // الحالة الأولى ثابتة — النقر يعمل كأكورديون
              activate(pointsEl, frameEl, 0);
              return;
            }
            pointsEl.classList.remove('is-paused');
            restartBar();
            schedule();
          }
        });
      }, { threshold: [0, 0.4, 0.6] });
      io.observe(section);
    } else {
      started = true;
      activate(pointsEl, frameEl, 0);
    }

    // عند انتهاء أنميشن الشريط → النقطة التالية
    pointsEl.addEventListener('animationend', function (e) {
      if (e.target.classList && e.target.classList.contains('inst-bar')) {
        if (manual || paused || hoverPause) return;
        go((current + 1) % points.length);
        restartBar();
        schedule();
      }
    });

    // تبديل الجوال/الخفض: أعِد الحالة الأولى بدون مؤقتات
    function onModeChange() {
      if (mqMobile.matches || mqReduced.matches) {
        stopSchedule();
        pointsEl.classList.add('is-paused');
        activate(pointsEl, frameEl, current);
      } else if (started && !manual) {
        pointsEl.classList.remove('is-paused');
        restartBar();
        schedule();
      }
    }
    if (mqMobile.addEventListener) mqMobile.addEventListener('change', onModeChange);
    if (mqReduced.addEventListener) mqReduced.addEventListener('change', onModeChange);
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
   بطاقات «الألم بالأرقام» و«وقودٌ للغد» — تتفتح بالضغط
   بطاقة مفتوحة واحدة في كل شبكة · النقر على المفتوحة يغلقها ·
   دخول متتابع هادئ مرة واحدة عند ظهور الشبكة (بلا جافاسكربت: النص ظاهر)
   ============================================================ */
(function () {
  'use strict';

  var mqReduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  function setupValueGrid(grid) {
    var cards = Array.prototype.slice.call(grid.querySelectorAll('.pvc'));

    function setState(card, on) {
      card.classList.toggle('is-open', on);
      var head = card.querySelector('.pvc-head');
      if (head) head.setAttribute('aria-expanded', on ? 'true' : 'false');
    }

    grid.addEventListener('click', function (e) {
      var head = e.target.closest('.pvc-head');
      if (!head) return;
      var card = head.closest('.pvc');
      if (!card) return;
      setState(card, !card.classList.contains('is-open'));
    });

    // الدخول: إظهار متتابع بمَأخور تقاطع، مرة واحدة — ومع الحركة المخفَّضة بلا تأخير
    function reveal() {
      if (mqReduced.matches || !('IntersectionObserver' in window)) {
        cards.forEach(function (c) { c.classList.add('is-in'); });
        return;
      }
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          io.disconnect();
          cards.forEach(function (c, i) {
            c.style.setProperty('--d', (i * 90) + 'ms');
            c.classList.add('is-in');
          });
        });
      }, { threshold: 0.2 });
      io.observe(grid);
    }

    grid.classList.add('pvc-armed');
    reveal();
  }

  document.querySelectorAll('.pvc-grid').forEach(setupValueGrid);
})();
