/** Copy buttons on documentation code blocks */
document.querySelectorAll('.code-copy').forEach((btn) => {
  btn.addEventListener('click', () => {
    const pre = btn.closest('.code-block')?.querySelector('pre');
    if (!pre) return;
    navigator.clipboard.writeText(pre.textContent || '').catch(() => {});
    const label = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = label; }, 1500);
  });
});

/** Highlight active TOC link on scroll */
(function () {
  const links = document.querySelectorAll('.docs-sidebar a[href^="#"]');
  if (!links.length) return;

  const sections = Array.from(links).map((a) => {
    const id = a.getAttribute('href')?.slice(1);
    return { link: a, el: id ? document.getElementById(id) : null };
  }).filter((x) => x.el);

  const onScroll = () => {
    let current = sections[0];
    for (const s of sections) {
      if (s.el && s.el.getBoundingClientRect().top <= 120) current = s;
    }
    links.forEach((l) => l.classList.remove('active'));
    current?.link.classList.add('active');
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
})();
