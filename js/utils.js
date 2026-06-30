/**
 * js/utils.js
 * ─────────────────────────────────────────────────────────────────────────────
 * UI and common utilities for DviPlex website.
 */

import { CONFIG } from './config.js';

/**
 * Update the upload progress bar UI.
 * @param {number} percent - 0 to 100
 */
export function setUploadProgress(percent) {
  const progressBar = document.getElementById('uploadProgressBar');
  const progressFill = document.getElementById('uploadProgressFill');
  if (progressBar && progressFill) {
    if (percent > 0 && percent < 100) {
      progressBar.classList.add('active');
    } else if (percent >= 100 || percent <= 0) {
      progressBar.classList.remove('active');
    }
    progressFill.style.width = `${percent}%`;
  }
}

/**
 * Show the global loading overlay with a specific text.
 * @param {string} text
 */
export function showLoading(text) {
  const overlay = document.getElementById('loadingOverlay');
  if (overlay) {
    overlay.classList.add('active');
    const txtEl = overlay.querySelector('.loading-text');
    if (txtEl) {
      txtEl.textContent = text;
    }
  }
}

/**
 * Hide the global loading overlay.
 */
export function hideLoading() {
  const overlay = document.getElementById('loadingOverlay');
  if (overlay) {
    overlay.classList.remove('active');
  }
}

/**
 * Format raw price number with standard currency symbol.
 * @param {number|string} price
 * @returns {string}
 */
export function formatPrice(price) {
  return `${CONFIG.CURRENCY_SYMBOL}${price}`;
}

/**
 * Show a premium toast notification.
 * @param {string} message
 * @param {'success'|'error'|'info'|'warning'} type
 */
export function showToast(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    Object.assign(container.style, {
      position: 'fixed',
      bottom: '24px',
      right: '24px',
      zIndex: '9999',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      maxWidth: '350px',
      pointerEvents: 'none'
    });
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;

  // Premium glassmorphic styles
  const colors = {
    success: { bg: 'rgba(34, 197, 94, 0.9)', border: '#22c55e' },
    error: { bg: 'rgba(229, 57, 53, 0.9)', border: '#e53935' },
    info: { bg: 'rgba(127, 119, 221, 0.9)', border: '#7F77DD' },
    warning: { bg: 'rgba(245, 158, 11, 0.9)', border: '#f59e0b' }
  };

  const theme = colors[type] || colors.info;

  Object.assign(toast.style, {
    padding: '14px 20px',
    backgroundColor: theme.bg,
    color: '#ffffff',
    borderRadius: '10px',
    fontFamily: "'Inter', sans-serif",
    fontSize: '13px',
    fontWeight: '600',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.15)',
    borderLeft: `5px solid ${theme.border}`,
    backdropFilter: 'blur(8px)',
    opacity: '0',
    transform: 'translateY(20px)',
    transition: 'opacity 0.3s ease, transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
    pointerEvents: 'auto'
  });

  container.appendChild(toast);

  // Trigger animation
  setTimeout(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
  }, 10);

  // Dismiss after 4 seconds
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    setTimeout(() => {
      toast.remove();
      if (container.childNodes.length === 0) {
        container.remove();
      }
    }, 300);
  }, 4000);
}
