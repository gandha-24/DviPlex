/**
 * DviPlex Order Backend — Google Apps Script (Refactored)
 * ─────────────────────────────────────────────────────────────────────────────
 * Paste this entire file into the Apps Script editor attached to your sheet,
 * then deploy as a Web App (Execute as: Me · Access: Anyone).
 *
 * Spreadsheet : 1mp7a0Au_47R6uLlqs9QLj5sI83F15W-2kHhd56uwdpY
 * Sheet tab   : order
 *
 * The saving process is fully dynamic and header-based (not index-based).
 * It dynamically reads Row 1, maps incoming payload fields to match the headers,
 * and appends the row correctly even if columns are rearranged or added later.
 */

/* ─────────────────────────────────────────────────────────────────────────────
   CONFIGURATION
───────────────────────────────────────────────────────────────────────────── */

/** Target spreadsheet. Change only this if you ever migrate the sheet. */
const SPREADSHEET_ID = '1mp7a0Au_47R6uLlqs9QLj5sI83F15W-2kHhd56uwdpY';

/** Exact name of the sheet tab. */
const SHEET_TAB_NAME = 'order';

/** Prefix and zero-padding width for generated Order IDs. */
const ORDER_ID_PREFIX = 'ORD';
const ORDER_ID_DIGITS = 6;

/** Maximum Cloudinary image URL slots. */
const MAX_IMAGES = 6;

/**
 * Standard Header List (used to auto-initialize the sheet if completely empty).
 */
const DEFAULT_HEADERS = [
  'order_id',
  'order_date',
  'customer_name',
  'whatsapp_number',
  'email',
  'art_style',
  'product_name',
  'product_price',
  'name_in_art',
  'size',
  'font_style',
  'art_color',
  'border_style',
  'bubble_text',
  'custom_text',
  'custom_signature',
  'special_request',
  'image_1',
  'image_2',
  'image_3',
  'image_4',
  'image_5',
  'image_6',
  'payment_status',
  'payment_id',
  'order_status',
  'delivery_email_sent',
  'feedback_link',
  'email_msg'
];

/* ─────────────────────────────────────────────────────────────────────────────
   ENTRY POINTS
───────────────────────────────────────────────────────────────────────────── */

/**
 * doPost — main handler.
 * Receives JSON order payload from Cloudflare Pages Function,
 * maps fields to the sheet headers dynamically, and appends the row.
 */
function doPost(e) {
  try {
    /* ── Guard: body must exist ── */
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse({ success: false, error: 'Empty request body.' });
    }

    /* ── Parse JSON ── */
    let postData;
    try {
      postData = JSON.parse(e.postData.contents);
    } catch (_) {
      return jsonResponse({ success: false, error: 'Request body is not valid JSON.' });
    }
    
    Logger.log("========== ORDER RECEIVED ==========");
    Logger.log(JSON.stringify(postData));

    const action = e.parameter.action || postData.action;

    let result;
    if (action === 'getOrder') {
      const orderId = postData.orderId || e.parameter.orderId;
      result = getOrderDetails(orderId);
      return jsonResponse(result);
    } else if (action === 'saveFeedback') {
      result = handleSaveFeedback(postData);
      return jsonResponse(result);
    } else {
      // Default: Save order to sheet
      const sheet = getSheet();

      /* ── Resolve Order ID ── */
      const orderId = (postData.order_id && String(postData.order_id).trim())
        ? String(postData.order_id).trim()
        : generateNextOrderId(sheet);

      /* ── Build dynamic row based on actual headers in Sheet ── */
      const row = buildDynamicRow(sheet, postData, orderId);
      sheet.appendRow(row);

      /* ── Auto-resize columns for readability (best-effort) ── */
      try { sheet.autoResizeColumns(1, sheet.getLastColumn()); } catch (_) {}

      Logger.log('DviPlex: order saved — ' + orderId);

      return jsonResponse({ success: true, order_id: orderId });
    }

  } catch (err) {
    Logger.log('doPost ERROR: ' + err.message + '\n' + err.stack);
    return jsonResponse({ success: false, error: 'Server error: ' + err.message });
  }
}

/**
 * doGet — health-check.
 */
function doGet() {
  return ContentService
    .createTextOutput('DviPlex Order API Running')
    .setMimeType(ContentService.MimeType.TEXT);
}

/* ─────────────────────────────────────────────────────────────────────────────
   ORDER ID GENERATOR
───────────────────────────────────────────────────────────────────────────── */

/**
 * Return the next sequential Order ID by reading column A (order_id) of the last data row.
 */
function generateNextOrderId(sheet) {
  const lastRow = sheet.getLastRow();

  // Row 1 is the header; lastRow <= 1 means no data rows yet.
  if (lastRow <= 1) {
    return formatOrderId(1);
  }

  // Find column index of 'order_id' header dynamically
  const headers = getSheetHeaders(sheet);
  const orderIdColIdx = headers.indexOf('order_id') + 1; // 1-based column index

  // If order_id header is not found, fallback to column 1
  const colNumber = orderIdColIdx > 0 ? orderIdColIdx : 1;
  const lastId = String(sheet.getRange(lastRow, colNumber).getValue()).trim();

  if (lastId.startsWith(ORDER_ID_PREFIX)) {
    const num = parseInt(lastId.slice(ORDER_ID_PREFIX.length), 10);
    if (!isNaN(num) && num > 0) {
      return formatOrderId(num + 1);
    }
  }

  // Fallback based on row count
  return formatOrderId(lastRow);
}

function formatOrderId(n) {
  return ORDER_ID_PREFIX + String(n).padStart(ORDER_ID_DIGITS, '0');
}

/* ─────────────────────────────────────────────────────────────────────────────
   DYNAMIC ROW BUILDER (HEADER-BASED)
───────────────────────────────────────────────────────────────────────────── */

/**
 * Retrieve sheet headers in lower case.
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @returns {string[]}
 */
function getSheetHeaders(sheet) {
  const lastCol = sheet.getLastColumn();
  if (lastCol === 0) return [];
  const headerValues = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  return headerValues.map(h => String(h).trim().toLowerCase());
}

/**
 * Build an array ordered to match the actual sheet columns dynamically.
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {object} order - Incoming payload
 * @param {string} orderId - Resolved order ID
 * @returns {Array}
 */
function buildDynamicRow(sheet, order, orderId) {
  const headers = getSheetHeaders(sheet);

  /* ── Timestamps & Arrays ── */
  const orderDate = Utilities.formatDate(
    new Date(),
    'Asia/Kolkata',
    'dd/MM/yyyy HH:mm:ss'
  );

  const images = Array.isArray(order.imageUrls) ? order.imageUrls : [];
  
  // Payment status must be ALWAYS 'Pending' for new orders
  const payment = 'Pending';
  
  const paymentId = sanitize(order.payment_id);

  // Generate product slug from order.product_name
  const productName = sanitize(order.product_name) || 'Custom Portrait';
  const productSlug = generateSlug(productName);

  // Generate feedback link automatically
  const baseUrl = 'https://digitalartstudio.in';
  const feedbackLink = baseUrl + '/feedback.html?order=' + orderId + '&product=' + productSlug;

  // Generate email message template automatically
  const customerName = sanitize(order.name) || 'Valued Customer';
  const emailMsg = generateEmailMsg(customerName, orderId, productName, feedbackLink);

  /* ── Mapping payload fields to header keys ── */
  const dataMap = {
    'order_id': orderId,
    'order_date': orderDate,
    'customer_name': customerName,
    'whatsapp_number': sanitize(order.whatsapp_number),
    'email': sanitize(order.email),
    'art_style': sanitize(order.art_style),
    'product_name': productName,
    'product_price': sanitize(order.product_price),
    'name_in_art': sanitize(order.name_in_art),
    'size': sanitize(order.size),
    'font_style': sanitize(order.font_style),
    'art_color': sanitize(order.art_color),
    'border_style': sanitize(order.border_style),
    'bubble_text': sanitize(order.bubble_text),
    'custom_text': sanitize(order.custom_text),
    'custom_signature': sanitize(order.custom_signature),
    'special_request': sanitize(order.special_request),
    'image_1': sanitize(images[0]),
    'image_2': sanitize(images[1]),
    'image_3': sanitize(images[2]),
    'image_4': sanitize(images[3]),
    'image_5': sanitize(images[4]),
    'image_6': sanitize(images[5]),
    'payment_status': payment,
    'payment_id': paymentId,
    'order_status': 'Pending',
    'delivery_email_sent': 'NO',
    'feedback_link': feedbackLink,
    'email_msg': emailMsg
  };

  // Build the row array matching the sheet columns exactly.
  // Unknown headers remain blank (''), preserving future-proof compatibility.
  return headers.map(header => {
    return dataMap.hasOwnProperty(header) ? dataMap[header] : '';
  });
}

/* ─────────────────────────────────────────────────────────────────────────────
   UTILITIES
───────────────────────────────────────────────────────────────────────────── */

/**
 * Open target spreadsheet and sheet.
 */
function getSheet() {
  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_TAB_NAME);

  if (!sheet) {
    throw new Error(
      `Sheet tab "${SHEET_TAB_NAME}" not found in spreadsheet ${SPREADSHEET_ID}.`
    );
  }

  // Auto-create header row if the sheet is completely empty.
  if (sheet.getLastRow() === 0) {
    addHeaderRow(sheet);
  }

  return sheet;
}

/**
 * Write default headers and style them.
 */
function addHeaderRow(sheet) {
  const range = sheet.getRange(1, 1, 1, DEFAULT_HEADERS.length);
  range.setValues([DEFAULT_HEADERS]);
  range
    .setFontWeight('bold')
    .setBackground('#7F77DD')
    .setFontColor('#ffffff')
    .setHorizontalAlignment('center');
  sheet.setFrozenRows(1);
}

function sanitize(value) {
  if (value === null || value === undefined) return '';
  const str = String(value).trim();
  if (str === 'undefined' || str === 'null') return '';
  return str;
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Helper to generate product slug.
 * "Water Splash Cat" -> "water-splash-cat"
 */
function generateSlug(text) {
  if (!text) return '';
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/**
 * Helper to generate pre-filled email template message.
 */
function generateEmailMsg(customerName, orderId, productName, feedbackLink) {
  return "Hello " + customerName + ",\n\n" +
         "Thank you for choosing Digital Art Studio ❤️\n\n" +
         "Your artwork has been completed successfully.\n\n" +
         "━━━━━━━━━━━━━━━━━━━━━━\n\n" +
         "Order Number\n\n" +
         orderId + "\n\n" +
         "Artwork\n\n" +
         productName + "\n\n" +
         "━━━━━━━━━━━━━━━━━━━━━━\n\n" +
         "If you enjoyed your artwork, we would truly appreciate your feedback.\n\n" +
         "Please click the link below to rate your experience.\n\n" +
         feedbackLink + "\n\n" +
         "Thank you for supporting Digital Art Studio.\n\n" +
         "Best Regards,\n\n" +
         "Digital Art Studio Team";
}

/**
 * Retrieves details of a specific order by Order ID.
 */
function getOrderDetails(orderId) {
  try {
    const sheet = getSheet();
    const data = sheet.getDataRange().getValues();
    if (data.length < 2) {
      return { success: false, error: "No orders found." };
    }

    const headers = getSheetHeaders(sheet);
    const orderIdIdx = headers.indexOf("order_id");
    const nameIdx = headers.indexOf("customer_name");
    const productIdx = headers.indexOf("product_name");

    if (orderIdIdx === -1) {
      return { success: false, error: "order_id column not found in sheet." };
    }

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][orderIdIdx]).trim() === String(orderId).trim()) {
        return {
          success: true,
          customer_name: nameIdx !== -1 ? data[i][nameIdx] : "",
          product_name: productIdx !== -1 ? data[i][productIdx] : ""
        };
      }
    }

    return { success: false, error: "Order not found." };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

/**
 * Updates an order row with rating, review, and feedback timestamp.
 */
function handleSaveFeedback(feedback) {
  try {
    const sheet = getSheet();
    const data = sheet.getDataRange().getValues();
    if (data.length < 2) {
      return { success: false, error: "No orders found in sheet." };
    }

    const headers = getSheetHeaders(sheet);
    const orderIdIdx = headers.indexOf("order_id");
    const ratingIdx = headers.indexOf("rating");
    const reviewIdx = headers.indexOf("review");
    const dateIdx = headers.indexOf("feedback_date");

    if (orderIdIdx === -1) {
      return { success: false, error: "order_id column not found in sheet." };
    }

    const orderId = feedback.order_id;
    let found = false;

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][orderIdIdx]).trim() === String(orderId).trim()) {
        if (ratingIdx !== -1) sheet.getRange(i + 1, ratingIdx + 1).setValue(feedback.rating);
        if (reviewIdx !== -1) sheet.getRange(i + 1, reviewIdx + 1).setValue(feedback.review);
        if (dateIdx !== -1) sheet.getRange(i + 1, dateIdx + 1).setValue(feedback.feedback_date || new Date().toISOString());
        found = true;
        break;
      }
    }

    if (!found) {
      return { success: false, error: "Order ID not found." };
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
   TESTS
───────────────────────────────────────────────────────────────────────────── */

/**
 * testDoPost
 */
function testDoPost() {
  const sample = {
    name:             'Priya Sharma',
    whatsapp_number:  '+91 98765 43210',
    email:            'priya@example.com',
    art_style:        'Watercolor Splash',
    name_in_art:      'Priya & Aarav',
    size:             '8x11',
    imageUrls: [
      'https://res.cloudinary.com/demo/image/upload/sample1.jpg',
      'https://res.cloudinary.com/demo/image/upload/sample2.jpg',
    ],
    font_style:       'Great Vibes',
    art_color:        'Dusty Rose',
    border_style:     '',
    bubble_text:      '',
    custom_text:      '',
    custom_signature: 'From Aarav with Love, 2026',
    payment:          'Paid',
    payment_id:       'PAY_TEST_12345'
  };

  const result = doPost({ postData: { contents: JSON.stringify(sample) } });
  Logger.log('testDoPost → ' + result.getContent());
}
