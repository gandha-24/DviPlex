/**
 * js/validation.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Form validation module for the DviPlex order flow.
 */

import { isWordArt } from './products.js';

/**
 * Show a field validation error.
 * @param {string} id - The ID of the field-error element (e.g., 'err-fullName')
 * @param {string} [msg] - Override validation message
 */
export function showFieldError(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  if (msg) el.textContent = msg;
  el.classList.add('visible');
  const input = document.getElementById(id.replace('err-', ''));
  if (input) input.classList.add('error');
}

/**
 * Clear a field validation error.
 * @param {string} id - The ID of the field-error element
 */
export function clearFieldError(id) {
  const el = document.getElementById(id);
  if (el) {
    el.classList.remove('visible');
  }
  const input = document.getElementById(id.replace('err-', ''));
  if (input) {
    input.classList.remove('error');
  }
}

/**
 * Validate that a field is not empty.
 * @param {string} fieldId
 * @returns {boolean}
 */
export function validateRequired(fieldId) {
  const el = document.getElementById(fieldId);
  if (!el) return true;
  const val = el.value.trim();
  if (!val) {
    showFieldError(`err-${fieldId}`);
    return false;
  }
  clearFieldError(`err-${fieldId}`);
  return true;
}

/**
 * Validate contacts fields.
 * @returns {boolean}
 */
export function validateContactFields() {
  const nameOk = validateRequired('fullName');
  const waOk = validateRequired('whatsapp');
  const emailOk = validateRequired('email');

  const emailEl = document.getElementById('email');
  let emailFormatOk = true;
  if (emailEl && emailEl.value) {
    const emailVal = emailEl.value.trim();
    if (!emailVal.includes('@') || emailVal.length < 5) {
      showFieldError('err-email', 'Please enter a valid email address.');
      emailFormatOk = false;
    } else {
      clearFieldError('err-email');
    }
  }

  return nameOk && waOk && emailOk && emailFormatOk;
}

/**
 * Validate product dynamic fields based on category.
 * @param {string} category
 * @returns {boolean}
 */
export function validateDynamicFields(category) {
  const cat = (category || '').toLowerCase();
  
  if (isWordArt(cat)) {
    const sentenceOk = validateRequired('customSentence');
    const signatureOk = validateRequired('customSignature');
    return sentenceOk && signatureOk;
  }

  if (cat === 'pet lineart') {
    return (
      validateRequired('customName') &&
      validateRequired('artworkSize') &&
      validateRequired('fontStyle') &&
      validateRequired('borderStyle') &&
      validateRequired('artColour')
    );
  }

  if (cat === 'caricature') {
    return (
      validateRequired('customName') &&
      validateRequired('artworkSize') &&
      validateRequired('fontStyle')
    );
  }

  // Default: watercolor splash/pastel/lineart/anime
  return (
    validateRequired('customName') &&
    validateRequired('artworkSize') &&
    validateRequired('fontStyle')
  );
}

/**
 * Validate image uploads against limits.
 * @param {number} uploadedCount
 * @param {number} limit
 * @returns {boolean}
 */
export function validatePhotos(uploadedCount, limit) {
  if (uploadedCount === 0) {
    showFieldError('err-photos', 'Please upload at least one reference photo.');
    return false;
  }
  if (uploadedCount > limit) {
    showFieldError('err-photos', `You have uploaded more photos than the limit of ${limit}.`);
    return false;
  }
  clearFieldError('err-photos');
  return true;
}
