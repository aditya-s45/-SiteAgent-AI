// C:\Users\Aditya Shingare\.gemini\antigravity\scratch\SiteAgent-AI\ml\feature-extractor.js

const FEATURE_COUNT = 74;

function extractFeatures(element) {
  const features = new Float32Array(FEATURE_COUNT);
  let offset = 0;

  // Helper function for one-hot encoding
  const encodeOneHot = (value, categories) => {
    const index = categories.indexOf(value);
    for (let i = 0; i < categories.length; i++) {
      features[offset++] = (i === index) ? 1.0 : 0.0;
    }
    // If not found in specific categories, set the 'other' or 'none' flag if provided in categories
    if (index === -1) {
      if (categories.includes('other') && value !== 'none' && value !== null && value !== '') {
        features[offset - 1 - (categories.length - 1 - categories.indexOf('other'))] = 1.0;
      } else if (categories.includes('none')) {
        features[offset - 1 - (categories.length - 1 - categories.indexOf('none'))] = 1.0;
      }
    }
  };

  // Helper function for binary flag encoding based on keyword matching
  const encodeFlags = (text, keywords, exactMatchFor = []) => {
    const lowerText = (text || '').toLowerCase();
    keywords.forEach(kw => {
      if (exactMatchFor.includes(kw)) {
        features[offset++] = (lowerText === kw) ? 1.0 : 0.0;
      } else {
        features[offset++] = lowerText.includes(kw) ? 1.0 : 0.0;
      }
    });
  };

  // 1. Tag (8 features)
  const tagCategories = ['button', 'a', 'input', 'select', 'textarea', 'div', 'span', 'other'];
  let tag = element.tagName.toLowerCase();
  if (!tagCategories.slice(0, 7).includes(tag)) tag = 'other';
  encodeOneHot(tag, tagCategories);

  // 2. Input Type (12 features)
  const inputCategories = ['text', 'password', 'email', 'search', 'submit', 'checkbox', 'radio', 'number', 'tel', 'url', 'other', 'none'];
  let inputType = 'none';
  if (tag === 'input') {
    inputType = (element.getAttribute('type') || 'text').toLowerCase();
    if (!inputCategories.slice(0, 10).includes(inputType)) inputType = 'other';
  }
  encodeOneHot(inputType, inputCategories);

  // 3. Has Placeholder (1 feature)
  const placeholder = element.getAttribute('placeholder') || '';
  features[offset++] = placeholder.trim().length > 0 ? 1.0 : 0.0;

  // 4. Placeholder Keywords (8 features)
  const placeholderKeywords = ['search', 'email', 'password', 'username', 'name', 'phone', 'address', 'url'];
  encodeFlags(placeholder, placeholderKeywords);

  // 5. ARIA Role (10 features)
  const ariaCategories = ['button', 'link', 'textbox', 'listbox', 'searchbox', 'checkbox', 'menuitem', 'navigation', 'other', 'none'];
  let role = element.getAttribute('role');
  if (!role) {
      role = 'none';
  } else {
      role = role.toLowerCase();
      if (!ariaCategories.slice(0, 8).includes(role)) role = 'other';
  }
  encodeOneHot(role, ariaCategories);

  // 6. Text Keywords (18 features)
  const textKeywords = ['search', 'sign in', 'log in', 'submit', 'register', 'add to cart', 'buy', 'next', 'previous', 'sort', 'filter', 'close', 'cancel', 'delete', 'save', 'ok', 'yes', 'no'];
  const text = (element.innerText || element.value || '').toLowerCase();
  encodeFlags(text, textKeywords);

  // 7. Positioning & Dimensions (5 features)
  let rect = { x: 0, y: 0, width: 0, height: 0 };
  if (typeof element.getBoundingClientRect === 'function') {
      rect = element.getBoundingClientRect();
  }
  
  const windowWidth = window.innerWidth || 1024;
  const windowHeight = window.innerHeight || 768;
  
  features[offset++] = Math.max(0, Math.min(rect.x / windowWidth, 1.0)); // positionX
  features[offset++] = Math.max(0, Math.min(rect.y / windowHeight, 1.0)); // positionY
  features[offset++] = Math.max(0, Math.min(rect.width / windowWidth, 1.0)); // width
  features[offset++] = Math.max(0, Math.min(rect.height / windowHeight, 1.0)); // height
  features[offset++] = rect.height > 0 ? Math.min(rect.width / rect.height, 100) : 0; // aspectRatio

  // 8. Context (3 features)
  const isInForm = element.closest('form') !== null;
  const isInNav = element.closest('nav, header') !== null;
  const isInFooter = element.closest('footer') !== null;
  features[offset++] = isInForm ? 1.0 : 0.0;
  features[offset++] = isInNav ? 1.0 : 0.0;
  features[offset++] = isInFooter ? 1.0 : 0.0;

  // 9. Child Count (1 feature)
  // Normalized child count (capped at 50)
  features[offset++] = Math.min((element.childElementCount || 0) / 50.0, 1.0);

  // 10. Name Keywords (7 features)
  const nameAttr = element.getAttribute('name') || '';
  const nameKeywords = ['q', 'query', 'search', 'email', 'password', 'username', 'login'];
  
  // Exact match required for short variables like 'q' to avoid false positives
  encodeFlags(nameAttr, nameKeywords, ['q']);

  return features;
}

function extractFeaturesForAll(elements) {
  return elements.map(el => extractFeatures(el));
}

// Export for browser environment
if (typeof window !== 'undefined') {
  window.FeatureExtractor = { extractFeatures, extractFeaturesForAll, FEATURE_COUNT };
}

// Export for Node/CommonJS (if needed for testing)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { extractFeatures, extractFeaturesForAll, FEATURE_COUNT };
}
