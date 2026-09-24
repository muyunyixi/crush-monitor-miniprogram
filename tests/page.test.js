const test=require('node:test');const assert=require('node:assert/strict');
test('switching objects retains separate drafts, and appending touches only the original object',async()=>{
 const data=new Map();global.wx={getStorageSync:k=>data.get(k),setStorageSync:(k,v)=>data.set(k,structuredClone(v)),showModal:()=>{},showToast:()=>{}};
 global.Page=definition=>{global.pageDefinition=definition;};
 const path=require.resolve('../pages/index/index');delete require.cache[path];require(path);
 const page={...global.pageDefinition,setData(values){this.data={...this.data,...values};}};
 page.onLoad();page.newConversation();const first=page.state.activeId;
 page.onDraft({detail:{value:'我：第一段'}});page.flush();page.newConversation();const second=page.state.activeId;
 assert.notEqual(first,second);assert.equal(page.state.conversations.find(c=>c.id===first).draft,'我：第一段');
 page.onDraft({detail:{value:'对方：第二段'}});page.flush();page.openConversation({currentTarget:{dataset:{id:first}}});
 assert.equal(page.data.draft,'我：第一段');assert.equal(await page.archiveDraft(),true);
 assert.equal(page.state.conversations.find(c=>c.id===first).messages[0].text,'第一段');
 assert.equal(page.state.conversations.find(c=>c.id===second).draft,'对方：第二段');
});
test('splitting a batch keeps undo scoped to both derived messages',async()=>{
 const data=new Map();global.wx={getStorageSync:k=>data.get(k),setStorageSync:(k,v)=>data.set(k,structuredClone(v)),showModal:options=>options.success({confirm:true,content:'2'})};
 global.Page=definition=>{global.pageDefinition=definition;};const path=require.resolve('../pages/index/index');delete require.cache[path];require(path);
 const page={...global.pageDefinition,setData(values){this.data={...this.data,...values};}};page.onLoad();page.openConversation({currentTarget:{dataset:{id:page.state.activeId}}});
 page.onDraft({detail:{value:'我：你好朋友'}});await page.archiveDraft();const id=page.state.conversations[0].messages[0].id;
 page.splitMessage(id);assert.equal(page.state.conversations[0].messages.length,2);
 page.undoLastBatch();assert.equal(page.state.conversations[0].messages.length,0);
});
