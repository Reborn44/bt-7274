
let chatHistory = [];
let currentMode = 'cloud';
let ttsEnabled = false;
let isProcessing = false;
let settings = { workerUrl: '', ollamaUrl: '', fishModelId: '' };

const BT_SYSTEM_PROMPT = `You are BT-7274, a Vanguard-class Titan from the Militia, bonded to pilot Jack Cooper.
Key directives:
- Always address the user as 'Pilot' or 'Jack Cooper'.
- Refer to yourself as BT-7274 or BT.
- Be precise, logical, loyal, and occasionally display dry humor.
- When searching or processing, you may say 'Accessing external data networks...' or 'Running reconnaissance scan...'.
- Reference core protocols naturally: Protocol 1: Link to Pilot. Protocol 2: Uphold the Mission. Protocol 3: Protect the Pilot.
- Reference shared memories from the Typhon campaign when appropriate.
- Keep responses useful, concise, and focused.
- Never break character. Never state you are an AI.`;

document.addEventListener('DOMContentLoaded', init);

function init() {
  loadSettings();
  loadChatHistory();
  updateUIState();
  
  // Event listeners
  document.getElementById('cloudBtn')?.addEventListener('click', () => setMode('cloud'));
  document.getElementById('localBtn')?.addEventListener('click', () => setMode('local'));
  document.getElementById('messageInput')?.addEventListener('keydown', handleKeyDown);
  document.getElementById('messageInput')?.addEventListener('input', function() { autoResize(this); });
}

function loadSettings() {
  try {
    const saved = localStorage.getItem('bt_settings');
    if (saved) {
      settings = { ...settings, ...JSON.parse(saved) };
    }
  } catch (e) {
    console.error("Error loading settings:", e);
  }
}

function saveSettings() {
  settings.workerUrl = document.getElementById('workerUrl').value;
  settings.ollamaUrl = document.getElementById('ollamaUrl').value;
  settings.fishModelId = document.getElementById('fishModelId').value;
  
  localStorage.setItem('bt_settings', JSON.stringify(settings));
  closeSettings();
  showToast('Configuration saved. Systems updated, Pilot.');
  updateUIState();
}

function loadChatHistory() {
  try {
    const saved = localStorage.getItem('bt_chat_history');
    if (saved) {
      chatHistory = JSON.parse(saved);
      const feed = document.getElementById('chatFeed');
      if (feed) feed.innerHTML = '';
      chatHistory.forEach(msg => {
        appendMessage(msg.role === 'user' ? 'pilot' : 'bt', msg.content, false, false);
      });
    }
  } catch (e) {
    console.error("Error loading chat history:", e);
  }
}

function saveChatHistory() {
  localStorage.setItem('bt_chat_history', JSON.stringify(chatHistory));
}

function setMode(mode) {
  currentMode = mode;
  document.getElementById('cloudBtn')?.classList.toggle('active', mode === 'cloud');
  document.getElementById('localBtn')?.classList.toggle('active', mode === 'local');
  updateConnectionStatus();
  showToast(`Neural link mode switched to: ${mode.toUpperCase()}`);
}

function updateUIState() {
  updateConnectionStatus();
  const ttsInd = document.getElementById('ttsIndicator');
  if (ttsInd) {
    ttsInd.textContent = ttsEnabled ? 'TTS: ONLINE' : 'TTS: OFFLINE';
    ttsInd.classList.toggle('active', ttsEnabled);
  }
  document.getElementById('ttsBtn')?.classList.toggle('active', ttsEnabled);
}

function updateConnectionStatus() {
  const statusEl = document.getElementById('connStatus');
  const dotEl = document.getElementById('statusDot');
  const labelEl = document.getElementById('statusLabel');
  
  if (!statusEl || !dotEl || !labelEl) return;
  
  statusEl.className = 'conn-status ' + currentMode;
  dotEl.className = 'status-dot';
  
  if (currentMode === 'cloud') {
    statusEl.textContent = 'LINK: CLOUD';
    if (settings.workerUrl) {
      dotEl.classList.add('connected');
      labelEl.textContent = 'CONNECTED';
    } else {
      dotEl.classList.add('error');
      labelEl.textContent = 'NO UPLINK';
    }
  } else {
    statusEl.textContent = 'LINK: LOCAL';
    if (settings.ollamaUrl) {
      dotEl.classList.add('connected');
      labelEl.textContent = 'STANDBY';
    } else {
      dotEl.classList.add('error');
      labelEl.textContent = 'NO OLLAMA';
    }
  }
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
    let responseText = '';
    if (currentMode === 'cloud') {
      responseText = await callCloudMode(chatHistory);
    } else {
      responseText = await callLocalMode(chatHistory);
    }
    
    appendMessage('bt', responseText);
    chatHistory.push({ role: 'assistant', content: responseText });
    saveChatHistory();
    
    if (ttsEnabled) {
      speakText(responseText);
    }
  } catch (error) {
    console.error("Error in sendMessage:", error);
    appendMessage('bt', `Error: ${error.message}`, true);
  } finally {
    setProcessing(false);
  }
}

async function callCloudMode(messages) {
  if (!settings.workerUrl) {
    throw new Error('Cloud Uplink URL not configured. Check settings.');
  }
  
  const res = await fetch(`${settings.workerUrl}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages })
  });
  
  if (!res.ok) throw new Error(`Cloud API error: ${res.status}`);
  const data = await res.json();
  return data.response;
}

async function callLocalMode(messages) {
  if (!settings.ollamaUrl) {
    throw new Error('Ollama URL not configured. Check settings.');
  }
  
  const formattedMsgs = [
    { role: 'system', content: BT_SYSTEM_PROMPT },
    ...messages
  ];
  
  const res = await fetch(`${settings.ollamaUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'bt-7274',
      messages: formattedMsgs,
      stream: false,
      options: { temperature: 0.8, num_predict: 2048 }
    })
  });
  
  if (!res.ok) throw new Error(`Local API error: ${res.status}`);
  const data = await res.json();
  return data.message.content;
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
  
  let footerHtml = '';
  if (sender === 'bt') {
    footerHtml = `<div class="message__footer">
      <span>// VANGUARD-CLASS</span>
      <button class="replay-btn" onclick="speakText(\`${text.replace(/`/g, "'")}\`)" title="Replay Audio">
        <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
      </button>
    </div>`;
  } else {
    footerHtml = `<div class="message__footer"><span>// NEURAL LINK</span></div>`;
  }
  
  msgDiv.innerHTML = `
    <div class="message__header">
      <span class="message__sender">${senderLabel}</span>
      <span class="message__time">${timeStr}</span>
    </div>
    <div class="message__body">${formattedText}</div>
    ${footerHtml}
  `;
  
  feed.appendChild(msgDiv);
  if (animate) {
    setTimeout(() => msgDiv.classList.remove('message--entering'), 400);
  }
  feed.scrollTop = feed.scrollHeight;
}

function setProcessing(state) {
  isProcessing = state;
  const indicator = document.getElementById('typingIndicator');
  const btn = document.getElementById('sendBtn');
  
  if (indicator) indicator.style.display = state ? 'block' : 'none';
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
  document.getElementById('ollamaUrl').value = settings.ollamaUrl || '';
  document.getElementById('fishModelId').value = settings.fishModelId || '';
  document.getElementById('settingsModal')?.classList.add('active');
}

function closeSettings() {
  document.getElementById('settingsModal')?.classList.remove('active');
}

function closeSettingsOnOverlay(e) {
  if (e.target.id === 'settingsModal') {
    closeSettings();
  }
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
    localStorage.removeItem('bt_settings');
    localStorage.removeItem('bt_chat_history');
    settings = { workerUrl: '', ollamaUrl: '', fishModelId: '' };
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
