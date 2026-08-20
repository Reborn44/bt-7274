let chatHistory = [];
let ttsEnabled = false;
let isProcessing = false;
let settings = { workerUrl: '', fishModelId: '' };

document.addEventListener('DOMContentLoaded', init);

function init() {
  loadSettings();
  loadChatHistory();
  updateUIState();
  
  if (chatHistory.length === 0) {
    // Inject welcome message if history is empty
    setTimeout(() => {
        appendMessage('bt', 'Pilot link established. BT-7274 online and fully operational.\n\nIt is good to have you back, Jack Cooper. All systems are nominal. Neural link confirmed at maximum fidelity. I am ready to assist with any tactical, informational, or conversational requirements you may have.\n\nAwaiting your orders, Pilot.', false, true);
        chatHistory.push({ role: 'assistant', content: 'Pilot link established. BT-7274 online and fully operational.' });
        saveChatHistory();
    }, 500);
  }
  
  // TTS button already uses onclick in HTML
  document.getElementById('messageInput')?.addEventListener('keydown', handleKeyDown);
  document.getElementById('messageInput')?.addEventListener('input', function() { autoResize(this); });
}

function loadSettings() {
  try {
    const saved = localStorage.getItem('bt_settings_v2');
    if (saved) settings = { ...settings, ...JSON.parse(saved) };
  } catch (e) { console.error("Error loading settings:", e); }
}

function saveSettings() {
  settings.workerUrl = document.getElementById('workerUrl').value.trim();
  if (settings.workerUrl.endsWith('/')) settings.workerUrl = settings.workerUrl.slice(0, -1);
  settings.fishModelId = document.getElementById('fishModelId').value.trim();
  
  localStorage.setItem('bt_settings_v2', JSON.stringify(settings));
  closeSettings();
  showToast('Configuration saved. Systems updated, Pilot.');
  updateUIState();
}

function loadChatHistory() {
  try {
    const saved = localStorage.getItem('bt_chat_history_v2');
    if (saved) {
      chatHistory = JSON.parse(saved);
      const feed = document.getElementById('chatFeed');
      if (feed) feed.innerHTML = '';
      chatHistory.forEach(msg => {
        appendMessage(msg.role === 'user' ? 'pilot' : 'bt', msg.content, false, false);
      });
    }
  } catch (e) { console.error("Error loading chat history:", e); }
}

function saveChatHistory() {
  localStorage.setItem('bt_chat_history_v2', JSON.stringify(chatHistory));
}

function updateUIState() {
  const dotEl = document.getElementById('statusDot');
  const labelEl = document.getElementById('statusLabel');
  
  if (settings.workerUrl) {
    dotEl.className = 'status-dot connected';
    labelEl.textContent = 'CONNECTED';
  } else {
    dotEl.className = 'status-dot error';
    labelEl.textContent = 'NO UPLINK - SETTINGS REQ';
  }
  
  const ttsInd = document.getElementById('ttsIndicator');
  if (ttsInd) {
    ttsInd.textContent = ttsEnabled ? 'TTS: ONLINE' : 'TTS: OFFLINE';
    ttsInd.classList.toggle('active', ttsEnabled);
  }
  document.getElementById('ttsBtn')?.classList.toggle('active', ttsEnabled);
}

function toggleTTS() {
  ttsEnabled = !ttsEnabled;
  updateUIState();
  showToast(`Voice synthesis ${ttsEnabled ? 'engaged' : 'disabled'}.`);
}

async function sendMessage() {
  const inputEl = document.getElementById('messageInput');
  const text = inputEl.value.trim();
  
  if (!text || isProcessing) return;
  
  appendMessage('pilot', text);
  chatHistory.push({ role: 'user', content: text });
  saveChatHistory();
  
  inputEl.value = '';
  inputEl.style.height = 'auto';
  setProcessing(true);
  
  try {
    const responseText = await callCloudMode(chatHistory);
    appendMessage('bt', responseText);
    chatHistory.push({ role: 'assistant', content: responseText });
    saveChatHistory();
    
    if (ttsEnabled) speakText(responseText);
  } catch (error) {
    console.error("Error in sendMessage:", error);
    appendMessage('bt', `System Error: ${error.message}`, true);
  } finally {
    setProcessing(false);
  }
}

async function callCloudMode(messages) {
  if (!settings.workerUrl) {
    throw new Error('Cloud Uplink URL not configured. Access Settings to configure connection.');
  }
  
  const res = await fetch(`${settings.workerUrl}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages })
  });
  
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `API error: ${res.status}`);
  return data.response;
}

function sendQuickMessage(text) {
  const inputEl = document.getElementById('messageInput');
  if (inputEl) {
    inputEl.value = text;
    sendMessage();
  }
}

function appendMessage(sender, text, isError = false, animate = true) {
  const feed = document.getElementById('chatFeed');
  if (!feed) return;
  
  const msgDiv = document.createElement('div');
  msgDiv.className = `message message--${sender}`;
  if (isError) msgDiv.classList.add('message--error');
  if (animate) msgDiv.classList.add('message--entering');
  
  let formattedText = text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>');
    
  const timeStr = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
  const senderLabel = sender === 'pilot' ? 'PILOT COOPER' : 'BT-7274';
  
  let contentHtml = '';
  
  if (sender === 'pilot') {
    contentHtml = `
      <div class="message-content-wrapper">
        <div class="message-bubble" style="flex-grow: 1;">
          <div class="message__header">
            <span class="message__time">${timeStr}</span>
            <span class="message__sender">${senderLabel}</span>
          </div>
          <div class="message__body" style="text-align: right;">${formattedText}</div>
        </div>
        <div class="pilot-avatar">
          <img src="assets/pilot_helmet.png" alt="Pilot Helmet" />
        </div>
      </div>
    `;
  } else {
    let footerHtml = `
      <div class="message__footer">
        <span>// VANGUARD-CLASS // AI RESPONSE</span>
        <button class="replay-btn" onclick="speakText(\`${text.replace(/`/g, "'")}\`)" title="Replay Audio">
          <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
        </button>
      </div>`;
      
    contentHtml = `
      <div class="message-bubble">
        <div class="message__header">
          <span class="message__sender">${senderLabel}</span>
          <span class="message__time">${timeStr}</span>
        </div>
        <div class="message__body">${formattedText}</div>
        ${footerHtml}
      </div>
    `;
  }
  
  msgDiv.innerHTML = contentHtml;
  feed.appendChild(msgDiv);
  if (animate) setTimeout(() => msgDiv.classList.remove('message--entering'), 400);
  feed.scrollTop = feed.scrollHeight;
}

function setProcessing(state) {
  isProcessing = state;
  const indicator = document.getElementById('typingIndicator');
  const btn = document.getElementById('sendBtn');
  if (indicator) indicator.style.display = state ? 'flex' : 'none';
  if (btn) btn.disabled = state;
  const feed = document.getElementById('chatFeed');
  if (feed && state) feed.scrollTop = feed.scrollHeight;
}

async function speakText(text) {
  const cleanText = text.replace(/\*\*/g, '').replace(/\*/g, '');
  if (!settings.fishModelId || !settings.workerUrl) {
    browserTTS(cleanText);
    return;
  }
  try {
    const res = await fetch(`${settings.workerUrl}/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: cleanText, voice_id: settings.fishModelId })
    });
    if (!res.ok) throw new Error('TTS fetch failed');
    const arrayBuffer = await res.arrayBuffer();
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioCtx.destination);
    source.start(0);
  } catch (err) {
    console.error('Fish Audio failed, fallback to browser TTS', err);
    browserTTS(cleanText);
  }
}

function browserTTS(text) {
  if (!window.speechSynthesis) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.85;
  utterance.pitch = 0.65;
  window.speechSynthesis.speak(utterance);
}

function openSettings() {
  document.getElementById('workerUrl').value = settings.workerUrl || '';
  document.getElementById('fishModelId').value = settings.fishModelId || '';
  document.getElementById('settingsModal')?.classList.add('active');
}

function closeSettings() {
  document.getElementById('settingsModal')?.classList.remove('active');
}

function closeSettingsOnOverlay(e) {
  if (e.target.id === 'settingsModal') closeSettings();
}

function clearChat() {
  if (confirm('Protocol requires confirmation: Erase active memory banks?')) {
    chatHistory = [];
    saveChatHistory();
    const feed = document.getElementById('chatFeed');
    if (feed) feed.innerHTML = '';
    appendMessage('bt', 'Memory cleared. Ready for new mission, Pilot.', false, true);
    showToast('Memory banks wiped.');
  }
}

function clearAllMemory() {
  if (confirm('WARNING: This will erase all configuration and chat history. Proceed?')) {
    localStorage.removeItem('bt_settings_v2');
    localStorage.removeItem('bt_chat_history_v2');
    settings = { workerUrl: '', fishModelId: '' };
    chatHistory = [];
    closeSettings();
    showToast('Factory reset complete.');
    setTimeout(() => window.location.reload(), 1500);
  }
}

function handleKeyDown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}
