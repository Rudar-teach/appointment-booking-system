// UI Utilities: Toast notifications, modals, helpers
class ToastManager {
  constructor() {
    this.container = document.createElement('div');
    this.container.id = 'toast-container';
    this.container.className = 'fixed top-4 right-4 z-50 flex flex-col gap-2';
    document.body.appendChild(this.container);
  }

  show(message, type = 'info', duration = 4000) {
    const toast = document.createElement('div');
    const icons = { success: '✓', error: '✕', info: 'ℹ', warning: '⚠' };
    const colors = {
      success: 'bg-green-500 text-white',
      error: 'bg-red-500 text-white',
      info: 'bg-blue-500 text-white',
      warning: 'bg-yellow-500 text-white'
    };

    toast.className = `${colors[type]} px-4 py-3 rounded-lg shadow-lg transform transition-all duration-300 translate-x-full opacity-0 max-w-sm`;
    toast.innerHTML = `
      <div class="flex items-center gap-3">
        <span class="font-bold text-lg">${icons[type]}</span>
        <span class="text-sm">${message}</span>
      </div>
    `;

    this.container.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.remove('translate-x-full', 'opacity-0');
    });

    setTimeout(() => {
      toast.classList.add('translate-x-full', 'opacity-0');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }
}

const toast = new ToastManager();

function showToast(message, type = 'info') {
  toast.show(message, type);
}

// Modal helper
function showModal(title, content, onConfirm = null) {
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black/50 backdrop-blur-sm z-40 flex items-center justify-center p-4';
  modal.innerHTML = `
    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full p-6 transform transition-all">
      <h3 class="text-xl font-bold text-gray-900 dark:text-white mb-3">${title}</h3>
      <div class="text-gray-600 dark:text-gray-300 mb-6">${content}</div>
      <div class="flex gap-3 justify-end">
        <button id="modal-cancel" class="px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300 transition">Cancel</button>
        ${onConfirm ? '<button id="modal-confirm" class="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition">Confirm</button>' : ''}
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  modal.querySelector('#modal-cancel').onclick = () => modal.remove();
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

  if (onConfirm) {
    modal.querySelector('#modal-confirm').onclick = () => {
      onConfirm();
      modal.remove();
    };
  }

  return modal;
}

// Skeleton loading
function showSkeleton(container, count = 4) {
  container.innerHTML = Array(count).fill(0).map(() => `
    <div class="animate-pulse bg-gray-200 dark:bg-gray-700 rounded-xl h-48"></div>
  `).join('');
}

// Format currency
function formatCurrency(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

// Format date
function formatDate(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

function formatTime(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatDateTime(dateStr) {
  return `${formatDate(dateStr)} at ${formatTime(dateStr)}`;
}

// Auth state
function isAuthenticated() {
  return document.body.dataset.authenticated === 'true';
}

function isAdmin() {
  return document.body.dataset.role === 'admin';
}

function isProvider() {
  return document.body.dataset.role === 'provider';
}

// Dark mode
function initDarkMode() {
  const toggle = document.getElementById('theme-toggle');
  if (!toggle) return;

  const saved = localStorage.getItem('theme');
  if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark');
  }

  toggle.onclick = () => {
    document.documentElement.classList.toggle('dark');
    localStorage.setItem(
      'theme',
      document.documentElement.classList.contains('dark') ? 'dark' : 'light'
    );
  };
}

// Navigation
function navigateTo(path) {
  window.location.href = path;
}

module.exports = {
  showToast,
  showModal,
  showSkeleton,
  formatCurrency,
  formatDate,
  formatTime,
  formatDateTime,
  isAuthenticated,
  isAdmin,
  isProvider,
  initDarkMode,
  navigateTo
};