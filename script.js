const header = document.querySelector('.site-header');
const navToggle = document.getElementById('navToggle');
const navLinks = document.getElementById('navLinks');
const dishModal = document.getElementById('dishModal');
const dishModalTitle = document.getElementById('dishModalTitle');
const dishModalDesc = document.getElementById('dishModalDesc');
const dishModalTags = document.getElementById('dishModalTags');
const dishModalPrice = document.getElementById('dishModalPrice');
const dishModalSpice = document.getElementById('dishModalSpice');
const dishModalTime = document.getElementById('dishModalTime');
const dishModalPortion = document.getElementById('dishModalPortion');
const dishModalImage = document.getElementById('dishModalImage');

const onScroll = () => {
  if (window.scrollY > 32) {
    header.classList.add('scrolled');
  } else {
    header.classList.remove('scrolled');
  }
};

window.addEventListener('scroll', onScroll);
onScroll();

function setBodyScrollLocked(locked) {
  document.body.style.overflow = locked ? 'hidden' : '';
}

navToggle.addEventListener('click', () => {
  const expanded = navToggle.getAttribute('aria-expanded') === 'true';
  const opening = !expanded;
  navToggle.setAttribute('aria-expanded', String(opening));
  navLinks.classList.toggle('open', opening);
  setBodyScrollLocked(opening);
});

navLinks.querySelectorAll('a').forEach((link) => {
  link.addEventListener('click', () => {
    navLinks.classList.remove('open');
    navToggle.setAttribute('aria-expanded', 'false');
    setBodyScrollLocked(false);
  });
});

// Close overlay on ESC
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && navLinks.classList.contains('open')) {
    navLinks.classList.remove('open');
    navToggle.setAttribute('aria-expanded', 'false');
    setBodyScrollLocked(false);
  }
});

// click outside links closes overlay (on mobile)
navLinks.addEventListener('click', (e) => {
  if (e.target === navLinks) {
    navLinks.classList.remove('open');
    navToggle.setAttribute('aria-expanded', 'false');
    setBodyScrollLocked(false);
  }
});

const revealElements = document.querySelectorAll('.reveal');

const revealObserver = new IntersectionObserver(
  (entries, observer) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  },
  {
    threshold: 0.2,
    rootMargin: '0px 0px -40px 0px'
  }
);

revealElements.forEach((el) => revealObserver.observe(el));

// EXTRA UI ENHANCEMENTS: hero pop, plate float, CTA pulse, parallax, price badges, counters, filters, modal
document.addEventListener('DOMContentLoaded', () => {
  // headline pop stagger
  const words = document.querySelectorAll('.hero-title .word');
  words.forEach((w, i) => {
    setTimeout(() => w.classList.add('pop'), 120 + i * 140);
  });

  // plate float animation
  const plate = document.querySelector('.plate');
  if (plate) plate.classList.add('animate');

  // hero CTA pulse
  const heroBtn = document.querySelector('#hero .btn');
  if (heroBtn) heroBtn.classList.add('pulse');

  // build price badges inside dish-media from menu-head strong text
  document.querySelectorAll('.menu-card').forEach((card) => {
    const price = card.querySelector('.menu-head strong');
    const media = card.querySelector('.dish-media');
    if (price && media && !media.querySelector('.price-badge')) {
      const s = document.createElement('span');
      s.className = 'price-badge';
      s.textContent = price.textContent.trim();
      media.appendChild(s);
    }
  });

  // simple parallax for plate
  const hero = document.getElementById('hero');
  if (plate && hero) {
    plate.classList.add('animate');
  }

  // menu filters
  const chips = document.querySelectorAll('.chip[data-filter]');
  const cards = document.querySelectorAll('.menu-card');
  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      chips.forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      const filter = chip.dataset.filter;
      cards.forEach((card) => {
        const categories = (card.dataset.category || '').split(/\s+/);
        const show = filter === 'all' || categories.includes(filter);
        card.classList.toggle('is-hidden', !show);
      });
    });
  });

  // stats counters
  const statNumbers = document.querySelectorAll('.stat-number[data-count]');
  const statObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      const target = Number(el.dataset.count || 0);
      const label = el.dataset.label || '';
      let current = 0;
      const duration = 1100;
      const step = Math.max(16, Math.round(duration / Math.max(target, 1)));
      const tick = () => {
        current += Math.max(1, Math.ceil(target / 24));
        if (current >= target) {
          el.textContent = `${target}${label}`;
          observer.unobserve(el);
          return;
        }
        el.textContent = `${current}${label}`;
        window.setTimeout(tick, step);
      };
      tick();
    });
  }, { threshold: 0.4 });
  statNumbers.forEach((el) => statObserver.observe(el));

  // dish modal helper
  const openModal = (card) => {
    if (!dishModal) return;
    dishModalTitle.textContent = card.dataset.title || '';
    dishModalDesc.textContent = card.dataset.description || '';
    if (dishModalTags) {
      const tags = (card.dataset.tags || '')
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean);
      dishModalTags.innerHTML = tags.map((tag) => `<span class="dish-modal-tag">${tag}</span>`).join('');
    }
    dishModalPrice.textContent = card.dataset.price || '';
    dishModalSpice.textContent = card.dataset.spice || '';
    dishModalTime.textContent = card.dataset.time || '';
    dishModalPortion.textContent = card.dataset.portion || '';
    const image = card.dataset.image || card.querySelector('img')?.src || '';
    dishModalImage.src = image;
    dishModalImage.alt = card.dataset.title || 'Dish image';
    dishModal.classList.add('open');
    dishModal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  };

  const closeModal = () => {
    if (!dishModal) return;
    dishModal.classList.remove('open');
    dishModal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  };

  document.querySelectorAll('.menu-card').forEach((card) => {
    card.addEventListener('click', () => openModal(card));
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openModal(card);
      }
    });
  });

  dishModal?.querySelectorAll('[data-close-modal]').forEach((btn) => {
    btn.addEventListener('click', closeModal);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeModal();
  });

  // support a visible CTA footer bar on mobile if present
  const stickyActions = document.querySelector('.sticky-actions');
  if (stickyActions) {
    const setVisible = () => {
      stickyActions.classList.toggle('visible', window.innerWidth <= 768);
    };
    setVisible();
    window.addEventListener('resize', setVisible, { passive: true });
  }
});
