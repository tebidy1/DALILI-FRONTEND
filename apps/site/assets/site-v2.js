/* ============================================================
   إتقان — حركات وتفاعلات النظام v2
   وفق مخطط «الأثر الذي يستقر»: ظهور هادئ، بناء تدريجي، ثم استقرار.
   IntersectionObserver فقط — بلا مكتبات.
   ============================================================ */
(function () {
  "use strict";

  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  /* ——— أدوات ——— */
  function on(el, evt, fn) { if (el) el.addEventListener(evt, fn); }

  // مراقب الظهور العام: يضيف is-in مرة واحدة
  var revealIO = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) {
        e.target.classList.add("is-in");
        revealIO.unobserve(e.target);
      }
    });
  }, { threshold: 0.18 });

  // يضيف rv (حالة البداية المخفية) ثم يراقب الظهور؛ التتابع عبر --d
  function watch(selector, baseDelay, step) {
    var els = document.querySelectorAll(selector);
    Array.prototype.forEach.call(els, function (el, i) {
      el.style.setProperty("--d", (baseDelay + i * step) + "ms");
      if (reducedMotion.matches) { el.classList.add("is-in"); return; }
      el.classList.add("rv");
      revealIO.observe(el);
    });
  }

  /* ——— الترويسة: ظل رقيق بعد التمرير (مستمع سلبي، تبديل صنف فقط) ——— */
  var header = document.getElementById("site-header");
  if (header) {
    var scrolled = false;
    var onScroll = function () {
      var now = window.scrollY > 8;
      if (now !== scrolled) { scrolled = now; header.classList.toggle("is-scrolled", now); }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  /* ——— الترويسة: قائمة الجوال ——— */
  var navToggle = document.getElementById("nav-toggle");
  var mobileMenu = document.getElementById("mobile-menu");
  on(navToggle, "click", function () {
    var open = mobileMenu.hasAttribute("hidden") === false;
    if (open) {
      mobileMenu.setAttribute("hidden", "");
      navToggle.setAttribute("aria-expanded", "false");
      navToggle.setAttribute("aria-label", "فتح القائمة");
    } else {
      mobileMenu.removeAttribute("hidden");
      navToggle.setAttribute("aria-expanded", "true");
      navToggle.setAttribute("aria-label", "إغلاق القائمة");
    }
  });
  // إغلاق القائمة عند اختيار رابط
  Array.prototype.forEach.call(
    (mobileMenu || {}).querySelectorAll ? mobileMenu.querySelectorAll("a") : [],
    function (a) {
      on(a, "click", function () {
        mobileMenu.setAttribute("hidden", "");
        navToggle.setAttribute("aria-expanded", "false");
      });
    }
  );

  /* ——— 01 الواجهة الافتتاحية ——— */
  // انسياب نص البطل ثم صفوف بطاقة المنتج بتتابع، ثم استقرار خط الفاصل
  var heroText = document.getElementById("hero-text-block");
  var heroCard = document.getElementById("hero-product-card");
  var heroSection = document.getElementById("hero");
  if (heroText && !reducedMotion.matches) {
    heroText.classList.add("rv");
    revealIO.observe(heroText);
  }
  if (heroCard) {
    var rows = heroCard.querySelectorAll(".product-row");
    Array.prototype.forEach.call(rows, function (row, i) {
      row.classList.add("rv");
      row.style.setProperty("--d", (200 + i * 160) + "ms");
      if (reducedMotion.matches) { row.classList.add("is-in"); }
      else { revealIO.observe(row); }
    });
  }
  if (heroSection) {
    if (reducedMotion.matches) { heroSection.classList.add("is-settled"); }
    else {
      new IntersectionObserver(function (entries, io) {
        entries.forEach(function (e) {
          if (e.isIntersecting) {
            heroSection.classList.add("is-settled");
            io.disconnect();
          }
        });
      }, { threshold: 0.3 }).observe(heroSection);
    }
  }

  /* ——— 01-ج اللوك اللاتيني الحي: يولد اسمًا كاملًا، ينبض، يُختصر إلى SOP، ثم يستقر تحت الشعار ——— */
  var latinLine = document.getElementById("latinLine");
  var latinStage = document.getElementById("latinStage");
  if (latinLine && latinStage) {
    var latinWords = latinLine.querySelectorAll(".lw");
    var latinLong = latinLine.querySelectorAll(".lw:not(.lw-a)");
    var latinDone = false;

    // الإزاحة: من خانته تحت الشعار إلى سطر الولادة أسفل العبارة العربية
    function latinShift() {
      var a = latinLine.getBoundingClientRect();
      var b = latinStage.getBoundingClientRect();
      latinLine.style.transform = "translateY(" + Math.round(b.top - a.top) + "px)";
    }

    function latinRun() {
      if (latinDone) return;
      latinDone = true;
      if (reducedMotion.matches) {
        latinLine.classList.add("is-in", "is-condensed", "is-settled");
        return;
      }
      // انتظار اكتمال الاشتقاق العربي (العبارة تستقر نحو ٢٫٢ث)
      setTimeout(function () {
        // انتقل إلى مسرح الولادة قبل أن تُرى (بلا حركة)
        latinLine.style.transition = "none";
        latinShift();
        void latinLine.offsetWidth;
        latinLine.style.transition = "";

        // المشهد ١: الولادة — كلمات تتصاعد بتتابع
        Array.prototype.forEach.call(latinWords, function (w, i) {
          var full = w.querySelector(".lw-full");
          full.style.transitionDelay = (i * 130) + "ms";
        });
        latinLine.classList.add("is-in");

        // المشهد ٢: النبض — كل كلمة طويلة تتنفس مرة بترتيب القراءة
        setTimeout(function () {
          Array.prototype.forEach.call(latinLong, function (w, i) {
            setTimeout(function () { w.classList.add("pulse"); }, i * 170);
          });
        }, 1150);

        // المشهد ٣: الاختصار — تتساقط الأجساد وتثبت الأحرف الأولى
        setTimeout(function () {
          Array.prototype.forEach.call(latinLong, function (w) {
            var full = w.querySelector(".lw-full");
            var ini = w.querySelector(".lw-ini");
            var w0 = w.getBoundingClientRect().width;
            w.style.transition = "none";
            w.style.width = w0 + "px";
            void w.offsetWidth;
            w.style.transition = "";
            full.style.transitionDelay = "0ms";
            w.style.width = ini.getBoundingClientRect().width + "px";
          });
          latinLine.classList.add("is-condensed");
        }, 2150);

        // المشهد ٤: الصعود والاستقرار تحت الشعار — وعند الهبوط تولد النقطة
        setTimeout(function () {
          latinLine.style.transform = "";
          latinLine.classList.add("is-settled");
        }, 3050);
      }, 1300);
    }
    if (document.readyState === "complete") latinRun();
    else on(window, "load", latinRun);

    // إعادة قياس الإزاحة إذا غيّر النافذة حجمها قبل اكتمال المشهد
    window.addEventListener("resize", function () {
      if (latinDone && !latinLine.classList.contains("is-settled")) latinShift();
    });
  }

  /* ——— 01-ب فيلم الهيرو: كشف العنوان + ضبط الحركة المخفَّضة ——— */
  var heroFilm = document.getElementById("film");
  var filmVideo = document.getElementById("film-video");
  if (heroFilm && filmVideo) {
    // العنوان يظهر حين يستقر الفيلم على إطاره الأخير — «والأثر الذي يستقر»
    filmVideo.addEventListener("ended", function () { heroFilm.classList.add("is-on"); });
    if (reducedMotion.matches) {
      // بلا حركة: صورة الغلاف والعنوان فورًا، بلا تشغيل
      heroFilm.classList.add("is-on");
      try { filmVideo.removeAttribute("autoplay"); filmVideo.pause(); } catch (err) {}
    } else {
      // شغّل حين يدخل المشهد الشاشة (لا يعتمد على autoplay وحده)
      new IntersectionObserver(function (entries, io) {
        entries.forEach(function (e) {
          if (e.isIntersecting) {
            var p = filmVideo.play(); if (p && p.catch) { p.catch(function () {}); }
            io.disconnect();
          }
        });
      }, { threshold: 0.35 }).observe(heroFilm);
    }
  }

  /* ——— 02 الدليل أمامك: تبويبات الفحص + دوران الأوجه حول محور واحد ——— */
  var choiceBtns = document.querySelectorAll(".choice-btn");
  var panels = document.querySelectorAll(".panel-content");
  var ivViews = document.getElementById("iv-views");
  var ivMarker = document.getElementById("iv-marker");

  // اتجاه الدوران: التالي يتقدم، السابق يتأخر (RTL: نفس إشارة translateX)
  function btnIndex(btn) {
    return Array.prototype.indexOf.call(choiceBtns, btn);
  }
  function leavePanel(p, dir) {
    p.style.setProperty("--dir", dir);
    p.classList.remove("panel-visible");
    p.classList.add("is-leaving");
    setTimeout(function () {
      p.classList.remove("is-leaving");
    }, 500);
  }
  function enterPanel(p, dir) {
    p.style.setProperty("--dir", dir);
    p.classList.add("is-enter-from");
    void p.offsetWidth; // اربط حالة البداية قبل الانتقال
    p.classList.add("panel-visible");
    p.classList.remove("panel-hidden", "is-enter-from");
  }
  Array.prototype.forEach.call(choiceBtns, function (btn) {
    on(btn, "click", function () {
      var prev = document.querySelector(".choice-btn.choice-active");
      var from = prev ? btnIndex(prev) : 0;
      var to = btnIndex(btn);
      if (from === to) return;
      var dir = to > from ? 1 : -1;

      Array.prototype.forEach.call(choiceBtns, function (b) {
        b.classList.toggle("choice-active", b === btn);
        b.setAttribute("aria-selected", b === btn ? "true" : "false");
      });
      Array.prototype.forEach.call(panels, function (p) {
        var show = p.id === "panel-" + btn.dataset.panel;
        var isShown = p.classList.contains("panel-visible");
        if (show && !isShown) {
          if (reducedMotion.matches) {
            p.classList.add("panel-visible");
            p.classList.remove("panel-hidden");
          } else {
            enterPanel(p, dir);
          }
        } else if (!show && isShown) {
          if (reducedMotion.matches) {
            p.classList.remove("panel-visible");
          } else {
            leavePanel(p, dir);
          }
        }
      });
      if (ivMarker) ivMarker.style.setProperty("--i", String(to));
      document.getElementById("inspect-panel").setAttribute("aria-labelledby", btn.id);
    });
  });

  /* ——— 03 الفجوة التشغيلية: بناء المشهد ——— */
  var gapDiagram = document.getElementById("gap-diagram");
  var gapWrap = document.getElementById("gap-diagram-wrap");
  var gapReplay = document.getElementById("gap-replay-btn");

  function buildGap() {
    if (!gapDiagram) return;
    gapDiagram.classList.remove("is-built");
    if (gapWrap) gapWrap.classList.remove("gap-built");
    void gapDiagram.offsetWidth; // تفريغ حالة الحركة السابقة
    gapDiagram.classList.add("is-built");
    if (gapWrap) gapWrap.classList.add("gap-built");
  }
  if (gapDiagram) {
    if (reducedMotion.matches) {
      gapDiagram.classList.add("is-built");
      if (gapWrap) gapWrap.classList.add("gap-built");
    } else {
      new IntersectionObserver(function (entries, io) {
        entries.forEach(function (e) {
          if (e.isIntersecting) { buildGap(); io.disconnect(); }
        });
      }, { threshold: 0.35 }).observe(gapDiagram);
    }
    on(gapReplay, "click", buildGap);
  }

  /* ——— 05 كيف يعمل: مسار يتصل ——— */
  var howNodes = document.querySelectorAll(".how-node");
  var howConns = document.querySelectorAll(".how-connector");
  // الترتيب: عقدة، وصلة، عقدة… بفاصل 260ms
  Array.prototype.forEach.call(howNodes, function (node, i) {
    if (reducedMotion.matches) { node.classList.add("is-in"); return; }
    new IntersectionObserver(function (entries, io) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          setTimeout(function () { node.classList.add("is-in"); }, i * 520);
          io.disconnect();
        }
      });
    }, { threshold: 0.3 }).observe(node);
  });
  Array.prototype.forEach.call(howConns, function (conn, i) {
    if (reducedMotion.matches) { conn.classList.add("is-in"); return; }
    new IntersectionObserver(function (entries, io) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          setTimeout(function () { conn.classList.add("is-in"); }, 260 + i * 520);
          io.disconnect();
        }
      });
    }, { threshold: 0.3 }).observe(conn);
  });

  /* ——— 06 مواكبة التغيير: قبل/بعد ——— */
  var changeCard = document.getElementById("change-card");
  var changeReplay = document.getElementById("change-replay-btn");
  function buildChange() {
    if (!changeCard) return;
    changeCard.classList.remove("is-built");
    void changeCard.offsetWidth;
    changeCard.classList.add("is-built");
  }
  if (changeCard) {
    if (reducedMotion.matches) { changeCard.classList.add("is-built"); }
    else {
      new IntersectionObserver(function (entries, io) {
        entries.forEach(function (e) {
          if (e.isIntersecting) { buildChange(); io.disconnect(); }
        });
      }, { threshold: 0.35 }).observe(changeCard);
    }
    on(changeReplay, "click", buildChange);
  }

  /* ——— 07 إتقان في إدارتك: تبويبات الأدوار ——— */
  var roleTabs = document.querySelectorAll(".role-tab");
  var roleGroups = document.querySelectorAll(".role-cards");
  Array.prototype.forEach.call(roleTabs, function (tab) {
    on(tab, "click", function () {
      Array.prototype.forEach.call(roleTabs, function (t) {
        t.classList.toggle("role-tab-active", t === tab);
        t.setAttribute("aria-selected", t === tab ? "true" : "false");
      });
      var key = tab.dataset.role;
      var group = document.getElementById("role-cards-" + key);
      Array.prototype.forEach.call(roleGroups, function (g) {
        g.classList.toggle("role-cards-hidden", g !== group);
      });
      if (group) {
        document.getElementById("role-panel").setAttribute("aria-labelledby", tab.id);
        // إعادة بناء البطاقات بتتابع
        var cards = group.querySelectorAll(".role-card");
        Array.prototype.forEach.call(cards, function (c, i) {
          c.classList.remove("is-in");
          void c.offsetWidth;
          c.style.setProperty("--d", (i * 140) + "ms");
          if (reducedMotion.matches) { c.classList.add("is-in"); }
          else { setTimeout(function () { c.classList.add("is-in"); }, 60 + i * 140); }
        });
      }
    });
  });
  // ظهور بطاقات الدور الافتراضي عند التمرير
  Array.prototype.forEach.call(document.querySelectorAll(".role-cards"), function (group) {
    Array.prototype.forEach.call(group.querySelectorAll(".role-card"), function (card, i) {
      card.style.setProperty("--d", (i * 140) + "ms");
      if (reducedMotion.matches) { card.classList.add("is-in"); }
      else { revealIO.observe(card); }
    });
  });

  /* ——— 08 الاستعداد للتدقيق: النظام «يكتب» كل صف ثم يثبّته ——— */
  Array.prototype.forEach.call(document.querySelectorAll(".audit-row"), function (row, i) {
    row.style.setProperty("--d", (i * 120) + "ms");
    if (reducedMotion.matches) { row.classList.add("is-in"); return; }
    new IntersectionObserver(function (entries, io) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          setTimeout(function () {
            row.classList.add("is-writing");
            setTimeout(function () {
              row.classList.remove("is-writing");
              row.classList.add("is-in");
            }, 650);
          }, i * 380);
          io.disconnect();
        }
      });
    }, { threshold: 0.4 }).observe(row);
  });

  /* ——— أقسام عامة: مقدمات الأقسام والأعمدة النصية وأعمدة الأثر ——— */
  // مقدمة الافتتاحية تُدار أعلاه عبر #hero-text-block
  watch(".section-intro, .gap-intro, .change-text, .audit-text", 0, 0);
  watch(".impact-card", 80, 140);

  /* ——— 10 أسئلة القرار ——— */
  Array.prototype.forEach.call(document.querySelectorAll(".faq-question"), function (q) {
    on(q, "click", function () {
      var expanded = q.getAttribute("aria-expanded") === "true";
      var answer = document.getElementById(q.getAttribute("aria-controls"));
      q.setAttribute("aria-expanded", expanded ? "false" : "true");
      if (answer) {
        if (expanded) { answer.setAttribute("hidden", ""); }
        else { answer.removeAttribute("hidden"); }
      }
    });
  });

  /* ——— 11 حجز العرض: تحقق محلي ——— */
  var form = document.getElementById("booking-form");
  var status = document.getElementById("bf-status");
  on(form, "submit", function (e) {
    e.preventDefault();
    if (!form || !status) return;
    var valid = form.checkValidity();
    status.removeAttribute("hidden");
    if (!valid) {
      status.textContent = "أكمل الحقول الإلزامية المعلّمة بـ * ثم أعد الإرسال.";
      form.reportValidity && form.reportValidity();
      return;
    }
    // لا مسار إرسال فعلي بعد — رسالة محلية صريحة
    status.textContent = "تم استلام طلبك محليًا في هذه النسخة التجريبية — لم يُرسل بعد. سنوصل النموذج ببريد الطلبات عند اعتماد المسار.";
    form.reset();
  });

  /* ——— 12 التذييل: السنة ——— */
  var year = document.getElementById("footer-year");
  if (year) year.textContent = String(new Date().getFullYear());

  /* ============================================================
     محاكاة الالتقاط في الافتتاحية: إتقان يسجّل داخل نافذة مصغّرة
     مؤشر يتحرك → نقرة → علامة هدف تُرسَم → لقطة تطير إلى الخطوة
     ============================================================ */
  var capWindow = document.getElementById("cap-window");
  var capApp = document.getElementById("cap-app");
  var capCursor = document.getElementById("cap-cursor");
  var capMark = document.getElementById("cap-mark");
  var capFlash = document.getElementById("cap-flash");
  var capClick = document.getElementById("cap-click");
  var capShot = document.getElementById("cap-shot");
  var capCount = document.getElementById("cap-count");
  var capDone = document.getElementById("cap-done");
  var capReplay = document.getElementById("cap-replay-btn");
  var capSteps = document.querySelectorAll("#cap-steps .cap-step");
  var capBtns = [document.getElementById("cap-btn-1"),
                 document.getElementById("cap-btn-2"),
                 document.getElementById("cap-btn-3")];

  function capWait(ms) { return new Promise(function (res) { setTimeout(res, ms); }); }

  // مركز عنصر بإحداثيات cap-app
  function capCenter(el) {
    var a = capApp.getBoundingClientRect();
    var b = el.getBoundingClientRect();
    return { x: b.left + b.width / 2 - a.left, y: b.top + b.height / 2 - a.top,
             rect: { left: b.left - a.left, top: b.top - a.top, w: b.width, h: b.height } };
  }

  function capSetVars(el, p) {
    el.style.setProperty("--x", p.x + "px");
    el.style.setProperty("--y", p.y + "px");
  }

  // نقرة واحدة كاملة: تحرك → ضغط → حلقة → علامة → وميض → طيران → خطوة
  function capClickStep(i) {
    return capWait(0).then(function () {
      var btn = capBtns[i];
      if (!btn) return;
      var c = capCenter(btn);

      // 1) المؤشر يتحرك إلى الزر (انتقال 900ms في CSS)
      capCursor.classList.add("is-on");
      capCursor.classList.remove("is-press");
      capSetVars(capCursor, c);
      return capWait(950).then(function () {

        // 2) ضغط المؤشر + انضغاط الزر
        capCursor.classList.add("is-press");
        btn.classList.add("is-pressed");
        capSetVars(capClick, c);
        capClick.classList.remove("is-on");
        void capClick.offsetWidth;
        capClick.classList.add("is-on");

        // 3) علامة الهدف تُرسَم حول الزر
        capMark.classList.remove("is-on");
        capMark.style.left = (c.rect.left - 5) + "px";
        capMark.style.top = (c.rect.top - 5) + "px";
        capMark.setAttribute("width", c.rect.w + 10);
        capMark.setAttribute("height", c.rect.h + 10);
        capMark.style.width = (c.rect.w + 10) + "px";
        capMark.style.height = (c.rect.h + 10) + "px";
        void capMark.getBoundingClientRect();
        capMark.classList.add("is-on");

        // 4) وميض الالتقاط
        capFlash.classList.add("is-on");
        return capWait(140).then(function () {
          capFlash.classList.remove("is-on");

          // 5) اللقطة تنبثق ثم تطير إلى مصغّرة الخطوة
          capShot.classList.remove("is-fly");
          capShot.classList.add("is-on");
          return capWait(240).then(function () {
            var step = capSteps[i];
            var thumb = step ? step.querySelector(".cap-thumb") : null;
            if (thumb) {
              var a = capApp.getBoundingClientRect();
              var t = thumb.getBoundingClientRect();
              var tx = (t.left + t.width / 2) - a.left - a.width / 2;
              var ty = (t.top + t.height / 2) - a.top - a.height / 2;
              capShot.style.setProperty("--tx", tx + "px");
              capShot.style.setProperty("--ty", ty + "px");
              capShot.style.setProperty("--sx", (t.width / a.width).toFixed(3));
              capShot.style.setProperty("--sy", (t.height / a.height).toFixed(3));
            }
            capShot.classList.add("is-fly");

            // 6) الخطوة تستقر في القائمة والعداد يتقدم
            return capWait(420).then(function () {
              if (step) {
                step.classList.add("is-in", "is-new");
                setTimeout(function () { step.classList.remove("is-new"); }, 700);
              }
              if (capCount) capCount.textContent = (i + 1) + " / " + capSteps.length;
              btn.classList.remove("is-pressed");
              capCursor.classList.remove("is-press");
              return capWait(650);
            });
          });
        });
      });
    });
  }

  function capReset() {
    capWindow.classList.remove("is-done");
    capDone.classList.remove("is-in");
    capCursor.classList.remove("is-on", "is-press");
    capMark.classList.remove("is-on");
    capFlash.classList.remove("is-on");
    capClick.classList.remove("is-on");
    capShot.classList.remove("is-on", "is-fly");
    Array.prototype.forEach.call(capSteps, function (s) { s.classList.remove("is-in", "is-new"); });
    if (capCount) capCount.textContent = "0 / " + capSteps.length;
    void capWindow.offsetWidth;
  }

  function capRun() {
    if (!capWindow || capWindow.dataset.running === "1") return;
    capWindow.dataset.running = "1";
    capReset();
    if (reducedMotion.matches) {
      // الحالة النهائية الثابتة: الدليل جاهز بثلاث خطوات
      Array.prototype.forEach.call(capSteps, function (s) { s.classList.add("is-in"); });
      if (capCount) capCount.textContent = capSteps.length + " / " + capSteps.length;
      capWindow.classList.add("is-done");
      capDone.classList.add("is-in");
      capWindow.dataset.running = "0";
      return;
    }
    var chain = Promise.resolve();
    Array.prototype.forEach.call(capBtns, function (_, i) {
      chain = chain.then(function () { return capClickStep(i); });
    });
    chain = chain.then(function () {
      return capWait(300).then(function () {
        capWindow.classList.add("is-done");   // «حُفظ الدليل»
        capDone.classList.add("is-in");       // «الدليل جاهز · 3 خطوات»
        capCursor.classList.remove("is-on");
        capMark.classList.remove("is-on");
      });
    });
    chain.then(function () { capWindow.dataset.running = "0"; });
  }

  if (capWindow && capApp) {
    if (reducedMotion.matches) {
      capRun(); // حالة نهائية ثابتة بلا حركة
    } else {
      // تعمل أول مرة عند ظهورها، وتُعاد بلطف عند كل عودة إليها بالتمرير
      new IntersectionObserver(function (entries, io) {
        entries.forEach(function (e) {
          if (e.isIntersecting) {
            capRun();
            io.disconnect();
          }
        });
      }, { threshold: 0.45 }).observe(capWindow);
      new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting && capWindow.dataset.done === "1") { capRun(); }
          else if (!e.isIntersecting && capWindow.classList.contains("is-done")) {
            capWindow.dataset.done = "1";
          }
        });
      }, { threshold: 0.45 }).observe(capWindow);
    }
    on(capReplay, "click", capRun);
  }
})();
