(function () {
  var thisScript = document.currentScript;
  var gaId = thisScript && thisScript.getAttribute('data-ga-id');
  if (!gaId) return;

  var STORAGE_KEY = 'ga-consent';

  function loadGA() {
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + gaId;
    document.head.appendChild(s);

    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
    gtag('js', new Date());
    gtag('config', gaId);
  }

  var consent = null;
  try { consent = localStorage.getItem(STORAGE_KEY); } catch (e) {}

  if (consent === 'granted') { loadGA(); return; }
  if (consent === 'denied') return;

  function injectStyles() {
    if (document.getElementById('cc-styles')) return;
    var style = document.createElement('style');
    style.id = 'cc-styles';
    style.textContent =
      '#cc-accept{transition:background 0.15s, transform 0.1s;}' +
      '#cc-accept:hover{background:color-mix(in srgb, var(--white) 88%, var(--text-1));}' +
      '#cc-accept:active{transform:scale(0.97);}' +
      '#cc-decline{transition:background 0.15s, transform 0.1s;}' +
      '#cc-decline:hover{background:color-mix(in srgb, var(--white) 14%, transparent);}' +
      '#cc-decline:active{transform:scale(0.97);}';
    document.head.appendChild(style);
  }

  function showBanner() {
    injectStyles();

    var bar = document.createElement('div');
    bar.id = 'cookie-consent';
    bar.style.cssText = [
      'position:fixed', 'bottom:24px', 'left:24px', 'z-index:9998',
      'width:calc(100% - 48px)', 'max-width:360px',
      'background:var(--text-1)', 'border:1px solid color-mix(in srgb, var(--white) 16%, transparent)',
      'border-radius:16px', 'box-shadow:var(--shadow-card)',
      'padding:18px 20px', 'display:flex', 'flex-direction:column', 'gap:14px',
      "font-family:'Inter', sans-serif",
      'opacity:0', 'transform:translateY(16px)',
      'transition:all 0.4s cubic-bezier(0.22,1,0.36,1)'
    ].join(';');

    bar.innerHTML =
      '<p style="margin:0;font-size:14px;line-height:1.5;color:color-mix(in srgb, var(--white) 78%, transparent);">' +
        'This site uses analytics cookies to understand how it’s used. No personal data is sold or shared.' +
      '</p>' +
      '<div style="display:flex;gap:8px;">' +
        '<button id="cc-decline" style="flex:1;height:36px;padding:0 16px;border-radius:8px;border:1px solid color-mix(in srgb, var(--white) 35%, transparent);background:transparent;color:var(--white);font-size:14px;font-family:var(--font-display);font-weight:500;cursor:pointer;">Decline</button>' +
        '<button id="cc-accept" style="flex:1;height:36px;padding:0 16px;border-radius:8px;border:none;background:var(--white);color:var(--text-1);font-size:14px;font-family:var(--font-display);font-weight:500;cursor:pointer;">Accept</button>' +
      '</div>';

    document.body.appendChild(bar);
    requestAnimationFrame(function () {
      bar.style.opacity = '1';
      bar.style.transform = 'translateY(0)';
    });

    function hide() {
      bar.style.opacity = '0';
      bar.style.transform = 'translateY(16px)';
      setTimeout(function () { bar.remove(); }, 400);
    }

    document.getElementById('cc-accept').addEventListener('click', function () {
      try { localStorage.setItem(STORAGE_KEY, 'granted'); } catch (e) {}
      hide();
      loadGA();
    });
    document.getElementById('cc-decline').addEventListener('click', function () {
      try { localStorage.setItem(STORAGE_KEY, 'denied'); } catch (e) {}
      hide();
    });
  }

  if (document.body) {
    showBanner();
  } else {
    document.addEventListener('DOMContentLoaded', showBanner);
  }
})();
