/**
 * SiteAgent AI v2.0 Event Simulator Engine
 * 
 * Provides human-like event simulation for robust browser automation.
 * This script is designed to bypass basic bot detection and properly
 * trigger change detection in modern frontend frameworks (React, Angular, Vue).
 */

class EventSimulator {
  constructor() {
    this.framework = EventSimulator.detectFramework();
    this.reportProgress(`EventSimulator initialized for ${this.framework} application.`);
  }

  /**
   * Detects the underlying frontend framework of the page.
   * @returns {string} 'react', 'angular', 'vue', or 'vanilla'
   */
  static detectFramework() {
    if (window.__REACT_DEVTOOLS_GLOBAL_HOOK__ || 
        document.querySelector('[data-reactroot], [data-reactid]')) {
      return 'react';
    }
    if (window.ng || document.querySelector('[ng-version]')) {
      return 'angular';
    }
    if (window.__VUE__ || document.querySelector('[data-v-app]')) {
      return 'vue';
    }
    return 'vanilla';
  }

  /**
   * Reports progress to the extension UI via a CustomEvent.
   * @param {string} message The progress message
   */
  reportProgress(message) {
    window.dispatchEvent(new CustomEvent('siteagent-progress', { detail: { message } }));
    console.log(`[SiteAgent] ${message}`);
  }

  /**
   * Simple delay.
   * @param {number} ms Milliseconds to sleep
   * @returns {Promise<void>}
   */
  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Internal helper to find an element by selector, throws if not found.
   * @param {string} selector 
   * @returns {HTMLElement}
   */
  _findElement(selector) {
    const el = document.querySelector(selector);
    if (!el) {
      throw new Error(`Element not found for selector: ${selector}`);
    }
    return el;
  }

  /**
   * Internal helper to find an element by its semantic role attribute.
   * @param {string} role 
   * @returns {HTMLElement}
   */
  _findElementByRole(role) {
    return this._findElement(`[data-siteagent-role="${role}"]`);
  }

  /**
   * Internal helper to dispatch a mouse event.
   * @param {HTMLElement} element 
   * @param {string} eventType 
   * @param {object} options 
   */
  _dispatchMouseEvent(element, eventType, options = {}) {
    const event = new MouseEvent(eventType, {
      bubbles: true,
      cancelable: true,
      view: window,
      ...options
    });
    element.dispatchEvent(event);
  }

  /**
   * Internal helper to dispatch a keyboard event.
   * @param {HTMLElement} element 
   * @param {string} eventType 
   * @param {string} key 
   * @param {string} code 
   */
  _dispatchKeyEvent(element, eventType, key, code) {
    const event = new KeyboardEvent(eventType, {
      bubbles: true,
      cancelable: true,
      key: key,
      code: code,
      view: window
    });
    element.dispatchEvent(event);
  }

  /**
   * Sets value in a way that triggers React/Vue/Angular bindings.
   * @param {HTMLElement} element 
   * @param {string} value 
   */
  _setNativeValue(element, value) {
    const lastValue = element.value;
    element.value = value;
    
    // For React: bypass the overridden value setter
    let tracker = element._valueTracker;
    if (tracker) {
      tracker.setValue(lastValue);
    }
    
    const event = new Event('input', { bubbles: true });
    
    // Hack for React 16+ native input setter
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value'
    )?.set;
    
    const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      'value'
    )?.set;

    if (nativeInputValueSetter && element instanceof HTMLInputElement) {
        nativeInputValueSetter.call(element, value);
    } else if (nativeTextAreaValueSetter && element instanceof HTMLTextAreaElement) {
        nativeTextAreaValueSetter.call(element, value);
    }

    element.dispatchEvent(event);
    
    const changeEvent = new Event('change', { bubbles: true });
    element.dispatchEvent(changeEvent);
  }

  /**
   * Types text into an element character by character like a human.
   * @param {string} selector 
   * @param {string} text 
   */
  async type(selector, text) {
    this.reportProgress(`Typing into ${selector}`);
    const el = this._findElement(selector);
    el.focus();
    
    // Clear existing text first if needed
    this._setNativeValue(el, "");
    
    let currentText = "";
    for (const char of text) {
      this._dispatchKeyEvent(el, 'keydown', char, char);
      this._dispatchKeyEvent(el, 'keypress', char, char);
      
      currentText += char;
      this._setNativeValue(el, currentText);
      
      this._dispatchKeyEvent(el, 'keyup', char, char);
      
      // Random delay between 20-50ms
      const delay = Math.floor(Math.random() * 30) + 20;
      await this.sleep(delay);
    }
  }

  /**
   * Types text into an element found by its semantic role.
   * @param {string} role 
   * @param {string} text 
   */
  async typeInRole(role, text) {
    this.reportProgress(`Typing into role: ${role}`);
    await this.type(`[data-siteagent-role="${role}"]`, text);
  }

  /**
   * Simulates a full mouse click sequence on an element.
   * @param {string} selector 
   */
  async click(selector) {
    this.reportProgress(`Clicking ${selector}`);
    const el = this._findElement(selector);
    
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await this.sleep(300); // Wait for scroll
    
    this._dispatchMouseEvent(el, 'mouseover');
    this._dispatchMouseEvent(el, 'mouseenter');
    this._dispatchMouseEvent(el, 'mousemove');
    this._dispatchMouseEvent(el, 'mousedown');
    el.focus();
    this._dispatchMouseEvent(el, 'mouseup');
    this._dispatchMouseEvent(el, 'click');
  }

  /**
   * Clicks an element found by its semantic role.
   * @param {string} role 
   */
  async clickRole(role) {
    this.reportProgress(`Clicking role: ${role}`);
    await this.click(`[data-siteagent-role="${role}"]`);
  }

  /**
   * Finds any clickable element whose text content contains the given text and clicks it.
   * @param {string} text 
   */
  async clickText(text) {
    this.reportProgress(`Clicking text: "${text}"`);
    const elements = Array.from(document.querySelectorAll('button, a, [role="button"], input[type="button"], input[type="submit"]'));
    const el = elements.find(e => e.textContent.includes(text) || (e.value && e.value.includes(text)));
    
    if (!el) {
      throw new Error(`Clickable element containing text "${text}" not found`);
    }
    
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await this.sleep(300);
    
    this._dispatchMouseEvent(el, 'mouseover');
    this._dispatchMouseEvent(el, 'mouseenter');
    this._dispatchMouseEvent(el, 'mousemove');
    this._dispatchMouseEvent(el, 'mousedown');
    el.focus();
    this._dispatchMouseEvent(el, 'mouseup');
    this._dispatchMouseEvent(el, 'click');
  }

  /**
   * Simulates pressing the Enter key on an element.
   * @param {string} [selector] Optional. If not provided, uses active element.
   */
  async pressEnter(selector) {
    this.reportProgress(`Pressing Enter${selector ? ` on ${selector}` : ''}`);
    let el = document.activeElement;
    if (selector) {
      el = this._findElement(selector);
      el.focus();
    }
    
    this._dispatchKeyEvent(el, 'keydown', 'Enter', 'Enter');
    this._dispatchKeyEvent(el, 'keypress', 'Enter', 'Enter');
    this._dispatchKeyEvent(el, 'keyup', 'Enter', 'Enter');
  }

  /**
   * Selects an option from a dropdown by value or visible text.
   * @param {string} selector 
   * @param {string} value 
   */
  async select(selector, value) {
    this.reportProgress(`Selecting "${value}" from ${selector}`);
    const el = this._findElement(selector);
    
    if (el.tagName.toLowerCase() !== 'select') {
      throw new Error(`Element ${selector} is not a select dropdown`);
    }
    
    const options = Array.from(el.options);
    const targetOption = options.find(opt => opt.value === value || opt.textContent.includes(value));
    
    if (!targetOption) {
      throw new Error(`Option with value or text "${value}" not found in ${selector}`);
    }
    
    el.focus();
    this._dispatchMouseEvent(el, 'mousedown');
    
    el.value = targetOption.value;
    
    const event = new Event('change', { bubbles: true });
    el.dispatchEvent(event);
    
    const inputEvent = new Event('input', { bubbles: true });
    el.dispatchEvent(inputEvent);
    
    this._dispatchMouseEvent(el, 'mouseup');
    this._dispatchMouseEvent(el, 'click');
  }

  /**
   * Selects an option from a dropdown found by role.
   * @param {string} role 
   * @param {string} value 
   */
  async selectRole(role, value) {
    await this.select(`[data-siteagent-role="${role}"]`, value);
  }

  /**
   * Waits for navigation to occur (URL change or DOMContentLoaded).
   * @param {number} timeout Timeout in ms
   * @returns {Promise<void>}
   */
  async waitForNavigation(timeout = 10000) {
    this.reportProgress('Waiting for navigation...');
    return new Promise((resolve, reject) => {
      let resolved = false;
      const initialUrl = window.location.href;
      
      const timeoutId = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          reject(new Error(`Navigation timeout after ${timeout}ms`));
        }
      }, timeout);

      const checkUrlInterval = setInterval(() => {
        if (window.location.href !== initialUrl) {
          clearInterval(checkUrlInterval);
          if (!resolved) {
            resolved = true;
            clearTimeout(timeoutId);
            resolve();
          }
        }
      }, 100);

      const loadHandler = () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeoutId);
          clearInterval(checkUrlInterval);
          window.removeEventListener('DOMContentLoaded', loadHandler);
          window.removeEventListener('load', loadHandler);
          resolve();
        }
      };

      window.addEventListener('DOMContentLoaded', loadHandler);
      window.addEventListener('load', loadHandler);
    });
  }

  /**
   * Polls until an element appears in the DOM and is visible.
   * @param {string} selector 
   * @param {number} timeout 
   * @returns {Promise<HTMLElement>}
   */
  async waitForElement(selector, timeout = 10000) {
    this.reportProgress(`Waiting for element: ${selector}`);
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      
      const checkEl = () => {
        const el = document.querySelector(selector);
        if (el) {
          const style = window.getComputedStyle(el);
          if (style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0') {
            resolve(el);
            return;
          }
        }
        
        if (Date.now() - startTime >= timeout) {
          reject(new Error(`Timeout waiting for element: ${selector}`));
          return;
        }
        
        requestAnimationFrame(checkEl);
      };
      
      checkEl();
    });
  }

  /**
   * Polls until an element with the given role appears.
   * @param {string} role 
   * @param {number} timeout 
   * @returns {Promise<HTMLElement>}
   */
  async waitForRole(role, timeout = 10000) {
    return this.waitForElement(`[data-siteagent-role="${role}"]`, timeout);
  }

  /**
   * Gets the text content of the first matching element.
   * @param {string} selector 
   * @returns {Promise<string>}
   */
  async getText(selector) {
    const el = this._findElement(selector);
    return el.textContent.trim() || el.value || "";
  }

  /**
   * Gets an array of text contents of all matching elements.
   * @param {string} selector 
   * @returns {Promise<string[]>}
   */
  async getTexts(selector) {
    const elements = Array.from(document.querySelectorAll(selector));
    return elements.map(el => (el.textContent.trim() || el.value || ""));
  }
}

window.EventSimulator = EventSimulator;
