/**
 * js/products.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Product configurations, upload limits, and dynamic form renderers.
 */

// Dynamic image limit defaults
const DEFAULT_IMAGE_LIMITS = {
  single: 1,
  couple: 2,
  mom: 3,
  dad: 3,
  baby: 4,
  sibling: 4,
  siblings: 4,
  family: 5, // Default family limit (overridable)
  friends: 5,
  grandparents: 4,
  grandparent: 4,
  love: 4,
  home: 4,
  dog: 3,
  cat: 3,
  pet: 3,
  default: 1
};

// Subfolders that represent multi-person (2+) products
const MULTI_PERSON_SUBFOLDERS = new Set([
  'couple', 'family', 'friends', 'siblings', 'sibling',
  'mom', 'dad', 'grandparents', 'grandparent', 'love',
  'bff', 'group', 'brother', 'sister',
]);

/**
 * Resolves the dynamic upload limit for a given product catalog object.
 * Checks for product config property definitions first, then applies dynamic defaults.
 *
 * @param {object} product - Product catalog database entry.
 * @returns {number}
 */
export function getProductImageLimit(product) {
  if (!product) return 1;

  // 1. Check if the product catalog entry defines explicit required/max limits.
  // This satisfies "Allow product configuration to define required image count. Do not hardcode limits."
  if (product.requiredPhotos !== undefined && product.requiredPhotos !== null) {
    return parseInt(product.requiredPhotos, 10);
  }
  if (product.maxPhotos !== undefined && product.maxPhotos !== null) {
    return parseInt(product.maxPhotos, 10);
  }

  // 2. Check by subfolder name (lowercased)
  const sub = (product.subfolder || '').toLowerCase();
  if (DEFAULT_IMAGE_LIMITS[sub] !== undefined) {
    return DEFAULT_IMAGE_LIMITS[sub];
  }

  // 3. Fallback based on multi-person category checks
  if (MULTI_PERSON_SUBFOLDERS.has(sub)) {
    return 5;
  }

  return DEFAULT_IMAGE_LIMITS.default;
}

/**
 * Check if a category represents Word Art (special text handling).
 * @param {string} category
 * @returns {boolean}
 */
export function isWordArt(category) {
  return (category || '').toLowerCase() === 'wordart';
}

/* ── HTML option components shared between products ──────────────────── */
const FONT_OPTIONS = `
  <option value="">— Select Font Style —</option>
  <option value="Great Vibes" style="font-family:'Great Vibes'">Great Vibes</option>
  <option value="Pinyon Script" style="font-family:'Pinyon Script'">Pinyon Script</option>
  <option value="Tangerine" style="font-family:'Tangerine'">Tangerine</option>
  <option value="Sacramento" style="font-family:'Sacramento'">Sacramento</option>
  <option value="Allura" style="font-family:'Allura'">Allura</option>
  <option value="Alex Brush" style="font-family:'Alex Brush'">Alex Brush</option>
  <option value="Pacifico" style="font-family:'Pacifico'">Pacifico</option>
  <option value="Caveat" style="font-family:'Caveat'">Caveat</option>
  <option value="Dancing Script" style="font-family:'Dancing Script'">Dancing Script</option>
  <option value="Kaushan Script" style="font-family:'Kaushan Script'">Kaushan Script</option>
  <option value="Yellowtail" style="font-family:'Yellowtail'">Yellowtail</option>
  <option value="Satisfy" style="font-family:'Satisfy'">Satisfy</option>`;

const SIZE_OPTIONS = `
  <option value="">— Select Size —</option>
  <option value="4x6">4 × 6 in</option>
  <option value="5x7">5 × 7 in</option>
  <option value="8x11">8 × 11 in</option>
  <option value="11x14">11 × 14 in</option>
  <option value="16x20">16 × 20 in</option>`;

const COLOUR_OPTIONS = `
  <option value="">— Select Colour Theme —</option>
  <option value="Terracotta Orange">Terracotta Orange</option>
  <option value="Dusty Rose">Dusty Rose</option>
  <option value="Sage Green">Sage Green</option>
  <option value="Navy Blue">Navy Blue</option>
  <option value="Warm Mustard">Warm Mustard</option>
  <option value="Dusty Purple">Dusty Purple</option>
  <option value="Slate Blue">Slate Blue</option>
  <option value="Blush Pink">Blush Pink</option>
  <option value="Forest Green">Forest Green</option>
  <option value="Warm Mocha">Warm Mocha</option>`;

/**
 * Returns trailing fields template.
 * @param {boolean} includeSignature
 * @returns {string}
 */
function getTrailingFields(includeSignature = true) {
  return `
    ${includeSignature ? `
    <div class="form-grid single" style="margin-top:14px;">
      <div class="form-group">
        <label class="form-label" for="customSignature">Custom Signature <span class="req">*</span></label>
        <input type="text" id="customSignature" class="form-control" placeholder="e.g. From Aarav with Love, 2026" required />
        <span class="field-error" id="err-customSignature">Please enter your custom signature.</span>
      </div>
    </div>` : ''}
    <div class="form-grid single" style="margin-top:14px;">
      <div class="form-group">
        <label class="form-label" for="specialRequest">Special Request <span class="opt">(Optional)</span></label>
        <textarea id="specialRequest" class="form-control" rows="3" placeholder="Any special instructions, background preferences, colour notes, etc."></textarea>
      </div>
    </div>`;
}

/**
 * Returns dynamic fields layout HTML for the chosen product category.
 *
 * Requirements:
 * - Watercolor Splash: Name, Size, Font Style
 * - Watercolor Pastel: Name, Size, Font Style
 * - Line Art Portrait (or lineart): Name, Size, Font Style
 * - Caricature: Name, Size, Font Style, Bubble Text (optional)
 * - Pet Line Art: Name, Size, Font Style, Border Style, Art Colour
 * - Word Art: Custom Sentence, Custom Signature
 *
 * @param {object} product - Active product catalog item
 * @returns {string}
 */
export function getProductDynamicFieldsHTML(product) {
  if (!product) return '';

  const cat = (product.category || '').toLowerCase();

  // 1. Word Art
  if (isWordArt(cat)) {
    return `
      <div class="form-grid single">
        <div class="form-group">
          <label class="form-label" for="customSentence">Custom Sentence / Collage Text <span class="req">*</span>
            <span class="opt">(The words that form the portrait shape)</span>
          </label>
          <input type="text" id="customSentence" class="form-control" placeholder="e.g. MOM, LOVE, FAMILY, BABY" required />
          <span class="field-error" id="err-customSentence">Please enter the custom sentence or collage words.</span>
        </div>
      </div>
      ${getTrailingFields(true)}`;
  }

  // 2. Pet Line Art
  if (cat === 'pet lineart') {
    return `
      <div class="form-grid">
        <div class="form-group">
          <label class="form-label" for="customName">Custom Name on Artwork <span class="req">*</span></label>
          <input type="text" id="customName" class="form-control" placeholder="e.g. Bruno, Luna, Max" required />
          <span class="field-error" id="err-customName">Please enter the name for the artwork.</span>
        </div>
        <div class="form-group">
          <label class="form-label" for="artworkSize">Artwork Size <span class="req">*</span></label>
          <select id="artworkSize" class="form-control" required>${SIZE_OPTIONS}</select>
          <span class="field-error" id="err-artworkSize">Please select artwork size.</span>
        </div>
      </div>
      <div class="form-grid" style="margin-top:14px;">
        <div class="form-group">
          <label class="form-label" for="fontStyle">Font Style <span class="req">*</span></label>
          <select id="fontStyle" class="form-control" required>${FONT_OPTIONS}</select>
          <span class="field-error" id="err-fontStyle">Please select a font style.</span>
        </div>
        <div class="form-group">
          <label class="form-label" for="borderStyle">Border Style <span class="req">*</span></label>
          <select id="borderStyle" class="form-control" required>
            <option value="">— Select Border Style —</option>
            <option value="No Border">No Border (Clean)</option>
            <option value="Thin Line Border">Thin Line Border</option>
            <option value="Floral Decorative Border">Floral / Decorative Border</option>
            <option value="Paw Print Border">Paw Print Border</option>
          </select>
          <span class="field-error" id="err-borderStyle">Please select a border style.</span>
        </div>
      </div>
      <div class="form-grid single" style="margin-top:14px;">
        <div class="form-group">
          <label class="form-label" for="artColour">Art Colour Theme <span class="req">*</span></label>
          <select id="artColour" class="form-control" required>${COLOUR_OPTIONS}</select>
          <span class="field-error" id="err-artColour">Please select a colour theme.</span>
        </div>
      </div>
      ${getTrailingFields(false)}`;
  }

  // 3. Caricature
  if (cat === 'caricature') {
    return `
      <div class="form-grid">
        <div class="form-group">
          <label class="form-label" for="customName">Custom Name on Artwork <span class="req">*</span></label>
          <input type="text" id="customName" class="form-control" placeholder="e.g. Rahul &amp; Priya" required />
          <span class="field-error" id="err-customName">Please enter the name for the artwork.</span>
        </div>
        <div class="form-group">
          <label class="form-label" for="artworkSize">Artwork Size <span class="req">*</span></label>
          <select id="artworkSize" class="form-control" required>${SIZE_OPTIONS}</select>
          <span class="field-error" id="err-artworkSize">Please select artwork size.</span>
        </div>
      </div>
      <div class="form-grid" style="margin-top:14px;">
        <div class="form-group">
          <label class="form-label" for="fontStyle">Font Style <span class="req">*</span></label>
          <select id="fontStyle" class="form-control" required>${FONT_OPTIONS}</select>
          <span class="field-error" id="err-fontStyle">Please select a font style.</span>
        </div>
        <div class="form-group">
          <label class="form-label" for="bubbleText">Bubble Effect Text <span class="opt">(Optional)</span></label>
          <input type="text" id="bubbleText" class="form-control" placeholder="e.g. Happy Birthday! · BFFs Forever" />
        </div>
      </div>
      ${getTrailingFields(false)}`;
  }

  // 4. Default: Watercolor Splash / Watercolor Pastel / Line Art / Anime
  return `
    <div class="form-grid">
      <div class="form-group">
        <label class="form-label" for="customName">Custom Name on Artwork <span class="req">*</span></label>
        <input type="text" id="customName" class="form-control" placeholder="e.g. Priya · Aarav &amp; Kiara" required />
        <span class="field-error" id="err-customName">Please enter the name for the artwork.</span>
      </div>
      <div class="form-group">
        <label class="form-label" for="artworkSize">Artwork Size <span class="req">*</span></label>
        <select id="artworkSize" class="form-control" required>${SIZE_OPTIONS}</select>
        <span class="field-error" id="err-artworkSize">Please select artwork size.</span>
      </div>
    </div>
    <div class="form-grid single" style="margin-top:14px;">
      <div class="form-group">
        <label class="form-label" for="fontStyle">Font Style <span class="req">*</span></label>
        <select id="fontStyle" class="form-control" required>${FONT_OPTIONS}</select>
        <span class="field-error" id="err-fontStyle">Please select a font style.</span>
      </div>
    </div>
    ${getTrailingFields(false)}`;
}
