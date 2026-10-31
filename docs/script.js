// Fade-in delle sezioni quando entrano nel viewport.
// Una sezione visibile attiva anche quelle sopra, saltate con uno scroll veloce
// o con un link interno (es. "#guide").
document.addEventListener('DOMContentLoaded', () => {
  const elements = [...document.querySelectorAll('.scroll-element')];

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const last = elements.indexOf(entry.target);
        elements.slice(0, last + 1).forEach((el) => {
          el.classList.add('scrolled');
          observer.unobserve(el);
        });
      });
    },
    { rootMargin: '0px 0px -13% 0px' },
  );

  elements.forEach((el) => observer.observe(el));
});
