/*
 * Site chrome — mobile nav toggle + active-link marker. Vanilla, no deps.
 * Kept small on purpose (static site).
 */
(function () {
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.querySelector('nav.primary');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      nav.classList.toggle('open');
    });
  }
  var path = location.pathname.replace(/\/$/, '').split('/').pop() || 'index.html';
  var links = document.querySelectorAll('nav.primary a[href]');
  for (var i = 0; i < links.length; i++) {
    var href = links[i].getAttribute('href');
    if (!href) continue;
    var leaf = href.replace(/\/$/, '').split('/').pop();
    if (leaf === path) links[i].classList.add('active');
  }
})();
