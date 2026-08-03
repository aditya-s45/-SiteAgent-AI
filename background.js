// ==========================================
// SiteAgent AI v2.0 - Background Service Worker
// Two-Phase Orchestrator: Compile → Execute
// ==========================================

import { CONFIG } from './config.js';

console.log("SiteAgent AI v2.0 Background Service Worker started.");

// =============================================
// SYSTEM PROMPT: Instructs Gemini to generate
// semantic workflow scripts
// =============================================const SYSTEM_PROMPT = `You are SiteAgent AI, a script compiler for browser automation.

You receive a SEMANTIC SCHEMA of a webpage (elements classified by role) and a USER TASK.
You must generate a COMPLETE JSON automation script that accomplishes the task.

You must output ONLY a valid JSON array of command objects. No markdown formatting, no javascript, just JSON.

Command Object Format:
{ "action": "methodName", "args": ["arg1", "arg2"], "optional": false }

Available actions (methods on EventSimulator):

ELEMENT INTERACTION (by semantic role - works across page navigations):
  { "action": "typeInRole", "args": ["search_input", "campus shoes"] }
  { "action": "clickRole", "args": ["submit_button"] }
  { "action": "selectRole", "args": ["sort_control", "Low to High"] }

ELEMENT INTERACTION (by CSS selector or text):
  { "action": "type", "args": [".search-box", "text"] }
  { "action": "click", "args": ["#submit"] }
  { "action": "clickText", "args": ["Price: Low to High"] }

WAITING:
  { "action": "waitForNavigation" }
  { "action": "waitForRole", "args": ["cart_button"] }
  { "action": "sleep", "args": [1500] }

PROGRESS & RETURN:
  { "action": "reportProgress", "args": ["Searching..."] }
  { "action": "return", "args": ["Final success message"] }

CRITICAL RULES:
1. Output ONLY a valid JSON array. Do NOT wrap in \`\`\`json.
2. Use semantic roles (typeInRole, clickRole) whenever possible. They survive page navigations!
3. After any action that causes navigation, ALWAYS add a "waitForNavigation" command followed by "sleep" [1500].
4. To handle potential failures gracefully, set "optional": true on a command. If an optional command fails, the script continues.
5. Always end with a "return" action summarizing the result.`;

// =============================================
// STATE MANAGEMENT
// =============================================

const agentState = {};

// =============================================
// MESSAGE HANDLER: Receives commands from popup
// =============================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'START_COMPILE') {
    const { task, tabId } = message;
    console.log(`[SiteAgent] Starting compile-then-execute for tab ${tabId}: ${task}`);

    agentState[tabId] = {
      task: task,
      compiledScript: null,
      compileStartTime: Date.now(),
      executeStartTime: null
    };

    sendResponse({ status: 'started' });

    // Run the two-phase pipeline
    runCompileAndExecute(tabId, task);
    return true;
  }

  if (message.action === 'RE_RUN') {
    const { tabId } = message;
    const state = agentState[tabId];

    if (!state || !state.compiledScript) {
      sendResponse({ status: 'error', error: 'No compiled script to re-run' });
      return;
    }

    sendResponse({ status: 'started' });
    runExecutePhase(tabId, state.compiledScript);
    return true;
  }
});

// =============================================
// PHASE 1: COMPILE
// Scan page → classify elements → generate script
// =============================================

async function runCompileAndExecute(tabId, task) {
  try {
    // --- Phase 1: Compile ---
    broadcastToPopup('COMPILE_STATUS', { message: 'Initializing agent on page...' });

    // Initialize the overlay on the page
    await sendToTab(tabId, { action: 'AGENT_INIT', task: task });

    broadcastToPopup('COMPILE_STATUS', { message: 'Scanning page with ML classifier...' });

    // Get semantic schema from content script
    const schema = await sendToTabWithRetry(tabId, { action: 'COMPILE_SCAN' }, 3);

    if (schema.error) {
      throw new Error(`Page scan failed: ${schema.error}`);
    }

    console.log('[SiteAgent] Semantic Schema:', schema);
    broadcastToPopup('COMPILE_STATUS', {
      message: `Found ${schema.totalElements} elements. Generating automation script...`
    });

    // Call Gemini to generate the automation script
    const generatedScript = await generateScript(task, schema);

    const compileDuration = ((Date.now() - agentState[tabId].compileStartTime) / 1000).toFixed(1);
    agentState[tabId].compiledScript = generatedScript;

    console.log('[SiteAgent] Generated Script:', generatedScript);
    broadcastToPopup('COMPILE_DONE', {
      script: generatedScript,
      duration: compileDuration
    });

    // --- Phase 2: Execute ---
    await runExecutePhase(tabId, generatedScript);

  } catch (error) {
    console.error('[SiteAgent] Pipeline error:', error);
    broadcastToPopup('EXECUTE_ERROR', { error: error.message });
    sendToTab(tabId, { action: 'AGENT_ERROR', error: error.message });
  }
}

// =============================================
// PHASE 2: EXECUTE
// Run the generated script at raw JS speed
// =============================================

async function runExecutePhase(tabId, scriptCode) {
  try {
    agentState[tabId].executeStartTime = Date.now();
    broadcastToPopup('EXECUTE_STATUS', { step: 0, message: 'Executing automation script...' });

    // Re-initialize overlay in case of page change
    await sendToTab(tabId, { action: 'AGENT_INIT', task: agentState[tabId].task }).catch(() => {});

    // Send the script to the content script for execution
    const result = await sendToTabWithRetry(tabId, {
      action: 'EXECUTE_SCRIPT',
      script: scriptCode
    }, 2, 3000);

    const executeDuration = ((Date.now() - agentState[tabId].executeStartTime) / 1000).toFixed(1);

    if (result.success) {
      broadcastToPopup('EXECUTE_DONE', {
        result: result.result?.result || 'Task completed successfully',
        duration: executeDuration
      });
      sendToTab(tabId, {
        action: 'AGENT_DONE',
        result: result.result?.result || 'Task completed'
      });
    } else {
      throw new Error(result.error || 'Script execution failed');
    }

  } catch (error) {
    const executeDuration = ((Date.now() - (agentState[tabId]?.executeStartTime || Date.now())) / 1000).toFixed(1);
    broadcastToPopup('EXECUTE_ERROR', { error: error.message, duration: executeDuration });
    sendToTab(tabId, { action: 'AGENT_ERROR', error: error.message }).catch(() => {});
  }
}

// =============================================
// GEMINI API: Generate Semantic Workflow Script
// =============================================

async function generateScript(task, schema) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${CONFIG.GEMINI_API_KEY}`;

  // Build a concise representation of the schema for the prompt
  const schemaDescription = Object.entries(schema.schema)
    .map(([role, elements]) => {
      const examples = elements.slice(0, 5).map(el => {
        let desc = `[${el.tag}]`;
        if (el.text) desc += ` "${el.text}"`;
        if (el.ariaLabel) desc += ` aria="${el.ariaLabel}"`;
        if (el.name) desc += ` name="${el.name}"`;
        if (el.href) desc += ` href="${el.href}"`;
        return desc;
      });
      return `${role} (${elements.length} elements): ${examples.join(', ')}`;
    })
    .join('\n');

  const userPrompt = `
TASK: ${task}

CURRENT PAGE: ${schema.url}
PAGE TITLE: ${schema.title}
TOTAL INTERACTIVE ELEMENTS: ${schema.totalElements}

SEMANTIC SCHEMA (elements grouped by ML-classified role):
${schemaDescription}

Generate the JavaScript automation script body. Remember:
- Use sim.typeInRole(), sim.clickRole() for role-based interaction
- Use sim.waitForNavigation() + sim.sleep(1500) after navigation-causing actions
- Return { result: "summary of what was accomplished" }
- Output ONLY the script body, no function wrapper
`;

  const payload = {
    contents: [{
      role: "user",
      parts: [{ text: userPrompt }]
    }],
    systemInstruction: {
      role: "system",
      parts: [{ text: SYSTEM_PROMPT }]
    },
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 4096
    }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API Error ${response.status}: ${errText.substring(0, 200)}`);
  }

  const data = await response.json();

  if (!data.candidates || !data.candidates[0]?.content?.parts?.[0]?.text) {
    throw new Error('Gemini returned empty response');
  }

  let scriptText = data.candidates[0].content.parts[0].text;

  // Clean up: remove markdown code fences if present
  scriptText = scriptText
    .replace(/^```(?:javascript|js)?\s*\n?/gm, '')
    .replace(/\n?```\s*$/gm, '')
    .trim();

  return scriptText;
}

// =============================================
// UTILITY: Message passing helpers
// =============================================

function sendToTab(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        return reject(new Error(chrome.runtime.lastError.message));
      }
      resolve(response);
    });
  });
}

async function sendToTabWithRetry(tabId, message, maxRetries = 3, delay = 1500) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await sendToTab(tabId, message);
    } catch (e) {
      console.log(`[SiteAgent] Retry ${i + 1}/${maxRetries}: ${e.message}`);
      if (i < maxRetries - 1) {
        await new Promise(r => setTimeout(r, delay));
      } else {
        throw e;
      }
    }
  }
}

function broadcastToPopup(action, data) {
  chrome.runtime.sendMessage({ action, ...data }).catch(() => {
    // Popup might be closed, that's fine
  });
}
