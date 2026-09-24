const STORAGE_KEY = 'crush_miniprogram_probe_v2';
const OLD_DRAFT_KEY = 'paste_probe_draft_v1';
const WORKER_URL_KEY = 'mini_ocr_worker_url_v1';
const DEFAULT_WORKER_URL = 'https://crush-monitor-mobile-api.muyunyixi.cloud';
const { parseChat, normalizeSaved, findNewMessages } = require('./parser');
const { parseScreenshot } = require('./screenshot-parser');

function newChat() {
  return { id: String(Date.now()) + '-' + Math.random().toString(36).slice(2, 7), title: '新的对话', messages: [], updatedAt: Date.now() };
}

function displayState(chats, activeId, draft, selectedImage) {
  const active = chats.find(chat => chat.id === activeId) || chats[0];
  return {
    chats, activeId: active.id, draft, selectedImage: selectedImage || '', title: active.title,
    chatViews: chats.map(chat => ({ id: chat.id, title: chat.title, count: chat.messages.length, current: chat.id === active.id })),
    messages: active.messages, messageCount: active.messages.length, incomingCount: parseChat(draft).length,
  };
}

Page({
  data: { ...displayState([newChat()], '', '', ''), workerUrl: DEFAULT_WORKER_URL, ocrStatus: '', processing: false },

  onLoad() {
    try {
      const stored = wx.getStorageSync(STORAGE_KEY);
      if (stored && Array.isArray(stored.chats) && stored.chats.length) {
        const chats = stored.chats.map(chat => ({ ...chat, messages: normalizeSaved(chat.messages || []) }));
        this.persist(chats, stored.activeId, stored.draft || '', '');
      } else {
        this.setData(displayState([newChat()], '', wx.getStorageSync(OLD_DRAFT_KEY) || '', ''));
      }
      this.setData({ workerUrl: wx.getStorageSync(WORKER_URL_KEY) || DEFAULT_WORKER_URL });
    } catch (error) {
      wx.showToast({ title: '本机读取失败', icon: 'none' });
    }
  },

  persist(chats, activeId, draft, selectedImage) {
    try {
      wx.setStorageSync(STORAGE_KEY, { chats, activeId, draft });
      this.setData(displayState(chats, activeId, draft, selectedImage));
      return true;
    } catch (error) {
      wx.showToast({ title: '本机空间不足，保存失败', icon: 'none' });
      return false;
    }
  },

  onInput(event) {
    this.persist(this.data.chats, this.data.activeId, event.detail.value || '', this.data.selectedImage);
  },

  onTitle(event) { this.setData({ title: event.detail.value || '' }); },

  saveTitle() {
    const title = (this.data.title || '').trim() || '新的对话';
    const chats = this.data.chats.map(chat => chat.id === this.data.activeId ? { ...chat, title, updatedAt: Date.now() } : chat);
    this.persist(chats, this.data.activeId, this.data.draft, this.data.selectedImage);
  },

  appendDraft() {
    const incoming = parseChat(this.data.draft);
    if (!incoming.length) {
      wx.showToast({ title: '先长按粘贴聊天文字', icon: 'none' });
      return;
    }
    const chat = this.data.chats.find(item => item.id === this.data.activeId);
    const added = findNewMessages(chat.messages, incoming);
    if (!added.length) {
      wx.showToast({ title: '这些内容已经保存过', icon: 'none' });
      return;
    }
    const chats = this.data.chats.map(item => item.id === chat.id ? { ...item, messages: item.messages.concat(added), updatedAt: Date.now() } : item);
    if (this.persist(chats, chat.id, '', this.data.selectedImage)) wx.showToast({ title: `新增 ${added.length} 条消息`, icon: 'none' });
  },

  newConversation() {
    const create = () => {
      const chat = newChat();
      this.persist([chat].concat(this.data.chats), chat.id, '', '');
    };
    if (!this.data.draft.trim()) return create();
    wx.showModal({ title: '还没保存输入的文字', content: '先保存新增记录，或者丢弃草稿后新建对话。', confirmText: '丢弃草稿', success: result => { if (result.confirm) create(); } });
  },

  selectConversation(event) {
    const targetId = event.currentTarget.dataset.id;
    if (targetId === this.data.activeId) return;
    const select = () => this.persist(this.data.chats, targetId, '', '');
    if (!this.data.draft.trim()) return select();
    wx.showModal({ title: '还没保存输入的文字', content: '先保存新增记录，或者丢弃草稿后切换对话。', confirmText: '丢弃草稿', success: result => { if (result.confirm) select(); } });
  },

  onWorkerUrl(event) {
    const workerUrl = (event.detail.value || '').trim();
    this.setData({ workerUrl });
    try { wx.setStorageSync(WORKER_URL_KEY, workerUrl); } catch { /* user may retry typing */ }
  },

  async chooseScreenshot() {
    if (this.data.processing) return;
    const baseUrl = this.data.workerUrl.trim().replace(/\/+$/, '');
    if (!/^https:\/\/[^/\s?#]+(?:\/[^?#]*)?$/i.test(baseUrl)) {
      this.setData({ ocrStatus: '请先填写现有 Worker 的 HTTPS 地址。' });
      return;
    }
    let files;
    try {
      const selection = await new Promise((resolve, reject) => wx.chooseMedia({
        count: 4, mediaType: ['image'], sourceType: ['album'], success: resolve, fail: reject,
      }));
      files = selection.tempFiles || [];
    } catch (error) {
      if (!/cancel/i.test(error.errMsg || '')) this.setData({ ocrStatus: '无法选择图片，请重试。' });
      return;
    }
    this.setData({ processing: true, ocrStatus: `已选择 ${files.length} 张，准备识字…` });
    let succeeded = 0;
    let uncertain = 0;
    let pendingUploadPath = '';
    try {
      for (let i = 0; i < files.length; i++) {
        this.setData({ ocrStatus: `识别第 ${i + 1} / ${files.length} 张…` });
        const login = await new Promise((resolve, reject) => wx.login({ success: resolve, fail: reject }));
        if (!login.code) throw new Error('微信登录失败，请重新打开小程序。');
        pendingUploadPath = files[i].tempFilePath;
        const response = await new Promise((resolve, reject) => wx.uploadFile({
          url: `${baseUrl}/api/mini/ocr`, filePath: pendingUploadPath, name: 'image',
          formData: { loginCode: login.code }, success: resolve, fail: reject,
        }));
        pendingUploadPath = '';
        let data;
        try { data = JSON.parse(response.data); } catch { throw new Error('服务器没有返回有效识字结果。'); }
        if (response.statusCode !== 200) throw new Error(data.error || `接口返回 ${response.statusCode}`);
        const info = await new Promise((resolve, reject) => wx.getImageInfo({ src: files[i].tempFilePath, success: resolve, fail: reject }));
        const parsed = parseScreenshot(data.items, info.width, info.height);
        uncertain += parsed.uncertain;
        if (parsed.unavailable) throw new Error('识字服务没有提供文字坐标，无法可靠区分左右。请换一张清晰截图或粘贴文字。');
        const text = parsed.text.trim();
        if (!text) continue;
        if (parsed.title) {
          const current = this.data.chats.find(chat => chat.id === this.data.activeId);
          if (current && current.title === '新的对话') {
            const renamed = this.data.chats.map(chat => chat.id === current.id ? { ...chat, title: parsed.title } : chat);
            this.persist(renamed, this.data.activeId, this.data.draft, '');
          }
        }
        const draft = this.data.draft ? `${this.data.draft.replace(/\s+$/, '')}\n${text}` : text;
        if (!this.persist(this.data.chats, this.data.activeId, draft, '')) throw new Error('本机保存空间不足。');
        succeeded++;
      }
      this.setData({ ocrStatus: succeeded ? `已整理 ${succeeded} 张截图的左右消息${uncertain ? `，其中 ${uncertain} 行待确认发言人` : ''}。请校对文字和分组后保存。` : '没有识别到聊天区文字，请换一张清晰截图。' });
    } catch (error) {
      const message = error.message || error.errMsg || '网络连接失败';
      let diagnosis = '';
      if (pendingUploadPath && /uploadFile:fail/i.test(message)) {
        this.setData({ ocrStatus: '识字请求中断，正在检测截图上传链路…' });
        try {
          const check = await new Promise((resolve, reject) => wx.uploadFile({
            url: `${baseUrl}/api/mini/upload-check`, filePath: pendingUploadPath,
            name: 'image', success: resolve, fail: reject,
          }));
          diagnosis = check.statusCode === 200 && JSON.parse(check.data).stage === 'worker-reached'
            ? '上传链路正常，识字接口请求中断。'
            : `自检接口返回 ${check.statusCode}，请检查 Worker 最新部署。`;
        } catch (checkError) {
          diagnosis = `上传自检也失败：${checkError.errMsg || checkError.message || '连接中断'}。`;
        }
      }
      this.setData({ ocrStatus: `已识别 ${succeeded} 张，随后失败：${message}。${diagnosis}` });
    } finally {
      this.setData({ processing: false });
    }
  },
});
