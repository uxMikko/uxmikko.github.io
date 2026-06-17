(function () {
  'use strict';

  var title = (document.currentScript && document.currentScript.dataset.title) || 'Ask me anything';

  // Case study pages get the re-engagement nudge; homepage does not
  var isCase = /\b(basf|gensam|fass|ltn|riksbyggen|svebar)\b/.test(document.body.className);

  if (isCase) {
    document.body.insertAdjacentHTML('beforeend',
      '<div id="reengagement" role="dialog" inert>' +
        '<div class="reengagement-card">' +
          '<button class="reengagement-close" aria-label="Dismiss">' +
            '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>' +
          '</button>' +
          '<p class="reengagement-heading">Got unanswered questions?</p>' +
          '<p class="reengagement-body">I&#39;m happy to dig into anything you&#39;re curious about from this project.</p>' +
          '<div class="reengagement-actions">' +
            '<button class="reengagement-chat btn-primary">Ask in chat</button>' +
            '<a href="#contact" class="reengagement-no btn-secondary">Leave a note</a>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  document.body.insertAdjacentHTML('beforeend',
    '<button id="mkkchat-btn" aria-label="Chat with Mikko\'s assistant">' +
      '<svg width="24" height="24" viewBox="0 0 24 24" fill="none">' +
        '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
      '</svg>' +
    '</button>' +
    '<div id="mkkchat-window" role="dialog" aria-label="Chat">' +
      '<div id="mkkchat-header">' +
        '<img id="mkkchat-avatar" src="/img/profile/memoji.png" alt="Mikko">' +
        '<p id="mkkchat-title"></p>' +
        '<span id="mkkchat-admin-badge">ADMIN</span>' +
        '<button id="mkkchat-close" aria-label="Minimise chat">' +
          '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M5 8l5 5 5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
        '</button>' +
      '</div>' +
      '<div id="mkkchat-msgs">' +
        '<div id="mkkchat-disclosure">' +
          '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" style="flex-shrink:0;margin-top:1px;"><circle cx="7" cy="7" r="6" stroke="#b08000" stroke-width="1.2"/><path d="M7 6v3.5M7 4v.5" stroke="#b08000" stroke-width="1.2" stroke-linecap="round"/></svg>' +
          '<span>Questions are logged so Mikko can review and improve answers. Nothing personal is stored beyond what you type.</span>' +
        '</div>' +
        '<div id="mkkchat-typing">' +
          '<span class="mkkchat-dot"></span>' +
          '<span class="mkkchat-dot"></span>' +
          '<span class="mkkchat-dot"></span>' +
        '</div>' +
      '</div>' +
      '<div id="mkkchat-foot">' +
        '<input id="mkkchat-input" type="text" placeholder="Ask something…" autocomplete="off" maxlength="500">' +
        '<button id="mkkchat-send" aria-label="Send">' +
          '<svg width="15" height="15" viewBox="0 0 15 15" fill="none"><path d="M13.5 1.5l-12 5 4.5 1.5 1.5 4.5 6-11z" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
        '</button>' +
      '</div>' +
      '<button id="mkkchat-end">End chat</button>' +
      '<div id="mkkchat-confirm">' +
        '<p id="mkkchat-confirm-heading">End this chat?</p>' +
        '<p id="mkkchat-confirm-body">This will clear your conversation history and can\'t be undone.</p>' +
        '<div id="mkkchat-confirm-btns">' +
          '<button id="mkkchat-confirm-no">Keep chatting</button>' +
          '<button id="mkkchat-confirm-yes">End chat</button>' +
        '</div>' +
      '</div>' +
    '</div>'
  );

  document.getElementById('mkkchat-title').textContent = title;

  // ── Chatbot behaviour ────────────────────────────────────────────────────────
  (function () {
    var btn        = document.getElementById('mkkchat-btn');
    var win        = document.getElementById('mkkchat-window');
    var cls        = document.getElementById('mkkchat-close');
    var msgs       = document.getElementById('mkkchat-msgs');
    var typing     = document.getElementById('mkkchat-typing');
    var input      = document.getElementById('mkkchat-input');
    var send       = document.getElementById('mkkchat-send');
    var endBtn     = document.getElementById('mkkchat-end');
    var confirmEl  = document.getElementById('mkkchat-confirm');
    var confirmYes = document.getElementById('mkkchat-confirm-yes');
    var confirmNo  = document.getElementById('mkkchat-confirm-no');

    var HKEY    = 'mkkChat_h';
    var OKEY    = 'mkkChat_o';
    var history = (function () { try { return JSON.parse(localStorage.getItem(HKEY) || '[]'); } catch (e) { return []; } })();
    var busy    = false;
    var opened  = false;
    var adminKey = null;
    var currentPollId = 0;

    function save() {
      localStorage.setItem(HKEY, JSON.stringify(history));
      localStorage.setItem(OKEY, win.classList.contains('open') ? '1' : '0');
    }
    window.addEventListener('beforeunload', save);
    document.addEventListener('click', function (e) {
      var a = e.target.closest('a[href]');
      if (a && a.hostname === location.hostname && a.target !== '_blank') save();
    }, true);

    // GitHub Pages — redirect prompt
    if (location.hostname === 'uxmikko.github.io') {
      btn.addEventListener('click', function () {
        win.classList.add('open');
        setTimeout(function () {
          var p = document.createElement('div');
          p.className = 'mkkchat-msg bot';
          p.style.cssText = 'display:flex;flex-direction:column;gap:10px;';
          var t = document.createElement('span');
          t.textContent = "Want to chat? I'll need to take you to the newer version of this site.";
          p.appendChild(t);
          var row = document.createElement('div');
          row.style.cssText = 'display:flex;gap:8px;';
          var yes = document.createElement('button');
          yes.textContent = "Yes, let's go";
          yes.style.cssText = 'padding:6px 14px;border-radius:20px;border:none;background:#3A6B12;color:white;font-family:Inter,sans-serif;font-size:13px;font-weight:500;cursor:pointer;';
          var no = document.createElement('button');
          no.textContent = 'No thanks';
          no.style.cssText = 'padding:6px 14px;border-radius:20px;border:1px solid #ddd;background:white;color:#555;font-family:Inter,sans-serif;font-size:13px;font-weight:500;cursor:pointer;';
          yes.addEventListener('click', function () {
            yes.disabled = no.disabled = true;
            yes.textContent = 'On my way ✌️';
            setTimeout(function () { location.href = 'https://uxmikko.com/?chat=open'; }, 800);
          });
          no.addEventListener('click', function () {
            yes.disabled = no.disabled = true;
            row.remove();
            var bye = document.createElement('span');
            bye.textContent = 'No worries — feel free to browse the case studies 👋';
            p.appendChild(bye);
          });
          row.appendChild(yes);
          row.appendChild(no);
          p.appendChild(row);
          msgs.insertBefore(p, typing);
          msgs.scrollTop = msgs.scrollHeight;
        }, 600);
      });
      return;
    }

    function addMsg(role, text) {
      var el = document.createElement('div');
      el.className = 'mkkchat-msg ' + role;
      var linkedinCards = [];
      var caseStudyCards = [];
      if (role === 'bot') {
        text.split(/(\[[^\]]+\]\([^)]+\))/).forEach(function (part) {
          var m = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
          if (m) {
            if (m[2].indexOf('linkedin.com') !== -1) {
              linkedinCards.push(m);
            } else if (
              (m[2].match(/^\/[a-z]/) || m[2].match(/uxmikko\.(netlify\.app|github\.io|com)\//)) &&
              m[2].indexOf('?q=') === -1 && m[2].indexOf('#contact') === -1 && !m[2].match(/\/contact\/?$/)
            ) {
              caseStudyCards.push(m);
            } else {
              var a = document.createElement('a');
              a.className = 'mkkchat-inline-link';
              a.textContent = m[1];
              if (m[2].indexOf('?q=') !== -1 || m[2].indexOf('#contact') !== -1 || m[2].match(/\/contact\/?$/)) {
                a.href = '#contact';
                (function (url) {
                  a.addEventListener('click', function (e) {
                    e.preventDefault();
                    var qm = url.match(/[?&]q=([^&#]*)/);
                    if (qm) {
                      var ta = document.getElementById('message');
                      if (ta) { ta.value = decodeURIComponent(qm[1].replace(/\+/g, ' ')); setTimeout(function () { ta.focus(); }, 400); }
                    }
                    var cf = document.getElementById('contact');
                    if (cf) cf.scrollIntoView({ behavior: 'smooth' });
                    win.classList.remove('open');
                    save();
                  });
                })(m[2]);
              } else {
                a.href = m[2];
                a.target = '_blank';
                a.rel = 'noopener';
              }
              el.appendChild(document.createElement('br'));
              el.appendChild(a);
            }
          } else {
            el.appendChild(document.createTextNode(part));
          }
        });
      } else {
        el.textContent = text;
      }
      if (el.textContent.trim().length > 0) msgs.insertBefore(el, typing);

      linkedinCards.forEach(function (m) {
        var card = document.createElement('div');
        card.className = 'mkkchat-msg bot';
        var a = document.createElement('a');
        a.className = 'mkkchat-linkedin';
        a.href = m[2].startsWith('http') ? m[2] : 'https://' + m[2];
        a.target = '_blank';
        a.rel = 'noopener';
        var icon = document.createElement('span');
        icon.className = 'mkkchat-li-icon';
        icon.textContent = 'in';
        var raw = m[1].indexOf('linkedin.com') !== -1 ? 'LinkedIn Profile' : m[1];
        var pts = raw.split(' — ');
        var info = document.createElement('span');
        info.className = 'mkkchat-card-info';
        var name = document.createElement('span');
        name.className = 'mkkchat-card-name mkkchat-li-name';
        name.textContent = pts[0];
        info.appendChild(name);
        if (pts[1]) {
          var sub = document.createElement('span');
          sub.className = 'mkkchat-card-sub';
          sub.textContent = pts[1];
          info.appendChild(sub);
        }
        a.appendChild(icon);
        a.appendChild(info);
        card.appendChild(a);
        msgs.insertBefore(card, typing);
      });

      caseStudyCards.forEach(function (m) {
        var card = document.createElement('div');
        card.className = 'mkkchat-msg bot';
        var a = document.createElement('a');
        a.className = 'mkkchat-casestudy';
        var href = m[2];
        if (href.match(/uxmikko\.(netlify\.app|github\.io|com)/)) { try { href = new URL(href).pathname; } catch (e) {} }
        a.href = href;
        var icon = document.createElement('span');
        icon.className = 'mkkchat-cs-icon';
        icon.textContent = '→';
        var pts = m[1].split(' — ');
        var info = document.createElement('span');
        info.className = 'mkkchat-card-info';
        var name = document.createElement('span');
        name.className = 'mkkchat-card-name mkkchat-cs-name';
        name.textContent = pts[0];
        info.appendChild(name);
        if (pts[1]) {
          var sub = document.createElement('span');
          sub.className = 'mkkchat-card-sub';
          sub.textContent = pts[1];
          info.appendChild(sub);
        }
        a.appendChild(icon);
        a.appendChild(info);
        card.appendChild(a);
        msgs.insertBefore(card, typing);
      });

      msgs.scrollTop = msgs.scrollHeight;
      return el;
    }

    function startPolling(sessionId) {
      var myId = ++currentPollId;
      var attempts = 0;
      function poll() {
        if (myId !== currentPollId) return;
        if (attempts >= 40) {
          addMsg('bot', "I haven't heard back yet — [send me the question directly →](/#contact) and I'll get back to you.");
          return;
        }
        attempts++;
        fetch('/.netlify/functions/check-reply?sessionId=' + sessionId)
          .then(function (r) { return r.json(); })
          .then(function (d) {
            if (myId !== currentPollId) return;
            if (d.answered && d.reply) {
              addMsg('bot', d.reply);
              history.push({ role: 'assistant', content: d.reply });
              save();
            } else { setTimeout(poll, 3000); }
          })
          .catch(function () { if (myId === currentPollId) setTimeout(poll, 3000); });
      }
      setTimeout(poll, 3000);
    }

    function setTyping(on) { typing.className = on ? 'show' : ''; if (on) msgs.scrollTop = msgs.scrollHeight; }
    function setBusy(on)   { busy = on; send.disabled = on; input.disabled = on; }

    if (localStorage.getItem(OKEY) === '1') {
      win.classList.add('open');
      if (window.innerWidth <= 640) btn.style.display = 'none';
      openChat();
    }

    function openChat() {
      if (!opened) {
        opened = true;
        if (history.length) {
          history.forEach(function (m) { if (m && m.content) addMsg(m.role === 'assistant' ? 'bot' : 'user', m.content); });
          setTimeout(function () { msgs.scrollTop = msgs.scrollHeight; }, 80);
        } else {
          setTimeout(function () {
            addMsg('bot', "Hey 👋 I'm Mikko — or a pretty good AI version of me. Ask me anything about my work, experience, or what I'm looking for.");
          }, 240);
        }
      }
    }

    async function submit() {
      var text = input.value.trim();
      if (!text || busy) return;
      currentPollId++;
      input.value = '';
      setBusy(true);
      var origText = text;

      if (text.toLowerCase().startsWith('admin ')) {
        var k = text.slice(6).trim();
        setTyping(true);
        try {
          var ar = await fetch('/.netlify/functions/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ authAttempt: true, adminKey: k }) });
          var ad = await ar.json();
          if (ad.authenticated) { adminKey = k; document.getElementById('mkkchat-admin-badge').style.display = 'inline'; }
          setTyping(false);
          addMsg('bot', ad.reply);
        } catch (e) { setTyping(false); addMsg('bot', 'Connection error.'); }
        setBusy(false);
        input.focus();
        return;
      }

      if (adminKey && text.startsWith('No. ')) {
        addMsg('user', text);
        setTyping(true);
        try {
          var cr = await fetch('/.netlify/functions/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: text, adminKey: adminKey }) });
          var cd = await cr.json();
          setTyping(false);
          addMsg('bot', cd.reply);
        } catch (e) { setTyping(false); addMsg('bot', 'Error saving.'); }
        setBusy(false);
        input.focus();
        return;
      }

      addMsg('user', text);
      setTyping(true);
      try {
        var t0 = Date.now();
        var res = await fetch('/.netlify/functions/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: text, history: history, page: location.pathname }) });
        var data = await res.json();
        var reply = data.reply || 'Something went wrong — please try again.';
        var parts = reply.split(/\n\n+/).map(function (p) { return p.trim(); }).filter(Boolean);
        if (!parts.length) parts = [reply];
        var natural = Math.min(Math.max(parts[0].length * 40, 800), 8000);
        var wait = Math.max(0, natural - (Date.now() - t0));
        if (wait > 0) await new Promise(function (r) { setTimeout(r, wait); });
        setTyping(false);
        addMsg('bot', parts[0]);
        for (var pi = 1; pi < parts.length; pi++) {
          setTyping(true);
          var partDelay = Math.min(Math.max(parts[pi].length * 40, 600), 5000);
          await new Promise(function (r) { setTimeout(r, partDelay); });
          setTyping(false);
          addMsg('bot', parts[pi]);
        }
        history.push({ role: 'user', content: origText });
        history.push({ role: 'assistant', content: reply });
        save();
        if (data.sessionId) startPolling(data.sessionId);
      } catch (e) {
        setTyping(false);
        addMsg('bot', 'Connection error — please email uxmikko@gmail.com.');
      }
      setBusy(false);
      input.focus();
    }

    btn.addEventListener('click', function () {
      var isOpen = win.classList.toggle('open');
      if (isOpen) {
        if (window.innerWidth <= 640) btn.style.display = 'none';
        openChat();
        setTimeout(function () { input.focus(); }, 50);
      } else {
        btn.style.display = '';
      }
      save();
    });
    cls.addEventListener('click', function () { win.classList.remove('open'); btn.style.display = ''; save(); });
    endBtn.addEventListener('click', function () { confirmEl.classList.add('show'); });
    confirmNo.addEventListener('click', function () { confirmEl.classList.remove('show'); });
    confirmYes.addEventListener('click', function () {
      confirmEl.classList.remove('show');
      addMsg('bot', 'Bye! Come back any time. 👋');
      setTimeout(function () {
        history = []; adminKey = null; currentPollId++; opened = false;
        localStorage.removeItem(HKEY);
        localStorage.setItem(OKEY, '0');
        Array.from(msgs.querySelectorAll('.mkkchat-msg')).forEach(function (el) { el.remove(); });
        win.classList.remove('open');
        btn.style.display = '';
      }, 1200);
    });
    send.addEventListener('click', submit);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && win.classList.contains('open')) { win.classList.remove('open'); btn.style.display = ''; } });

    if (new URLSearchParams(location.search).get('chat') === 'open') {
      setTimeout(function () { btn.click(); }, 400);
    }
  })();

  // ── Re-engagement nudge (case study pages only) ──────────────────────────────
  if (isCase) {
    (function () {
      if (sessionStorage.getItem('mkk_reengaged')) return;
      var maxPct = 0, triggered = false, formTouched = false;
      var form = document.querySelector('.contact-form');
      if (form) form.addEventListener('focusin', function () { formTouched = true; }, true);
      window.addEventListener('scroll', function () {
        var h = document.documentElement.scrollHeight;
        var pct = (window.scrollY + window.innerHeight) / h;
        if (pct > maxPct) maxPct = pct;
        if (!triggered && !formTouched && maxPct >= 0.82) {
          var dropped = maxPct * h - window.innerHeight - window.scrollY;
          if (dropped > 350) {
            triggered = true;
            sessionStorage.setItem('mkk_reengaged', '1');
            var m = document.getElementById('reengagement');
            if (m) { m.removeAttribute('inert'); m.classList.add('show'); }
          }
        }
      }, { passive: true });
      function initModal() {
        var m = document.getElementById('reengagement');
        if (!m) return;
        function close() { m.classList.remove('show'); m.setAttribute('inert', ''); }
        m.querySelector('.reengagement-chat').addEventListener('click', function () {
          close();
          var chatBtn = document.getElementById('mkkchat-btn');
          if (chatBtn) chatBtn.click();
        });
        m.querySelector('.reengagement-no').addEventListener('click', close);
        m.querySelector('.reengagement-close').addEventListener('click', close);
        m.addEventListener('click', function (e) { if (e.target === m) close(); });
      }
      if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', initModal); }
      else { initModal(); }
    })();
  }

})();
