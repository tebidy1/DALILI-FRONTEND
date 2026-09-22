/* إتقان — حركات الموقع: تثبيت التنقل، تقدّم الآلية تلقائيًا، عدّاد الأرقام.
   كلها تتعطل تلقائيًا مع prefers-reduced-motion (قاعدة CSS تقتل الأنيميشن،
   وهنا نفحص الوسم قبل بدء أي دورة). */
(function () {
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* — تنقل ثابت يضيق عند التمرير — */
  var nav = document.getElementById('nav');
  if (nav) {
    var onScroll = function () {
      nav.classList.toggle('scrolled', window.scrollY > 24);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* — الآلية الخماسية: المحطة النشطة تتقدّم بشريطها ثم تنتقل للتالية — */
  var steps = document.querySelectorAll('#mechSteps .step');
  if (steps.length && !reduced && 'IntersectionObserver' in window) {
    var idx = 0;
    var timer = null;
    var light = function (i) {
      steps.forEach(function (s) { s.classList.remove('is-live'); });
      steps[i].classList.add('is-live');
    };
    var cycle = function () {
      light(idx);
      idx = (idx + 1) % steps.length;
    };
    var start = function () { cycle(); timer = setInterval(cycle, 4200); };
    var stop = function () { if (timer) { clearInterval(timer); timer = null; } };
    new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { if (!timer) start(); }
        else stop();
      });
    }, { threshold: 0.35 }).observe(document.getElementById('mechSteps'));
  }

  /* — البحث الدلالي: الاستعلام يُكتب ثم تُختم شارة «أقرب تطابق» — */
  var shotQ = document.querySelector('.shot-q');
  var firstCard = document.querySelector('.shot .card');
  if (shotQ && firstCard && !reduced && 'IntersectionObserver' in window) {
    var qText = shotQ.textContent.trim();
    var shotIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        shotIO.disconnect();
        shotQ.textContent = '';
        shotQ.classList.add('typing');
        var i = 0;
        var t = setInterval(function () {
          i++;
          shotQ.textContent = qText.slice(0, i);
          if (i >= qText.length) {
            clearInterval(t);
            shotQ.classList.remove('typing');
            setTimeout(function () { firstCard.classList.add('hit'); }, 350);
          }
        }, 45);
      });
    }, { threshold: 0.4 });
    shotIO.observe(shotQ);
  } else if (shotQ && firstCard) {
    /* بلا حركة: الاستعلام كامل والشارة ظاهرة فورًا */
    firstCard.classList.add('hit');
  }

  /* — المشهد ٢: كلام الخبير يُكتب حرفًا حرفًا ثم تظهر شارة WER — */
  var qtext = document.querySelector('.mock-quote .qtext');
  var wer = document.querySelector('.wer-badge');
  if (qtext && wer && !reduced && 'IntersectionObserver' in window) {
    var full = qtext.textContent;
    var qIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        qIO.disconnect();
        qtext.textContent = '';
        qtext.style.borderInlineEnd = '2px solid var(--muted)';
        var i = 0;
        var t = setInterval(function () {
          i++;
          qtext.textContent = full.slice(0, i);
          if (i >= full.length) {
            clearInterval(t);
            qtext.style.borderInlineEnd = '';
            wer.classList.add('show');
          }
        }, 28);
      });
    }, { threshold: 0.4 });
    qIO.observe(qtext);
  } else if (qtext && wer) {
    /* بلا حركة: النص كامل والشارة ظاهرة فورًا */
    wer.classList.add('show');
  }

  /* — المشهد ٤: إضاءة معيّنة الاعتماد عند التوقيع — زر + تشغيل آلي مرة واحدة — */
  var signDemo = document.getElementById('signDemo');
  var signBtn = document.getElementById('signBtn');
  if (signDemo && signBtn) {
    var fourth = signDemo.querySelector('.sd-fourth');
    var playSign = function () {
      fourth.classList.remove('lit');
      signDemo.classList.remove('done');
      void fourth.offsetWidth; /* إعادة تشغيل الحركة من البداية */
      fourth.classList.add('lit');
      setTimeout(function () { signDemo.classList.add('done'); }, 700);
    };
    signBtn.addEventListener('click', playSign);
    if ('IntersectionObserver' in window) {
      var signIO = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (!e.isIntersecting) return;
          signIO.disconnect();
          playSign();
        });
      }, { threshold: 0.5 });
      signIO.observe(signDemo);
    } else {
      playSign();
    }
  }

  /* — عدّاد الأرقام بالأرقام العربية-الهندية، مرة واحدة عند الظهور — */
  var counts = document.querySelectorAll('.count');
  if (counts.length && !reduced && 'IntersectionObserver' in window) {
    var toArabic = function (num, dec) {
      return Number(num).toLocaleString('ar-EG', {
        minimumFractionDigits: dec, maximumFractionDigits: dec
      });
    };
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        var el = e.target;
        io.unobserve(el);
        var target = parseFloat(el.getAttribute('data-count'));
        var dec = el.hasAttribute('data-decimal') ? 1 : 0;
        var t0 = performance.now();
        var dur = 1100;
        var tick = function (t) {
          var p = Math.min((t - t0) / dur, 1);
          var eased = 1 - Math.pow(1 - p, 3);
          el.textContent = toArabic((target * eased).toFixed(dec), dec);
          if (p < 1) requestAnimationFrame(tick);
          else el.textContent = toArabic(target.toFixed(dec), dec);
        };
        requestAnimationFrame(tick);
      });
    }, { threshold: 0.5 });
    counts.forEach(function (el) { io.observe(el); });
  } else {
    counts.forEach(function (el) {
      var target = parseFloat(el.getAttribute('data-count'));
      var dec = el.hasAttribute('data-decimal') ? 1 : 0;
      el.textContent = Number(target).toLocaleString('ar-EG', {
        minimumFractionDigits: dec, maximumFractionDigits: dec
      });
    });
  }
})();
