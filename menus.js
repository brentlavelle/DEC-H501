// Menus
// Opens and closes the terminal's pull-down menus and picks the screen's phosphor colour.
// The menu items themselves are ordinary buttons that boardEditor.js listens to by id, so
// nothing here knows what any item does.

const menus = [...document.querySelectorAll('.vt-menu')];
const PHOSPHORS = ['amber', 'green', 'white'];
const STORAGE_KEY = 'h500.phosphor';

function close(menu) {
  menu.classList.remove('open');
  menu.querySelector('.vt-menu-title').setAttribute('aria-expanded', 'false');
}

function closeAll() {
  menus.forEach(close);
}

function open(menu) {
  menus.forEach(other => other !== menu && close(other));
  menu.classList.add('open');
  menu.querySelector('.vt-menu-title').setAttribute('aria-expanded', 'true');
}

const items = menu => [...menu.querySelectorAll('.vt-menu-items button:not(:disabled), .vt-menu-items input')];

menus.forEach(menu => {
  const title = menu.querySelector('.vt-menu-title');

  title.addEventListener('click', () => {
    if (menu.classList.contains('open')) close(menu);
    else open(menu);
  });

  // Once one menu is open, moving along the bar opens the others, as menu bars do.
  title.addEventListener('mouseenter', () => {
    if (menus.some(other => other.classList.contains('open'))) open(menu);
  });

  // Choosing an item closes the menu. A checkbox stays open so its new state can be seen.
  menu.querySelector('.vt-menu-items').addEventListener('click', event => {
    if (event.target.closest('button')) closeAll();
  });

  menu.addEventListener('keydown', event => {
    const list = items(menu);
    const at = list.indexOf(document.activeElement);
    if (event.key === 'ArrowDown') {
      open(menu);
      list[(at + 1) % list.length]?.focus();
      event.preventDefault();
    } else if (event.key === 'ArrowUp') {
      open(menu);
      list[(at - 1 + list.length) % list.length]?.focus();
      event.preventDefault();
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      const step = event.key === 'ArrowRight' ? 1 : -1;
      const next = menus[(menus.indexOf(menu) + step + menus.length) % menus.length];
      open(next);
      next.querySelector('.vt-menu-title').focus();
      event.preventDefault();
    } else if (event.key === 'Escape') {
      close(menu);
      title.focus();
      // Keep Escape from reaching the editor, which uses it for its own purposes.
      event.stopPropagation();
    }
  });
});

document.addEventListener('mousedown', event => {
  if (!event.target.closest?.('.vt-menu')) closeAll();
});

// --- Phosphor colour: amber, green or white, remembered per browser when it can be.

function remembered() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function setPhosphor(name) {
  const phosphor = PHOSPHORS.includes(name) ? name : PHOSPHORS[0];
  document.documentElement.dataset.phosphor = phosphor;
  document.querySelectorAll('[data-phosphor-choice]').forEach(button => {
    button.setAttribute('aria-checked', String(button.dataset.phosphorChoice === phosphor));
  });
  try {
    localStorage.setItem(STORAGE_KEY, phosphor);
  } catch {
    // Storage can be unavailable; the choice then lasts until the page is closed.
  }
}

document.querySelectorAll('[data-phosphor-choice]').forEach(button => {
  button.addEventListener('click', () => setPhosphor(button.dataset.phosphorChoice));
});

setPhosphor(remembered());
