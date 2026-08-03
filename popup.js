document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const taskInput = document.getElementById('task-input');
  const compileRunBtn = document.getElementById('compile-run-btn');
  const reRunBtn = document.getElementById('re-run-btn');
  const phaseIndicator = document.getElementById('phase-indicator');
  const phase1 = document.getElementById('phase-1');
  const phase2 = document.getElementById('phase-2');
  const statusPanel = document.getElementById('status-panel');
  const statusMessage = document.getElementById('status-message');
  const codePreviewContainer = document.getElementById('code-preview-container');
  const codeHeader = document.getElementById('code-header');
  const codeContent = document.getElementById('code-content');
  const scriptContent = document.getElementById('script-content');
  const stats = document.getElementById('stats');
  const statCompile = document.getElementById('stat-compile');
  const statExecute = document.getElementById('stat-execute');
  const inputSection = document.getElementById('input-section');

  let activeTabId = null;
  
  // Timing
  let compileStartTime = 0;
  let executeStartTime = 0;

  // Initialize
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs && tabs.length > 0) {
      activeTabId = tabs[0].id;
    }
  });

  // Check if we have a cached script
  chrome.storage.local.get(['lastScript', 'lastTask'], (result) => {
    if (result.lastScript) {
      reRunBtn.classList.remove('hidden');
      if (result.lastTask) {
        taskInput.value = result.lastTask;
      }
    }
  });

  // Code preview toggle
  codeHeader.addEventListener('click', () => {
    codeContent.classList.toggle('collapsed');
    const chevron = codeHeader.querySelector('.chevron');
    if (codeContent.classList.contains('collapsed')) {
      chevron.style.transform = 'rotate(0deg)';
    } else {
      chevron.style.transform = 'rotate(180deg)';
    }
  });

  function setStatus(text, type = 'info') {
    statusPanel.classList.remove('hidden');
    statusMessage.textContent = text;
    statusMessage.className = `status-message ${type}`;
  }

  function showPhase(phase) {
    phaseIndicator.classList.remove('hidden');
    if (phase === 1) {
      phase1.classList.add('active');
      phase2.classList.remove('active');
      phase1.querySelector('.phase-text').innerHTML = 'Compiling<span class="dots">...</span>';
      phase2.querySelector('.phase-text').innerHTML = 'Executing';
    } else if (phase === 2) {
      phase1.classList.remove('active');
      phase2.classList.add('active');
      phase1.querySelector('.phase-text').innerHTML = 'Compiled';
      phase2.querySelector('.phase-text').innerHTML = 'Executing<span class="dots">...</span>';
    } else if (phase === 'done') {
      phase1.classList.remove('active');
      phase2.classList.remove('active');
      phase1.querySelector('.phase-text').innerHTML = 'Compiled';
      phase2.querySelector('.phase-text').innerHTML = 'Executed';
    }
  }

  function simpleHighlight(code) {
    // Very basic regex highlighter for demo purposes
    let highlighted = code
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/(\/\/[^\n]*)/g, '<span class="token-comment">$1</span>')
      .replace(/(['"`].*?['"`])/g, '<span class="token-string">$1</span>')
      .replace(/\b(const|let|var|function|async|await|return|if|else|for|while)\b/g, '<span class="token-keyword">$1</span>')
      .replace(/\b(click|type|waitFor)\b/g, '<span class="token-function">$1</span>');
    return highlighted;
  }

  // Compile & Run Button
  compileRunBtn.addEventListener('click', () => {
    const task = taskInput.value.trim();
    if (!task) {
      setStatus('Please enter a task.', 'error');
      return;
    }
    if (!activeTabId) {
      setStatus('No active tab found.', 'error');
      return;
    }

    // UI Updates
    compileRunBtn.disabled = true;
    compileRunBtn.style.opacity = '0.7';
    reRunBtn.classList.add('hidden');
    codePreviewContainer.classList.add('hidden');
    stats.classList.add('hidden');
    
    showPhase(1);
    setStatus('Analyzing page & compiling script...', 'working');
    
    compileStartTime = performance.now();
    chrome.storage.local.set({ lastTask: task });

    // Send to background
    chrome.runtime.sendMessage({
      action: 'START_COMPILE',
      task: task, 
      tabId: activeTabId
    });
  });

  // Re-run Button
  reRunBtn.addEventListener('click', () => {
    if (!activeTabId) return;

    compileRunBtn.disabled = true;
    reRunBtn.disabled = true;
    stats.classList.add('hidden');
    
    showPhase(2);
    setStatus('Re-executing cached script...', 'working');
    
    executeStartTime = performance.now();
    
    chrome.runtime.sendMessage({
      action: 'RE_RUN',
      tabId: activeTabId
    });
  });

  // Message Listener
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.action) {
      case 'COMPILE_STATUS':
        setStatus(message.message, 'working');
        break;
        
      case 'COMPILE_DONE':
        const compileEnd = performance.now();
        const compileSecs = ((compileEnd - compileStartTime) / 1000).toFixed(1);
        statCompile.textContent = compileSecs;
        
        // Save script
        chrome.storage.local.set({ lastScript: message.script });
        
        // Show script
        scriptContent.innerHTML = simpleHighlight(message.script);
        codePreviewContainer.classList.remove('hidden');
        
        // Move to phase 2
        showPhase(2);
        setStatus('Compilation successful. Starting execution...', 'info');
        executeStartTime = performance.now();
        break;

      case 'EXECUTE_STATUS':
        setStatus(message.message, 'working');
        break;

      case 'EXECUTE_DONE':
        const executeEnd = performance.now();
        const executeSecs = ((executeEnd - executeStartTime) / 1000).toFixed(1);
        statExecute.textContent = executeSecs;
        
        showPhase('done');
        setStatus(message.result || 'Execution completed successfully!', 'success');
        stats.classList.remove('hidden');
        
        compileRunBtn.disabled = false;
        compileRunBtn.style.opacity = '1';
        reRunBtn.classList.remove('hidden');
        reRunBtn.disabled = false;
        break;

      case 'EXECUTE_ERROR':
        showPhase('done');
        setStatus(`Error: ${message.error}`, 'error');
        
        compileRunBtn.disabled = false;
        compileRunBtn.style.opacity = '1';
        reRunBtn.disabled = false;
        break;
    }
  });
});
