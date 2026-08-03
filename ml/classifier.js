// C:\Users\Aditya Shingare\.gemini\antigravity\scratch\SiteAgent-AI\ml\classifier.js

const ROLES = [
  'search_input', 'login_input', 'password_input', 'generic_input',
  'search_button', 'submit_button', 'login_button', 'cart_button',
  'navigation_link', 'content_link', 'sort_control', 'filter_control',
  'dropdown_select', 'checkbox_toggle', 'close_button', 'pagination_link',
  'other'
];

/**
 * Heuristic-based element classifier for SiteAgent AI MVP.
 * Uses hand-crafted rules based on element attributes, text, and context.
 * 
 * @param {HTMLElement} element - The DOM element to classify
 * @returns {Object} { role: string, confidence: number }
 */
function classifyElement(element) {
  let bestRole = 'other';
  let bestConfidence = 0.0;

  // Helper to safely update the best role if confidence is higher
  const updateBest = (role, confidence) => {
    if (confidence > bestConfidence) {
      bestRole = role;
      bestConfidence = confidence;
    }
  };

  // Safely extract properties
  const tag = element.tagName.toLowerCase();
  const type = (element.getAttribute('type') || '').toLowerCase();
  const name = (element.getAttribute('name') || '').toLowerCase();
  const placeholder = (element.getAttribute('placeholder') || '').toLowerCase();
  const text = (element.innerText || element.value || '').trim().toLowerCase();
  const ariaLabel = (element.getAttribute('aria-label') || '').toLowerCase();
  
  // Handle SVG className which is an object
  const className = element.className;
  const classString = (typeof className === 'string' ? className : (className?.baseVal || '')).toLowerCase();

  const isInput = tag === 'input';
  const isButton = tag === 'button' || (isInput && ['submit', 'button'].includes(type));
  const isLink = tag === 'a';
  const isSelect = tag === 'select';
  const isTextarea = tag === 'textarea';

  // --- 1. Search Inputs ---
  if (isInput) {
    if (type === 'search') {
      updateBest('search_input', 0.95);
    } else if (name.includes('search') || name === 'q' || name === 'query') {
      updateBest('search_input', 0.90);
    } else if (placeholder.includes('search') || ariaLabel.includes('search')) {
      updateBest('search_input', 0.85);
    } else if (classString.includes('search')) {
      updateBest('search_input', 0.80);
    }
  }

  // --- 2. Password Inputs ---
  if (isInput && type === 'password') {
    updateBest('password_input', 0.99); // Highly confident
  }

  // --- 3. Login Inputs ---
  if (isInput) {
    if (type === 'email' && (classString.includes('login') || classString.includes('sign'))) {
      updateBest('login_input', 0.90);
    } else if (name.includes('email') || name.includes('username') || name.includes('login') || name === 'id') {
      updateBest('login_input', 0.85);
    } else if (placeholder.includes('email') || placeholder.includes('username')) {
      updateBest('login_input', 0.80);
    }
  }

  // --- 4. Generic Inputs ---
  if (isInput && !['submit', 'button', 'checkbox', 'radio', 'hidden', 'image', 'file'].includes(type)) {
    // If it hasn't been strongly identified as search/password/login, it's a generic input
    updateBest('generic_input', 0.50);
  }
  if (isTextarea) {
    updateBest('generic_input', 0.60);
  }

  // --- 5. Search Buttons ---
  if (isButton) {
    if (text === 'search' || ariaLabel.includes('search') || name.includes('search')) {
      updateBest('search_button', 0.90);
    } else if (classString.includes('search-btn') || classString.includes('search-button') || element.closest('form[action*="search"]')) {
      updateBest('search_button', 0.85);
    }
  }

  // --- 6. Login Buttons ---
  if (isButton || isLink) {
    if (['sign in', 'log in', 'login', 'signin'].includes(text)) {
      updateBest('login_button', 0.95);
    } else if (text.includes('sign in') || text.includes('log in') || ariaLabel.includes('sign in')) {
      updateBest('login_button', 0.85);
    }
  }

  // --- 7. Cart Buttons ---
  if (isButton || isLink) {
    if (text.includes('add to cart') || text.includes('buy now') || text.includes('checkout')) {
      updateBest('cart_button', 0.95);
    } else if (ariaLabel.includes('cart') || classString.includes('add-to-cart')) {
      updateBest('cart_button', 0.80);
    }
  }

  // --- 8. Submit Buttons ---
  if (isButton) {
    if (type === 'submit') {
      updateBest('submit_button', 0.80);
    }
    if (['submit', 'save', 'send', 'register', 'continue', 'next'].includes(text)) {
      updateBest('submit_button', 0.85);
    }
    if (element.closest('form')) {
      updateBest('submit_button', 0.60); // Weak fallback for buttons in forms
    }
  }

  // --- 9. Navigation Links ---
  if (isLink) {
    if (element.closest('nav') || element.closest('header')) {
      updateBest('navigation_link', 0.85);
    } else if (classString.includes('nav-link') || classString.includes('menu-item')) {
      updateBest('navigation_link', 0.80);
    }
  }

  // --- 10. Sort Controls ---
  if (isSelect || isButton || isLink) {
    if (text.includes('sort by') || ariaLabel.includes('sort') || name.includes('sort')) {
      updateBest('sort_control', 0.90);
    }
  }

  // --- 11. Filter Controls ---
  if (isInput && (type === 'checkbox' || type === 'radio')) {
    if (element.closest('.filter') || classString.includes('filter')) {
      updateBest('filter_control', 0.85);
    }
  }
  if (isButton && (text.includes('filter') || ariaLabel.includes('filter'))) {
    updateBest('filter_control', 0.90);
  }

  // --- 12. Dropdown Select ---
  if (isSelect) {
    updateBest('dropdown_select', 0.80); // Base confidence for any select element
  }

  // --- 13. Checkbox/Toggle ---
  if (isInput && (type === 'checkbox' || type === 'radio')) {
    updateBest('checkbox_toggle', 0.70);
  }

  // --- 14. Close Buttons ---
  if (isButton || isLink) {
    if (['close', 'x', 'cancel'].includes(text) || ariaLabel.includes('close')) {
      updateBest('close_button', 0.90);
    } else if (classString.includes('close') || classString.includes('dismiss')) {
      updateBest('close_button', 0.80);
    }
  }

  // --- 15. Pagination Links ---
  if (isLink || isButton) {
    if (['next', 'previous', 'prev'].includes(text) || ariaLabel.includes('next page') || ariaLabel.includes('previous page')) {
      updateBest('pagination_link', 0.90);
    } else if (classString.includes('page-link') || element.closest('.pagination')) {
      updateBest('pagination_link', 0.85);
    }
  }

  // --- 16. Content Links ---
  if (isLink) {
    updateBest('content_link', 0.50); // Fallback for links
  }

  return { role: bestRole, confidence: bestConfidence };
}

/**
 * Classify multiple elements.
 * @param {Array<HTMLElement>} elements 
 * @returns {Array<Object>}
 */
function classifyAll(elements) {
  return elements.map(el => classifyElement(el));
}

/**
 * Groups classified elements by role to build a semantic schema of the page.
 * Inject data-siteagent-id if missing for tracking.
 * 
 * @param {Array<HTMLElement>} elements 
 * @returns {Object} schema categorized by role
 */
function buildSemanticSchema(elements) {
  const schema = {};
  ROLES.forEach(role => schema[role] = []);

  elements.forEach((el, index) => {
    const classification = classifyElement(el);
    
    // Only include elements we have some confidence about, or keep all for completeness
    if (classification.role !== 'other' || classification.confidence > 0) {
      let id = el.getAttribute('data-siteagent-id');
      if (!id) {
          id = `agent-el-${index}-${Date.now()}`;
          el.setAttribute('data-siteagent-id', id);
      }
      
      schema[classification.role].push({
        selector: `[data-siteagent-id="${id}"]`,
        text: (el.innerText || el.value || '').trim().substring(0, 50),
        confidence: classification.confidence
      });
    }
  });

  return schema;
}

// Export for browser environment
if (typeof window !== 'undefined') {
  window.ElementClassifier = { classifyElement, classifyAll, buildSemanticSchema, ROLES };
}

// Export for Node/CommonJS (if needed for testing)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { classifyElement, classifyAll, buildSemanticSchema, ROLES };
}
