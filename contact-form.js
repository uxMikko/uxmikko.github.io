(function () {
  'use strict';

  var re = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  // Blur validators — only format errors, never "required"
  function blurEmail(v) {
    v = v.trim();
    if (!v) return '';
    return re.test(v) ? '' : 'Please enter a valid email address.';
  }

  // Submit validators — required + format
  function submitName(v)  { return v.trim() ? '' : 'Please enter your name.'; }
  function submitMsg(v)   { return v.trim() ? '' : 'Please enter a message.'; }
  function submitEmail(v) {
    v = v.trim();
    if (!v) return 'Please enter your email address.';
    return re.test(v) ? '' : 'Please enter a valid email address.';
  }

  function validate(el, checker) {
    var msg  = checker(el.value);
    var grp  = el.closest('.form-group');
    var span = grp ? grp.querySelector('.form-error') : null;
    el.classList.toggle('error', !!msg);
    if (span) span.textContent = msg;
    return !msg;
  }

  function showToast() {
    var t = document.getElementById('toast');
    if (!t) return;
    t.style.opacity   = '1';
    t.style.transform = 'translateX(-50%) translateY(0)';
    setTimeout(function() {
      t.style.opacity   = '0';
      t.style.transform = 'translateX(-50%) translateY(80px)';
    }, 4000);
  }

  function initForm(form) {
    var nameEl    = form.querySelector('[name="name"]');
    var emailEl   = form.querySelector('[name="email"]');
    var msgEl     = form.querySelector('[name="message"]');
    var submitErr = form.querySelector('.form-submit-error');

    var fields = [
      { el: nameEl,  blur: null,      submit: submitName  },
      { el: emailEl, blur: blurEmail, submit: submitEmail },
      { el: msgEl,   blur: null,      submit: submitMsg   },
    ];

    fields.forEach(function(f) {
      if (!f.el) return;
      // blur: format-only check (no "required" errors on leaving an empty field)
      if (f.blur) f.el.addEventListener('blur', function() { validate(f.el, f.blur); });
      f.el.addEventListener('input', function() {
        if (!f.el.value.trim()) {
          f.el.classList.remove('error');
          var grp = f.el.closest('.form-group');
          var span = grp ? grp.querySelector('.form-error') : null;
          if (span) span.textContent = '';
        } else if (f.el.classList.contains('error')) {
          validate(f.el, f.submit);
        }
      });
    });

    form.addEventListener('submit', async function (e) {
      e.preventDefault();

      var ok = fields.every(function(f) { return !f.el || validate(f.el, f.submit); });
      if (!ok) return;

      var btn = form.querySelector('.form-submit');
      if (submitErr) submitErr.textContent = '';
      btn.textContent = 'Sending…';
      btn.disabled    = true;

      try {
        var res = await fetch('https://formspree.io/f/xykngwry', {
          method:  'POST',
          body:    new FormData(form),
          headers: { 'Accept': 'application/json' },
        });
        if (!res.ok) throw new Error();
        form.reset();
        form.querySelectorAll('.form-error').forEach(function(s) { s.textContent = ''; });
        form.querySelectorAll('.error').forEach(function(el) { el.classList.remove('error'); });
        showToast();
      } catch (err) {
        if (submitErr) submitErr.textContent = 'Something went wrong — please email me directly.';
      } finally {
        btn.textContent = 'Send message';
        btn.disabled    = false;
      }
    });
  }

  document.querySelectorAll('form.footer-form').forEach(initForm);

  // Prefill message from ?q= (used by the chat "leave a note" handoff)
  (function () {
    var params = new URLSearchParams(window.location.search);
    var q = params.get('q');
    if (!q) return;
    var textarea = document.querySelector('form.footer-form [name="message"]');
    if (!textarea) return;
    textarea.value = q;
    var contact = document.getElementById('contact');
    if (contact) contact.scrollIntoView({ behavior: 'smooth' });
    setTimeout(function () { textarea.focus(); }, 500);
  })();
})();
