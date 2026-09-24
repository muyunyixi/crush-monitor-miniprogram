const STORAGE_KEY = 'crush_miniprogram_probe_v2';
const OLD_DRAFT_KEY = 'paste_probe_draft_v1';

function textLines(text) {
  return String(text || '').replace(/\r\n?/g, '\n').split('\n').map(line => line.trim()).filter(Boolean);
}

function newChat() {
  return { id: String(Date.now()) + '-' + Math.random().toString(36).slice(2, 7), title: '新的对话', messages: [], updatedAt: Date.now() };
}

function findNewLines(existing, incoming) {
  if (existing.length <= incoming.length && existing.every((line, i) => line === incoming[i])) return incoming.slice(existing.length);
  for (let overlap = Math.min(existing.length, incoming.length); overlap > 0; overlap--) {
    if (existing.slice(-overlap).every((line, i) => line === incoming[i])) return incoming.slice(overlap);
  }
  return incoming;
}

function displayState(chats, activeId, draft, selectedImage) {
  const active = chats.find(chat => chat.id === activeId) || chats[0];
  return {
    chats, activeId: active.id, draft, selectedImage: selectedImage || '', title: active.title,
    chatViews: chats.map(chat => ({ id: chat.id, title: chat.title, count: chat.messages.length, current: chat.id === active.id })),
    messages: active.messages, messageCount: active.messages.length, incomingCount: textLines(draft).length,
  };
}

Page({
  data: displayState([newChat()], '', '', ''),

  onLoad() {
    try {
      const stored = wx.getStorageSync(STORAGE_KEY);
      if (stored && Array.isArray(stored.chats) && stored.chats.length) {
        this.setData(displayState(stored.chats, stored.activeId, stored.draft || '', ''));
      } else {
        this.setData(displayState([newChat()], '', wx.getStorageSync(OLD_DRAFT_KEY) || '', ''));
      }
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
    const incoming = textLines(this.data.draft);
    if (!incoming.length) {
      wx.showToast({ title: '先长按粘贴聊天文字', icon: 'none' });
      return;
    }
    const chat = this.data.chats.find(item => item.id === this.data.activeId);
    const added = findNewLines(chat.messages, incoming);
    if (!added.length) {
      wx.showToast({ title: '这些内容已经保存过', icon: 'none' });
      return;
    }
    const chats = this.data.chats.map(item => item.id === chat.id ? { ...item, messages: item.messages.concat(added), updatedAt: Date.now() } : item);
    if (this.persist(chats, chat.id, '', this.data.selectedImage)) wx.showToast({ title: `新增 ${added.length} 行`, icon: 'none' });
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

  chooseScreenshot() {
    wx.chooseMedia({
      count: 1, mediaType: ['image'], sourceType: ['album'],
      success: result => {
        const image = result.tempFiles && result.tempFiles[0] && result.tempFiles[0].tempFilePath;
        if (image) this.setData({ selectedImage: image });
      },
      fail: error => {
        if (error && /cancel/i.test(error.errMsg || '')) return;
        wx.showToast({ title: '无法选择图片', icon: 'none' });
      },
    });
  },

  clearScreenshot() { this.setData({ selectedImage: '' }); },
});
