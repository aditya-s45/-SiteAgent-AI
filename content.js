// ==========================================
// SiteAgent AI - Content Script
// Handles DOM perception and Action execution
// ==========================================

console.log("SiteAgent AI Content Script injected.");


// --- DOM Perception Engine ---

function isVisible(el) {
  const rect = el.getBoundingClientRect();
  const style = window.getComputedStyle(el);
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    style.visibility !== 'hidden' &&
    style.display !== 'none' &&
    style.opacity !== '0'
  );
}

function extractInteractiveElements() {
  const elements = [];
  // Comprehensive selectors for interactive elements
  const selectors = 'a, button, input, select, textarea, [role="button"], [role="link"], [role="checkbox"], [role="switch"], [tabindex]:not([tabindex="-1"])';
  
  document.querySelectorAll(selectors).forEach((el, index) => {
    if (!isVisible(el)) return;
    
    // Check if it's already tagged to avoid duplicates or issues
    if (!el.dataset.siteagentId) {
      el.dataset.siteagentId = `agent-el-${index}`;
    }
    
    // Clean up text content
    let text = (el.innerText || el.value || el.placeholder || '').trim();
    if (text.length > 100) {
      text = text.substring(0, 100) + '...';
    }
    
    // Get aria label if present
    const ariaLabel = el.getAttribute('aria-label') || '';
    
    elements.push({
      id: el.dataset.siteagentId,
      tag: el.tagName.toLowerCase(),
      type: el.type || undefined,
      role: el.getAttribute('role') || undefined,
      text: text,
      ariaLabel: ariaLabel,
      href: el.href ? new URL(el.href).pathname : undefined,
      isEnabled: !el.disabled
    });
  });
  
  return elements;
}

function buildPageState() {
  const interactiveElements = extractInteractiveElements();
  
  // Create a simplified representation of the page
  return {
    url: window.location.href,
    title: document.title,
    elements: interactiveElements
  };
}

// --- UI Overlay ---
let overlayEl = null;

function createOverlay(task) {
  if (overlayEl) return;
  
  overlayEl = document.createElement('div');
  overlayEl.id = 'siteagent-overlay';
  overlayEl.innerHTML = `
    <div class="siteagent-header">🤖 SiteAgent AI</div>
    <div class="siteagent-task">Task: <span>${task}</span></div>
    <div class="siteagent-status" id="siteagent-status">Initializing...</div>
  `;
  document.body.appendChild(overlayEl);
}

function updateOverlayStatus(status) {
  if (!overlayEl) return;
  const statusEl = document.getElementById('siteagent-status');
  if (statusEl) statusEl.textContent = status;
}

// --- Message Listener ---

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'AGENT_INIT') {
    createOverlay(message.task);
    sendResponse({ success: true });
  } 
  else if (message.action === 'GET_PAGE_STATE') {
    updateOverlayStatus("Scanning page...");
    const state = buildPageState();
    sendResponse(state);
  }
  else if (message.action === 'AGENT_ACT') {
    updateOverlayStatus(`Executing: ${message.decision.action}`);
    executeAction(message.decision)
      .then(() => {
        sendResponse({ success: true });
      })
      .catch((err) => {
        sendResponse({ success: false, error: err.message });
      });
    return true; // Keep channel open for async response
  }
  else if (message.action === 'AGENT_DONE') {
    updateOverlayStatus(`✅ Done: ${message.result}`);
  }
  else if (message.action === 'AGENT_ERROR') {
    updateOverlayStatus(`❌ Error: ${message.error}`);
  }
  return true;
});

// --- Action Executor ---

async function executeAction(decision) {
  const { action, targetElementId, params } = decision;
  
  if (action === 'navigate') {
    window.location.href = params.url;
    return;
  }
  
  const targetEl = document.querySelector(`[data-siteagent-id="${targetElementId}"]`);
  if (!targetEl && action !== 'wait') {
    throw new Error(`Element ${targetElementId} not found`);
  }
  
  // Highlight element to show the user what the agent is doing
  if (targetEl) highlightElement(targetEl);

  switch (action) {
    case 'click':
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await new Promise(r => setTimeout(r, 500));
      targetEl.click();
      break;
    case 'type':
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await new Promise(r => setTimeout(r, 500));
      targetEl.focus();
      targetEl.value = params.text;
      // Dispatch events to trigger framework listeners (React, Angular, etc.)
      targetEl.dispatchEvent(new Event('input', { bubbles: true }));
      targetEl.dispatchEvent(new Event('change', { bubbles: true }));
      break;
    case 'wait':
      await new Promise(r => setTimeout(r, params.duration || 2000));
      break;
    default:
      console.warn('Unknown action:', action);
  }
}

function highlightElement(el) {
  const originalOutline = el.style.outline;
  const originalTransition = el.style.transition;
  
  el.style.transition = 'outline 0.3s ease';
  el.style.outline = '4px solid #a855f7';
  
  setTimeout(() => {
    el.style.outline = originalOutline;
    el.style.transition = originalTransition;
  }, 2000);
}
