import { CONFIG } from './config.js';

console.log("SiteAgent AI Background Service Worker Started.");

const SYSTEM_PROMPT = `You are SiteAgent AI, an autonomous browser agent.
Your goal is to help the user complete a task on a webpage.
You are given the current state of the page, including a list of interactive elements.
Each element has a unique ID, tag, text, and role.
You must output a JSON object representing your next action.

Allowed actions:
- { "action": "click", "targetElementId": "agent-el-X" }
- { "action": "type", "targetElementId": "agent-el-X", "params": { "text": "value to type" } }
- { "action": "wait", "params": { "duration": 2000 } }
- { "action": "navigate", "params": { "url": "https://example.com" } }
- { "action": "done", "result": "A short summary of what was accomplished" }
- { "action": "fail", "reason": "Why the task cannot be completed" }

CRITICAL RULES:
1. ONLY output valid JSON. No markdown formatting, no backticks.
2. If you need to search, type into a search box, then click a search button or press enter.
3. Keep moving towards the goal step-by-step.
`;

// Orchestrator state
const agentState = {};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'START_TASK') {
    const { task, tabId } = message;
    console.log(`Starting task on tab ${tabId}: ${task}`);
    
    agentState[tabId] = {
      task: task,
      step: 0,
      history: []
    };
    
    chrome.tabs.sendMessage(tabId, {
      action: 'AGENT_INIT',
      task: task
    });
    
    sendResponse({ status: 'started' });
    runAgentLoop(tabId);
    return true;
  }
});

async function runAgentLoop(tabId) {
  const MAX_STEPS = 10;
  
  while (agentState[tabId].step < MAX_STEPS) {
    try {
      // Re-init overlay on every step (in case of navigation)
      chrome.tabs.sendMessage(tabId, { action: 'AGENT_INIT', task: agentState[tabId].task }, () => {
         let e = chrome.runtime.lastError; // Ignore if port closed
      });
      
      // 1. OBSERVE (Get DOM state) - with retry for slow page loads
      const pageState = await requestPageStateWithRetry(tabId, 4);
      console.log(`[Step ${agentState[tabId].step}] Page State Received`, pageState);
      
      // 2. THINK (Call LLM)
      const decision = await callLLM(agentState[tabId].task, pageState, agentState[tabId].history);
      console.log(`[Step ${agentState[tabId].step}] LLM Decision`, decision);
      
      agentState[tabId].history.push({
        step: agentState[tabId].step,
        decision: decision
      });
      
      // 3. ACT
      if (decision.action === 'done') {
        chrome.tabs.sendMessage(tabId, { action: 'AGENT_DONE', result: decision.result });
        return;
      }
      
      if (decision.action === 'fail') {
        chrome.tabs.sendMessage(tabId, { action: 'AGENT_ERROR', error: decision.reason });
        return;
      }
      
      await executeActionInTab(tabId, decision);
      
      agentState[tabId].step++;
      
      // Wait a bit for page to stabilize after action
      await new Promise(r => setTimeout(r, 1500));
      
    } catch (error) {
      console.error("Agent Loop Error:", error);
      chrome.tabs.sendMessage(tabId, { action: 'AGENT_ERROR', error: error.message });
      return;
    }
  }
  
  chrome.tabs.sendMessage(tabId, { action: 'AGENT_ERROR', error: "Max steps reached without completion." });
}

function requestPageState(tabId) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, { action: 'GET_PAGE_STATE' }, (response) => {
      if (chrome.runtime.lastError) {
        return reject(new Error(chrome.runtime.lastError.message));
      }
      resolve(response);
    });
  });
}

async function requestPageStateWithRetry(tabId, retries) {
  for (let i = 0; i < retries; i++) {
    try {
      return await requestPageState(tabId);
    } catch (e) {
      console.log(`Retry ${i+1}/${retries} getting page state...`);
      await new Promise(r => setTimeout(r, 1500));
    }
  }
  throw new Error("Could not contact content script after multiple retries. Page might still be loading.");
}

function executeActionInTab(tabId, decision) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, { action: 'AGENT_ACT', decision: decision }, (response) => {
      if (chrome.runtime.lastError) {
        const msg = chrome.runtime.lastError.message;
        if (msg.includes("closed") || msg.includes("receiving end does not exist")) {
           // Page is navigating, treat as success
           console.log("Port closed during action, assuming navigation.");
           return resolve();
        }
        return reject(new Error(msg));
      }
      if (response && response.success) {
        resolve();
      } else {
        reject(new Error(response ? response.error : 'Unknown error during action'));
      }
    });
  });
}

async function callLLM(task, pageState, history) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${CONFIG.GEMINI_API_KEY}`;
  
  // Truncate elements if too large, but for MVP let's assume it fits in context
  const userPrompt = `
    TASK: ${task}
    
    CURRENT PAGE URL: ${pageState.url}
    CURRENT PAGE TITLE: ${pageState.title}
    
    INTERACTIVE ELEMENTS:
    ${JSON.stringify(pageState.elements.slice(0, 50), null, 2)} // Limiting to top 50 for MVP speed
    
    HISTORY:
    ${JSON.stringify(history, null, 2)}
    
    What is the NEXT action?
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
      temperature: 0.1, // Low temp for deterministic JSON
      responseMimeType: "application/json"
    }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`LLM API Error: ${response.status} ${errText}`);
  }

  const data = await response.json();
  const textResponse = data.candidates[0].content.parts[0].text;
  
  let cleanText = textResponse.trim();
  const start = cleanText.indexOf('{');
  
  if (start !== -1) {
    let braceCount = 0;
    let inString = false;
    let escape = false;
    let foundEnd = false;
    
    for (let i = start; i < cleanText.length; i++) {
      const char = cleanText[i];
      if (inString) {
        if (escape) escape = false;
        else if (char === '\\') escape = true;
        else if (char === '"') inString = false;
      } else {
        if (char === '"') inString = true;
        else if (char === '{') braceCount++;
        else if (char === '}') braceCount--;
        
        if (braceCount === 0) {
          cleanText = cleanText.substring(start, i + 1);
          foundEnd = true;
          break;
        }
      }
    }
    if (!foundEnd) {
      // Truncated JSON
      cleanText = cleanText.substring(start) + '}'.repeat(braceCount);
    }
  }
  
  try {
    // Remove trailing commas
    cleanText = cleanText.replace(/,\s*([}\]])/g, '$1');
    return JSON.parse(cleanText);
  } catch (e) {
    throw new Error(`Parse Error: ${e.message} | Raw: ${cleanText}`);
  }
}

