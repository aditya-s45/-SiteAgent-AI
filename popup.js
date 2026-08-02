document.addEventListener('DOMContentLoaded', () => {
  const btnStart = document.getElementById('btnStart');
  const taskInput = document.getElementById('taskInput');
  const statusText = document.getElementById('statusText');

  btnStart.addEventListener('click', async () => {
    const task = taskInput.value.trim();
    if (!task) return;

    statusText.textContent = "Sending task to agent...";
    
    // Get current active tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length === 0) return;
      const tabId = tabs[0].id;
      
      // Send task to background script
      chrome.runtime.sendMessage({
        action: 'START_TASK',
        task: task,
        tabId: tabId
      }, (response) => {
        if (response && response.status === 'started') {
          statusText.textContent = "Agent is working on the task...";
        } else {
          statusText.textContent = "Failed to start agent.";
        }
      });
    });
  });
});
