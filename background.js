import { CONFIG } from './config.js';

console.log("SiteAgent AI Background Service Worker Started.");

// Orchestrator state
const agentState = {};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'START_TASK') {
    const { task, tabId } = message;
    console.log(`Starting task on tab ${tabId}: ${task}`);
    
    // Start the agent loop
    agentState[tabId] = {
      task: task,
      step: 0,
      history: []
    };
    
    // Tell content script to show overlay and start observing
    chrome.tabs.sendMessage(tabId, {
      action: 'AGENT_INIT',
      task: task
    });
    
    sendResponse({ status: 'started' });
    
    // Kick off the loop
    runAgentLoop(tabId);
    
    return true; // Keep message channel open for async
  }
});

async function runAgentLoop(tabId) {
  // 1. Get DOM state from content script
  try {
    const pageState = await requestPageState(tabId);
    console.log("Page State Received:", pageState);
    
    // 2. Call LLM (Mock for now, will implement Gemini API call soon)
    const decision = await callLLM(agentState[tabId].task, pageState);
    console.log("LLM Decision:", decision);
    
    // 3. Execute action
    if (decision.action === 'done') {
      chrome.tabs.sendMessage(tabId, { action: 'AGENT_DONE', result: decision.result });
      return;
    }
    
    chrome.tabs.sendMessage(tabId, {
      action: 'AGENT_ACT',
      decision: decision
    });
    
  } catch (error) {
    console.error("Agent Loop Error:", error);
    chrome.tabs.sendMessage(tabId, { action: 'AGENT_ERROR', error: error.message });
  }
}

function requestPageState(tabId) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, { action: 'GET_PAGE_STATE' }, (response) => {
      if (chrome.runtime.lastError) {
        return reject(chrome.runtime.lastError);
      }
      resolve(response);
    });
  });
}

async function callLLM(task, pageState) {
  // MOCK IMPLEMENTATION for testing the pipeline
  // Real Gemini implementation will be added here
  return new Promise(resolve => {
    setTimeout(() => {
      resolve({
        action: 'wait',
        targetElementId: null,
        params: { reason: "Mock LLM thinking..." }
      });
    }, 1000);
  });
}
