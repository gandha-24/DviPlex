/**
 * js/orderController.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Main Client-Side Controller for DviPlex Order page.
 * Orchestrates form setup, validations, previews, payment gateway flow,
 * file uploads, and sheet persistence.
 */

import { getProductImageLimit, getProductDynamicFieldsHTML, isWordArt } from './products.js';
import { validateContactFields, validateDynamicFields, validatePhotos, showFieldError, clearFieldError } from './validation.js';
import { uploadImages } from './upload.js';
import { startPayment } from './payment.js';
import { saveOrder } from './orderService.js';
import { sendConfirmationEmail } from './emailService.js';
import { showToast, showLoading, hideLoading, setUploadProgress } from './utils.js';

// State
let activeProduct = null;
let uploadedFiles = [];
let maxPhotos = 1;

// DOM references
let uploadZone;
let photoInput;
let previewGrid;
let orderForm;

/**
 * Initialize page setup.
 */
document.addEventListener('DOMContentLoaded', () => {
  // Grab references to DOM
  uploadZone = document.getElementById('uploadZone');
  photoInput = document.getElementById('photoInput');
  previewGrid = document.getElementById('previewGrid');
  orderForm = document.getElementById('orderForm');

  // Load active product from database
  const catalog = window.PRODUCTS_CATALOG || (typeof PRODUCTS_CATALOG !== 'undefined' ? PRODUCTS_CATALOG : null);
  if (!catalog || catalog.length === 0) {
    console.error('[Controller] Product catalog not loaded!');
    showToast('Failed to load product catalog. Please reload.', 'error');
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const idx = parseInt(params.get('productIdx'), 10);
  if (!isNaN(idx) && idx >= 0 && idx < catalog.length) {
    activeProduct = catalog[idx];
  } else {
    activeProduct = catalog[0];
  }

  // Set up view
  populateSummary();
  renderFields();
  initUploadListeners();

  // Attach submit handler
  if (orderForm) {
    orderForm.addEventListener('submit', handleOrderSubmit);
  }
});

/**
 * Update Sidebar pricing and mini product preview card.
 */
function populateSummary() {
  if (!activeProduct) return;

  const thumb = document.getElementById('productThumb');
  const cat = document.getElementById('productCat');
  const name = document.getElementById('productName');
  const priceNow = document.getElementById('priceNow');
  const priceWas = document.getElementById('priceWas');
  const sumOriginal = document.getElementById('summaryOriginal');
  const sumDiscount = document.getElementById('summaryDiscount');
  const sumTotal = document.getElementById('summaryTotal');

  if (thumb) {
    thumb.src = activeProduct.thumbnail;
    thumb.alt = activeProduct.title;
  }
  if (cat) cat.textContent = activeProduct.categoryName;
  if (name) name.textContent = activeProduct.title;
  if (priceNow) priceNow.textContent = `₹${activeProduct.price}`;
  if (priceWas) priceWas.textContent = `₹${activeProduct.originalPrice}`;
  if (sumOriginal) sumOriginal.textContent = `₹${activeProduct.originalPrice}`;
  if (sumDiscount) sumDiscount.textContent = `−₹${activeProduct.originalPrice - activeProduct.price}`;
  if (sumTotal) sumTotal.textContent = `₹${activeProduct.price}`;
}

/**
 * Render dynamic fields and resolve dynamic upload counts.
 */
function renderFields() {
  const container = document.getElementById('dynamicFields');
  if (container && activeProduct) {
    container.innerHTML = getProductDynamicFieldsHTML(activeProduct);
  }

  // Resolve upload counts dynamically using product specifications
  maxPhotos = getProductImageLimit(activeProduct);
  updateUploadLimitBadge();
}

/**
 * Update dynamic label on upload zone.
 */
function updateUploadLimitBadge() {
  const badge = document.getElementById('uploadLimitBadge');
  if (badge) {
    badge.textContent = `Max ${maxPhotos} image${maxPhotos !== 1 ? 's' : ''}`;
  }
  if (photoInput) {
    photoInput.multiple = (maxPhotos > 1);
  }
}

/**
 * Setup drag/drop and choose file listeners.
 */
function initUploadListeners() {
  if (!uploadZone || !photoInput) return;

  // Drag and drop event handlers
  uploadZone.addEventListener('dragenter', e => { e.preventDefault(); uploadZone.classList.add('dragover'); });
  uploadZone.addEventListener('dragover',  e => { e.preventDefault(); uploadZone.classList.add('dragover'); });
  uploadZone.addEventListener('dragleave', () => { uploadZone.classList.remove('dragover'); });
  uploadZone.addEventListener('drop', e => {
    e.preventDefault();
    uploadZone.classList.remove('dragover');
    if (e.dataTransfer.files) {
      handleIncomingFiles(e.dataTransfer.files);
    }
  });

  // Select file handler
  photoInput.addEventListener('change', () => {
    if (photoInput.files) {
      handleIncomingFiles(photoInput.files);
      photoInput.value = ''; // Reset to allow re-selection
    }
  });
}

/**
 * File validation and preview rendering list updates.
 */
function handleIncomingFiles(fileList) {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
  const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

  for (const file of fileList) {
    if (uploadedFiles.length >= maxPhotos) {
      showFieldError('err-photos', `You can upload a maximum of ${maxPhotos} image${maxPhotos !== 1 ? 's' : ''} for this product.`);
      showToast(`Upload limit reached (${maxPhotos} max)`, 'warning');
      break;
    }

    const ext = file.name.split('.').pop().toLowerCase();
    const isSupportedType = allowedTypes.includes(file.type) || ['jpg', 'jpeg', 'png', 'webp', 'heic'].includes(ext);

    if (!isSupportedType) {
      showFieldError('err-photos', `"${file.name}" is not a supported format.`);
      continue;
    }

    if (file.size > MAX_SIZE_BYTES) {
      showFieldError('err-photos', `"${file.name}" exceeds the 10 MB size limit.`);
      continue;
    }

    uploadedFiles.push(file);
  }

  if (uploadedFiles.length <= maxPhotos) {
    clearFieldError('err-photos');
  }

  renderPreviews();
}

/**
 * Render previews inside preview grid.
 */
function renderPreviews() {
  if (!previewGrid) return;
  previewGrid.innerHTML = '';

  uploadedFiles.forEach((file, idx) => {
    const url = URL.createObjectURL(file);
    const item = document.createElement('div');
    item.className = 'preview-item';
    item.innerHTML = `
      <img src="${url}" alt="${file.name}" />
      <button type="button" class="remove-btn" data-index="${idx}" title="Remove">✕</button>
      <div class="file-name">${file.name}</div>`;
    
    // Wire click manually to keep modules isolated
    const btn = item.querySelector('.remove-btn');
    btn.addEventListener('click', (e) => {
      const idxToRemove = parseInt(e.target.getAttribute('data-index'), 10);
      removeFile(idxToRemove);
    });

    previewGrid.appendChild(item);
  });
}

/**
 * Remove chosen file from array list.
 */
function removeFile(idx) {
  uploadedFiles.splice(idx, 1);
  clearFieldError('err-photos');
  renderPreviews();
}

/**
 * Get dynamic/standard input values safely.
 */
function getVal(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : '';
}

/**
 * Order submission pipeline handler:
 * Validate -> Payload -> Payment checkout -> Image Upload -> Save Order -> Email confirmation -> Receipt screen
 */
async function handleOrderSubmit(e) {
  e.preventDefault();
  if (!activeProduct) return;

  // 1. VALIDATE FORM
  const contactsValid = validateContactFields();
  const dynamicsValid = validateDynamicFields(activeProduct.category);
  const imagesValid   = validatePhotos(uploadedFiles.length, maxPhotos);

  if (!contactsValid || !dynamicsValid || !imagesValid) {
    showToast('Please correct the validation errors in the form.', 'error');
    return;
  }

  const submitBtn = document.getElementById('submitBtn');
  if (submitBtn) submitBtn.disabled = true;

  // 2. CREATE ORDER PAYLOAD
  // Collect details for the payment transaction and sheet logging
  const orderDetails = {
    name:             getVal('fullName'),
    whatsapp_number:  getVal('whatsapp'),
    email:            getVal('email'),
    art_style:        activeProduct.categoryName,
    name_in_art:      getVal('customName'),
    size:             getVal('artworkSize'),
    font_style:       getVal('fontStyle'),
    art_color:        getVal('artColour'),
    border_style:     getVal('borderStyle'),
    bubble_text:      getVal('bubbleText'),
    custom_text:      getVal('customSentence'),
    custom_signature: getVal('customSignature'),
    special_request:  getVal('specialRequest'),
    product_name:     activeProduct.title,
    product_price:    activeProduct.price,
    imageUrls:        [] // to be appended after payment success + upload completes
  };

  // 3. START PAYMENT
  showLoading('Initializing payment gateway...');
  let paymentResult;
  try {
    paymentResult = await startPayment(orderDetails);
    if (!paymentResult || !paymentResult.success) {
      throw new Error('Payment was declined or cancelled by the customer.');
    }
  } catch (payErr) {
    console.error('[Controller] Payment checkout failure:', payErr);
    hideLoading();
    if (submitBtn) submitBtn.disabled = false;
    showToast(payErr.message || 'Payment failed. Please try again.', 'error');
    return;
  }

  // 4. WAIT FOR PAYMENT SUCCESS
  // At this stage, payment has succeeded.
  // Add payment details to order metadata.
  orderDetails.payment = 'Paid';
  orderDetails.payment_id = paymentResult.paymentId;

  // 5. UPLOAD IMAGES
  showLoading('Payment successful! Uploading photos...');
  setUploadProgress(0);

  let photoUrls = [];
  try {
    photoUrls = await uploadImages(uploadedFiles, (pct) => {
      setUploadProgress(pct);
      if (pct >= 100) {
        showLoading('Processing photos and saving order details...');
      } else {
        showLoading(`Uploading reference photos (${pct}%)`);
      }
    });
  } catch (uploadErr) {
    console.error('[Controller] Image upload failure:', uploadErr);
    hideLoading();
    setUploadProgress(0);
    if (submitBtn) submitBtn.disabled = false;
    showFieldError('err-photos', uploadErr.message);
    showToast(`Upload failed: ${uploadErr.message}. Reference: ${paymentResult.paymentId}`, 'error');
    return;
  }

  // Attach uploaded URLs to finalized payload
  orderDetails.imageUrls = photoUrls;

  // 6. SAVE ORDER
  showLoading('Saving your portrait order details...');
  let saveResult;
  try {
    saveResult = await saveOrder(orderDetails);
    if (!saveResult || !saveResult.success) {
      throw new Error('Sheets processor returned unsuccessful flag.');
    }
  } catch (saveErr) {
    console.error('[Controller] Sheets persistence failure:', saveErr);
    hideLoading();
    setUploadProgress(0);
    if (submitBtn) submitBtn.disabled = false;
    showToast(`Order details not saved: ${saveErr.message}. Payment Ref: ${paymentResult.paymentId}`, 'error');
    return;
  }

  // 7. EMAIL CONFIRMATION  (non-blocking background task)
  sendConfirmationEmail({
    ...orderDetails,
    orderId: saveResult.orderId
  }).catch(e => console.warn('[Controller] Send email trigger failed:', e));

  // 8. SUCCESS PAGE
  setUploadProgress(0);
  setTimeout(() => {
    hideLoading();
    
    // Hide form wrap, show success block, update receipt text
    const formWrap = document.getElementById('orderFormWrap');
    const successPage = document.getElementById('successPage');
    const displayId = document.getElementById('displayOrderId');

    if (formWrap) formWrap.style.display = 'none';
    if (displayId) displayId.textContent = saveResult.orderId;
    if (successPage) successPage.classList.add('active');

    window.scrollTo({ top: 0, behavior: 'smooth' });
    showToast('Order placed successfully!', 'success');
  }, 500);
}
