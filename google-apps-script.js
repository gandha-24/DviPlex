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
  'conformation_email_sent',
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
    } else if (action === 'getFeedbacks' || action === 'getRatings') {
      result = getFeedbacksData();
      return jsonResponse(result);
    } else if (action === 'sendEmail') {
      // Compatibility fallback: Email is now sent inline during order save.
      // Simply return success to prevent duplicate sends or errors.
      return jsonResponse({ success: true, message: 'Email sent automatically during order save.' });
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

      const lastRow = sheet.getLastRow();

      /* ── Trigger Confirmation Email ── */
      const emailPayload = {
        ...postData,
        orderId: orderId
      };
      
      const emailResult = sendConfirmationEmail(emailPayload);
      
      const headers = getSheetHeaders(sheet);
      const emailSentColIdx = headers.indexOf('conformation_email_sent') + 1;
      const emailMsgColIdx = headers.indexOf('email_msg') + 1;

      if (emailResult && emailResult.success) {
        if (emailSentColIdx > 0) {
          sheet.getRange(lastRow, emailSentColIdx).setValue('YES');
        }
      } else {
        if (emailSentColIdx > 0) {
          sheet.getRange(lastRow, emailSentColIdx).setValue('NO');
        }
        if (emailMsgColIdx > 0) {
          const errorMsg = emailResult ? emailResult.error : 'Unknown email error';
          sheet.getRange(lastRow, emailMsgColIdx).setValue('Error: ' + errorMsg);
        }
      }

      /* ── Auto-resize columns for readability (best-effort) ── */
      try { sheet.autoResizeColumns(1, sheet.getLastColumn()); } catch (_) { }

      Logger.log('DviPlex: order saved & email triggered — ' + orderId);

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
  const baseUrl = 'https://digitalartstudio.pages.dev';
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
    'conformation_email_sent': 'NO',
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
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
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
 * Open feedback sheet. Checks for 'feedback' or 'feedbacks' tab, auto-creating it if not found.
 */
function getFeedbackSheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName('feedback');
  if (!sheet) {
    sheet = ss.getSheetByName('feedbacks');
  }
  if (!sheet) {
    sheet = ss.insertSheet('feedback');
  }
  
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['order_id', 'rating', 'feedback']);
    sheet.getRange(1, 1, 1, 3)
      .setFontWeight('normal')
      .setBackground('#7F77DD')
      .setFontColor('#ffffff')
      .setHorizontalAlignment('center');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/**
 * Appends order feedback rating and review text to the feedback tab.
 */
function handleSaveFeedback(feedback) {
  try {
    const feedbackSheet = getFeedbackSheet();
    
    const orderId = sanitize(feedback.order_id);
    const rating = parseFloat(feedback.rating);
    const reviewText = sanitize(feedback.review || feedback.feedback);

    if (!orderId || isNaN(rating)) {
      return { success: false, error: "Invalid order_id or rating." };
    }

    const headers = feedbackSheet.getRange(1, 1, 1, feedbackSheet.getLastColumn()).getValues()[0].map(h => String(h).trim().toLowerCase());
    
    const fbOrderIdIdx = headers.indexOf('order_id');
    const fbRatingIdx = headers.indexOf('rating');
    const fbFeedbackIdx = headers.indexOf('feedback');

    const newRow = new Array(headers.length).fill('');
    if (fbOrderIdIdx !== -1) newRow[fbOrderIdIdx] = orderId;
    if (fbRatingIdx !== -1) newRow[fbRatingIdx] = rating;
    if (fbFeedbackIdx !== -1) newRow[fbFeedbackIdx] = reviewText;

    feedbackSheet.appendRow(newRow);

    return { success: true };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

/**
 * Retrieves all order feedback ratings and reviews from the sheet tab.
 */
function getFeedbacksData() {
  try {
    const feedbackSheet = getFeedbackSheet();
    const feedbackData = feedbackSheet.getDataRange().getValues();
    if (feedbackData.length < 2) {
      return { success: true, feedbacks: [] };
    }

    const orderSheet = getSheet();
    const orderData = orderSheet.getDataRange().getValues();
    const orderHeaders = getSheetHeaders(orderSheet);
    
    const orderIdIdx = orderHeaders.indexOf('order_id');
    const productNameIdx = orderHeaders.indexOf('product_name');
    
    const orderToProductMap = {};
    if (orderIdIdx !== -1 && productNameIdx !== -1) {
      for (let i = 1; i < orderData.length; i++) {
        const oId = String(orderData[i][orderIdIdx]).trim();
        const pName = String(orderData[i][productNameIdx]).trim();
        if (oId) {
          orderToProductMap[oId] = pName;
        }
      }
    }

    const fbHeaders = feedbackData[0].map(h => String(h).trim().toLowerCase());
    const fbOrderIdIdx = fbHeaders.indexOf('order_id');
    const fbRatingIdx = fbHeaders.indexOf('rating');
    const fbFeedbackIdx = fbHeaders.indexOf('feedback');

    const feedbacks = [];
    for (let i = 1; i < feedbackData.length; i++) {
      const oId = String(feedbackData[i][fbOrderIdIdx]).trim();
      const rating = parseFloat(feedbackData[i][fbRatingIdx]);
      const text = String(feedbackData[i][fbFeedbackIdx] || '').trim();
      
      if (oId && !isNaN(rating)) {
        feedbacks.push({
          order_id: oId,
          product_name: orderToProductMap[oId] || '',
          rating: rating,
          feedback: text
        });
      }
    }

    return { success: true, feedbacks: feedbacks };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

/**
 * Send the premium HTML confirmation email to the customer.
 * 
 * @param {object} order - Complete order details
 * @returns {object} { success: boolean, error?: string }
 */
function sendConfirmationEmail(order) {
  try {
    if (!order || !order.email) {
      return { success: false, error: "Missing order email address." };
    }

    const customerName = order.name || "Valued Customer";
    const orderId = order.orderId || order.order_id || "N/A";
    const productName = order.product_name || "Custom Digital Portrait";
    const artStyle = order.art_style || "N/A";
    const nameInArt = order.name_in_art || "N/A";
    const size = order.size || "N/A";
    const paymentStatus = order.payment || order.payment_status || "Paid";

    const htmlBody = getEmailTemplate(customerName, orderId, productName, artStyle, nameInArt, size, paymentStatus);

    MailApp.sendEmail({
      to: order.email,
      subject: "🎨 Thank You for Your Order | Digital Art Studio",
      htmlBody: htmlBody
    });

    return { success: true };
  } catch (err) {
    Logger.log("Error in sendConfirmationEmail: " + err.toString());
    return { success: false, error: err.toString() };
  }
}

/**
 * Generates the premium responsive HTML email body.
 */
function getEmailTemplate(customerName, orderId, productName, artStyle, nameInArt, size, paymentStatus) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Thank You for Your Order | Digital Art Studio</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8f7ff; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; color: #1a1a1a;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="table-layout: fixed; background-color: #f8f7ff; padding: 40px 0;">
    <tr>
      <td align="center">
        <!-- Main Email Container -->
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; border: 1px solid #e8e6f8; box-shadow: 0 4px 20px rgba(127, 119, 221, 0.05); overflow: hidden; margin: 0 auto;">
          
          <!-- Premium Logo Header -->
          <tr>
            <td align="center" style="padding: 32px 24px 24px 24px; border-bottom: 1px solid #f0effe; background-color: #ffffff;">
              <div style="font-size: 26px; font-weight: 800; color: #1a1a1a; letter-spacing: -0.5px;">
                Digital Art <span style="color: #7F77DD;">Studio</span>
              </div>
              <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; color: #D4AF37; margin-top: 4px;">
                ✨ Premium Custom Portraits ✨
              </div>
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding: 32px 32px 24px 32px; background-color: #ffffff;">
              <p style="font-size: 16px; font-weight: 700; color: #1a1a1a; margin: 0 0 16px 0;">Hi ${customerName},</p>
              
              <p style="font-size: 15px; line-height: 1.6; color: #4a4a4a; margin: 0 0 24px 0;">
                Thank you for choosing <strong>Digital Art Studio</strong> ❤️<br>
                We are delighted to let you know that your order has been received successfully.
              </p>

              <!-- Order Details Rounded Card -->
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="border: 1px solid #e8e6f8; border-radius: 12px; padding: 24px; margin-bottom: 24px; background-color: #ffffff;">
                <tr>
                  <td colspan="2" style="font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #7F77DD; padding-bottom: 12px; border-bottom: 1px solid #f0effe;">
                    ORDER DETAILS
                  </td>
                </tr>
                <tr><td colspan="2" style="height: 12px;"></td></tr>
                
                <!-- Row 1: Order Number -->
                <tr>
                  <td style="padding: 6px 0; font-size: 13px; color: #777777; width: 40%; vertical-align: top;">Order Number</td>
                  <td style="padding: 6px 0; font-size: 13px; font-weight: 700; color: #1a1a1a; width: 60%;">${orderId}</td>
                </tr>
                
                <!-- Row 2: Artwork Name -->
                <tr>
                  <td style="padding: 6px 0; font-size: 13px; color: #777777; vertical-align: top;">Artwork</td>
                  <td style="padding: 6px 0; font-size: 13px; font-weight: 600; color: #1a1a1a;">${productName}</td>
                </tr>
                
                <!-- Row 3: Art Style -->
                <tr>
                  <td style="padding: 6px 0; font-size: 13px; color: #777777; vertical-align: top;">Art Style</td>
                  <td style="padding: 6px 0; font-size: 13px; font-weight: 600; color: #1a1a1a;">${artStyle}</td>
                </tr>
                
                <!-- Row 4: Custom Name -->
                <tr>
                  <td style="padding: 6px 0; font-size: 13px; color: #777777; vertical-align: top;">Custom Name</td>
                  <td style="padding: 6px 0; font-size: 13px; font-weight: 600; color: #1a1a1a;">${nameInArt}</td>
                </tr>
                
                <!-- Row 5: Artwork Size -->
                <tr>
                  <td style="padding: 6px 0; font-size: 13px; color: #777777; vertical-align: top;">Artwork Size</td>
                  <td style="padding: 6px 0; font-size: 13px; font-weight: 600; color: #1a1a1a;">${size}</td>
                </tr>
                
                <!-- Row 6: Payment Status -->
                <tr>
                  <td style="padding: 6px 0; font-size: 13px; color: #777777; vertical-align: top;">Payment Status</td>
                  <td style="padding: 6px 0; font-size: 13px; font-weight: 700; color: #22c55e;">${paymentStatus}</td>
                </tr>
              </table>

              <!-- Estimated Delivery with Soft Gold Highlight -->
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #fffdf2; border-left: 4px solid #D4AF37; border-radius: 8px; margin-bottom: 24px; border-collapse: collapse;">
                <tr>
                  <td style="padding: 16px 18px;">
                    <div style="font-size: 14px; font-weight: 700; color: #8A6D1C; margin-bottom: 6px;">
                      ⏰ Estimated Delivery: Within 5 Hours
                    </div>
                    <div style="font-size: 13px; line-height: 1.5; color: #5C4B18;">
                      Our artists have started preparing your artwork. Once your artwork is completed, it will be sent directly to this email address in high quality.
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Need Help Section (Dashed Border) -->
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="border: 1.5px dashed #dddaf5; border-radius: 10px; margin-bottom: 24px; text-align: center; border-collapse: collapse;">
                <tr>
                  <td style="padding: 16px;">
                    <div style="font-size: 14px; font-weight: 700; color: #1a1a1a; margin-bottom: 4px;">Need Help?</div>
                    <div style="font-size: 13px; color: #666666;">If you have any questions regarding your order, simply reply to this email.</div>
                  </td>
                </tr>
              </table>

              <!-- Closing Section -->
              <p style="font-size: 14.5px; line-height: 1.5; color: #4a4a4a; margin: 24px 0 0 0;">
                Thank you for supporting Digital Art Studio.<br>
                We truly appreciate your trust and look forward to creating something beautiful for you.
              </p>
              
              <p style="font-size: 14.5px; line-height: 1.5; color: #4a4a4a; margin: 20px 0 0 0;">
                Warm Regards,<br>
                <strong>Digital Art Studio Team</strong>
              </p>
            </td>
          </tr>

          <!-- Footer Area -->
          <tr>
            <td align="center" style="padding: 24px; background-color: #faf9ff; border-top: 1px solid #e8e6f8; font-size: 12px; color: #888888; line-height: 1.6;">
              This is an automated transactional confirmation email from <strong>Digital Art Studio</strong>.<br>
              © 2026 Digital Art Studio. All rights reserved.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/* ─────────────────────────────────────────────────────────────────────────────
   TESTS
───────────────────────────────────────────────────────────────────────────── */

/**
 * testDoPost
 */
function testDoPost() {
  const sample = {
    name: 'Priya Sharma',
    whatsapp_number: '+91 98765 43210',
    email: 'priya@example.com',
    art_style: 'Watercolor Splash',
    name_in_art: 'Priya & Aarav',
    size: '8x11',
    imageUrls: [
      'https://res.cloudinary.com/demo/image/upload/sample1.jpg',
      'https://res.cloudinary.com/demo/image/upload/sample2.jpg',
    ],
    font_style: 'Great Vibes',
    art_color: 'Dusty Rose',
    border_style: '',
    bubble_text: '',
    custom_text: '',
    custom_signature: 'From Aarav with Love, 2026',
    payment: 'Paid',
    payment_id: 'PAY_TEST_12345'
  };

  const result = doPost({ postData: { contents: JSON.stringify(sample) } });
  Logger.log('testDoPost → ' + result.getContent());
}
