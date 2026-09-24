const STORAGE_KEY = 'paste_probe_draft_v1';

function describe(value) {
  const text = typeof value === 'string' ? value : '';
  return {
    draft: text,
    preview: text || '还没有收到内容。',
    length: Array.from(text).length,
    lines: text.split(/\r\n|\r|\n/).filter((line) => line.trim()).length,
  };
}

Page({
  data: describe(''),

  onLoad() {
    try {
      this.setData(describe(wx.getStorageSync(STORAGE_KEY) || ''));
    } catch (error) {
      wx.showToast({ title: '本机读取失败', icon: 'none' });
    }
  },

  onInput(event) {
    // WeChat handles native long-press paste. Observe only its resulting value.
    const value = event.detail.value || '';
    this.setData(describe(value));
    try {
      wx.setStorageSync(STORAGE_KEY, value);
    } catch (error) {
      wx.showToast({ title: '本机保存失败', icon: 'none' });
    }
  },

  clearDraft() {
    this.setData(describe(''));
    try {
      wx.removeStorageSync(STORAGE_KEY);
    } catch (error) {
      wx.showToast({ title: '清空失败', icon: 'none' });
    }
  },
});
