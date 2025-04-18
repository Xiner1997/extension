// 后台服务脚本
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: 'highlightText',
        title: '高亮选中文本',
        contexts: ['selection']
    });
    console.log('文本高亮工具已安装');
});

// 监听右键菜单点击事件
chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'highlightText') {
        // 向content script发送消息
        chrome.tabs.sendMessage(tab.id, {
            type: 'HIGHLIGHT_SELECTED_TEXT',
            text: info.selectionText
        });
    }
}); 