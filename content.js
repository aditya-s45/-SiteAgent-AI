// ==========================================
// SiteAgent AI v2.0 - Content Script
// Semantic DOM Scanner + Script Executor
// ==========================================

console.log("SiteAgent AI v2.0 Content Script loaded.");

// =============================================
// DOM PERCEPTION: Scan & Tag Interactive Elements
// =============================================

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

/**
 * Extracts all interactive elements from the page,
 * tags them with siteagent IDs, and classifies them
 * using the ML classifier (heuristic MVP).
 */
function scanAndClassifyPage() {
  const selectors = [
    'a', 'button', 'input', 'select', 'textarea',
    '[role="button"]', '[role="link"]', '[role="checkbox"]',
    '[role="switch"]', '[role="menuitem"]', '[role="tab"]',
    '[role="searchbox"]', '[role="combobox"]',
    '[tabindex]:not([tabindex="-1"])',
    '[contenteditable="true"]'
  ].join(', ');

  const elements = [];
  let index = 0;

  document.querySelectorAll(selectors).forEach((el) => {
    if (!isVisible(el)) return;

    // Assign a stable ID to this element
    const id = `agent-el-${index}`;
    el.dataset.siteagentId = id;
    index++;

    // Classify the element using heuristic classifier
    let classification = { role: 'other', confidence: 0.5 };
    if (window.ElementClassifier) {
      classification = window.ElementClassifier.classifyElement(el);
    }

    // Tag the element with its semantic role for script execution
    el.dataset.siteagentRole = classification.role;

    // Clean up text for schema
    let text = (el.innerText || el.value || el.placeholder || '').trim();
    if (text.length > 80) text = text.substring(0, 80) + '...';

    const ariaLabel = el.getAttribute('aria-label') || '';

    elements.push({
      id: id,
      tag: el.tagName.toLowerCase(),
      type: el.type || undefined,
      role: classification.role,
      confidence: classification.confidence,
      text: text,
      ariaLabel: ariaLabel,
      name: el.getAttribute('name') || undefined,
      href: el.href ? (() => { try { return new URL(el.href).pathname; } catch(e) { return el.href; } })() : undefined,
      isEnabled: !el.disabled
    });
  });

  return elements;
}

/**
 * Build a semantic schema grouped by role.
 * This is what gets sent to Gemini for script generation.
 */
function buildSemanticSchema() {
  const elements = scanAndClassifyPage();
  const schema = {};

  elements.forEach(el => {
    if (!schema[el.role]) schema[el.role] = [];
    schema[el.role].push({
      id: el.id,
      tag: el.tag,
      type: el.type,
      text: el.text,
      ariaLabel: el.ariaLabel,
      name: el.name,
      href: el.href,
      confidence: el.confidence
    });
  });

  return {
    url: window.location.href,
    title: document.title,
    schema: schema,
    totalElements: elements.length,
    timestamp: Date.now()
  };
}

// =============================================
// UI OVERLAY: Phase-Aware Status Display
// =============================================

let overlayEl = null;

function createOverlay(task) {
  // Remove existing overlay if any
  removeOverlay();

  overlayEl = document.createElement('div');
  overlayEl.id = 'siteagent-overlay';
  
  const header = document.createElement('div');
  header.className = 'siteagent-header';
  header.textContent = '🧠 SiteAgent AI';
  
  const taskDiv = document.createElement('div');
  taskDiv.className = 'siteagent-task';
  taskDiv.textContent = 'Task: ';
  const span = document.createElement('span');
  span.textContent = task;
  taskDiv.appendChild(span);
  
  const phaseDiv = document.createElement('div');
  phaseDiv.className = 'siteagent-phase';
  phaseDiv.id = 'siteagent-phase';
  
  const statusDiv = document.createElement('div');
  statusDiv.className = 'siteagent-status';
  statusDiv.id = 'siteagent-status';
  statusDiv.textContent = 'Initializing...';
  
  overlayEl.appendChild(header);
  overlayEl.appendChild(taskDiv);
  overlayEl.appendChild(phaseDiv);
  overlayEl.appendChild(statusDiv);
  
  document.body.appendChild(overlayEl);
}

function removeOverlay() {
  if (overlayEl) {
    overlayEl.remove();
    overlayEl = null;
  }
  const existing = document.getElementById('siteagent-overlay');
  if (existing) existing.remove();
}

function updatePhase(phase, message) {
  const phaseEl = document.getElementById('siteagent-phase');
  if (!phaseEl) return;

  phaseEl.textContent = '';
  phaseEl.className = 'siteagent-phase';
  const badge = document.createElement('span');
  
  if (phase === 'compile') {
    badge.className = 'phase-badge compile';
    badge.textContent = '🧠 Phase 1: Compiling';
  } else if (phase === 'execute') {
    badge.className = 'phase-badge execute';
    badge.textContent = '⚡ Phase 2: Executing';
  }
  phaseEl.appendChild(badge);

  updateStatus(message || '');
}

function updateStatus(message) {
  const statusEl = document.getElementById('siteagent-status');
  if (statusEl) statusEl.textContent = message;
}

// Listen for progress events from the EventSimulator
window.addEventListener('siteagent-progress', (e) => {
  updateStatus(e.detail.message);
});

// =============================================
// SCRIPT EXECUTION ENGINE
// =============================================

/**
 * Execute a generated automation script in a controlled environment.
 * The script is a function body that receives a `sim` (EventSimulator) instance.
 */
async function executeGeneratedScript(scriptCode) {
  if (!window.EventSimulator) {
    throw new Error('EventSimulator not loaded');
  }

  const sim = new window.EventSimulator();

  try {
    // Parse the script code as a JSON array of commands
    // Remove markdown code fences if Gemini accidentally included them
    let cleanCode = scriptCode.trim();
    if (cleanCode.startsWith('```json')) cleanCode = cleanCode.substring(7);
    if (cleanCode.startsWith('```')) cleanCode = cleanCode.substring(3);
    if (cleanCode.endsWith('```')) cleanCode = cleanCode.substring(0, cleanCode.length - 3);
    
    const commands = JSON.parse(cleanCode);
    let finalResult = { success: true, result: "Task completed successfully." };

    for (const cmd of commands) {
      const { action, args = [], optional = false } = cmd;
      
      try {
        if (action === 'return') {
          finalResult = { result: args[0] };
          break;
        } else if (typeof sim[action] === 'function') {
          await sim[action](...args);
        } else {
          console.warn(`[SiteAgent] Unknown action: ${action}`);
        }
      } catch (e) {
        if (!optional) {
          throw new Error(`Step failed (${action}): ${e.message}`);
        }
      }
    }

    return finalResult;
  } catch (error) {
    throw new Error(`Script execution failed: ${error.message}`);
  }
}

// =============================================
// MESSAGE HANDLER: Bridge between background.js and page
// =============================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  let isAsync = false;

  try {
    switch (message.action) {
      case 'AGENT_INIT':
        createOverlay(message.task);
        sendResponse({ success: true });
        break;

      case 'COMPILE_SCAN':
        updatePhase('compile', 'Scanning page elements...');
        try {
          const schema = buildSemanticSchema();
          updateStatus(`Found ${schema.totalElements} interactive elements.`);
          sendResponse(schema);
        } catch (err) {
          sendResponse({ error: err.message });
        }
        break;

      case 'EXECUTE_SCRIPT':
        updatePhase('execute', 'Running automation script...');
        executeGeneratedScript(message.script)
          .then((result) => {
            updateStatus(`✅ Done: ${result.result || 'Task completed'}`);
            sendResponse({ success: true, result: result });
          })
          .catch((err) => {
            updateStatus(`❌ Error: ${err.message}`);
            sendResponse({ success: false, error: err.message });
          });
        isAsync = true;
        break;

      case 'RESCAN_PAGE':
        try {
          const newSchema = buildSemanticSchema();
          updateStatus(`Re-scanned: ${newSchema.totalElements} elements.`);
          sendResponse(newSchema);
        } catch (err) {
          sendResponse({ error: err.message });
        }
        break;

      case 'AGENT_DONE':
        updateStatus(`✅ ${message.result}`);
        sendResponse({ success: true });
        break;

      case 'AGENT_ERROR':
        updateStatus(`❌ ${message.error}`);
        sendResponse({ success: true });
        break;
      
      default:
        sendResponse({ error: "Unknown action" });
        break;
    }
  } catch (error) {
    console.error("[SiteAgent] Content script error:", error);
    sendResponse({ error: error.message });
  }

  return isAsync || true; // Always returning true is actually fine as long as we guarantee sendResponse is called!
});
