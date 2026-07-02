/**
 * Google Apps Script for Digital Art Studio Email Confirmation System.
 * 
 * Instructions:
 * 1. Open the Google Sheet linked to the Digital Art Studio system.
 * 2. Go to Extensions -> Apps Script.
 * 3. Copy-paste this file's contents into your Apps Script editor (e.g. Code.gs).
 * 4. Implement/merge this doPost(e) logic with your existing doPost(e) handler if you have one.
 * 5. Deploy the script as a Web App:
 *    - Click "Deploy" -> "New deployment"
 *    - Select type: "Web app"
 *    - Execute as: "Me"
 *    - Who has access: "Anyone"
 * 6. Copy the Web App URL and set it as GOOGLE_SCRIPT_URL in your Cloudflare Pages environment variables.
 */

/**
 * Handle incoming POST requests from Cloudflare Pages.
 */
function doPost(e) {
  try {
    const postData = JSON.parse(e.postData.contents);
    const action = e.parameter.action || postData.action;

    // Distinguish between sendEmail action and the default saveOrder sheet action
    if (action === 'sendEmail') {
      const result = sendConfirmationEmail(postData);
      return ContentService.createTextOutput(JSON.stringify(result))
                           .setMimeType(ContentService.MimeType.JSON);
    } else {
      // Default: If they are sharing the same script endpoint, let it fall through
      // to your sheet saving logic.
      // (This prevents breaking your existing script if it handles saveOrder under default post requests)
      if (typeof handleSaveOrder === 'function') {
        return handleSaveOrder(postData);
      }
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: "Action not recognized and no sheet-save handler defined."
      })).setMimeType(ContentService.MimeType.JSON);
    }
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: "Error processing request: " + err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
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
