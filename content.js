// ==========================================
// SiteAgent AI - Content Script
// Handles DOM perception and Action execution
// ==========================================

console.log("SiteAgent AI Content Script injected.");

// --- DOM Perception Engine ---

function extractInteractiveElements() {
  const elements = [];
  // Basic selectors for MVP
  const selectors = 'a, button, input, select, textarea';
  
  document.querySelectorAll(selectors).forEach((el, index) => {
    // Check if element is visible
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0 || el.style.visibility === 'hidden' || el.style.display === 'none') {
      return;
    }
    
    const id = `agent-el-${index}`;
    // Store id on the element for later interaction
    el.dataset.agentId = id;
    
    elements.push({
      id: id,
      tag: el.tagName.toLowerCase(),
      type: el.type || null,
      text: el.innerText || el.value || el.placeholder || '',
      ariaLabel: el.getAttribute('aria-label') || ''
    });
  });
  
  return elements;
}

function buildPageState() {
  return {
    url: window.location.href,
    title: document.title,
    interactiveElements: extractInteractiveElements()
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
    // Will implement actual clicking/typing later
    setTimeout(() => {
      sendResponse({ success: true });
    }, 500);
  }
  else if (message.action === 'AGENT_DONE') {
    updateOverlayStatus(`✅ Done: ${message.result}`);
  }
  else if (message.action === 'AGENT_ERROR') {
    updateOverlayStatus(`❌ Error: ${message.error}`);
  }
  return true;
});
