// 存储高亮列表
let highlights = [];
let currentEditingHighlight = null;
let currentUrl = '';

// 初始化
document.addEventListener('DOMContentLoaded', function() {
    const highlightsList = document.getElementById('highlightsList');
    const clearButton = document.getElementById('clearHighlights');
    const editModal = document.getElementById('editModal');
    const titleInput = document.getElementById('titleInput');
    const saveTitleButton = document.getElementById('saveTitle');
    const closeButton = document.querySelector('.close-button');
    
    // 获取当前标签页的URL
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        currentUrl = tabs[0].url;
        // 从存储中加载高亮数据
        chrome.storage.local.get(['highlights'], function(result) {
            if (result.highlights) {
                highlights = result.highlights;
                updateHighlightsList();
            }
        });
    });
    
    // 监听清除按钮点击事件
    clearButton.addEventListener('click', () => {
        if (confirm('确定要清除当前页面的所有高亮吗？')) {
            // 只清除当前页面的高亮
            highlights = highlights.filter(h => h.url !== currentUrl);
            chrome.storage.local.set({ highlights: highlights });
            updateHighlightsList();
            
            // 发送消息给content script清除高亮
            chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    type: 'CLEAR_HIGHLIGHTS'
                });
            });
        }
    });
    
    // 监听来自content script的消息
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'NEW_HIGHLIGHT') {
            highlights.push(message.data);
            chrome.storage.local.set({ highlights: highlights });
            updateHighlightsList();
        } else if (message.type === 'HIGHLIGHT_CLICKED') {
            // 当高亮被点击时，滚动到对应位置
            chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    type: 'SCROLL_TO_HIGHLIGHT',
                    highlightId: message.highlightId
                });
            });
        }
    });
    
    // 显示编辑模态框
    function showEditModal(highlight) {
        currentEditingHighlight = highlight;
        titleInput.value = highlight.title || '';
        editModal.style.display = 'block';
    }
    
    // 隐藏编辑模态框
    function hideEditModal() {
        editModal.style.display = 'none';
        currentEditingHighlight = null;
    }
    
    // 保存标题
    saveTitleButton.addEventListener('click', () => {
        if (currentEditingHighlight) {
            currentEditingHighlight.title = titleInput.value.trim();
            chrome.storage.local.set({ highlights: highlights });
            updateHighlightsList();
            hideEditModal();
        }
    });
    
    // 关闭模态框
    closeButton.addEventListener('click', hideEditModal);
    
    // 点击模态框外部关闭
    window.addEventListener('click', (event) => {
        if (event.target === editModal) {
            hideEditModal();
        }
    });
    
    // 更新高亮列表
    function updateHighlightsList() {
        highlightsList.innerHTML = '';
        // 只显示当前页面的高亮
        const currentPageHighlights = highlights.filter(h => h.url === currentUrl);
        
        if (currentPageHighlights.length === 0) {
            highlightsList.innerHTML = '<div class="no-highlights">当前页面没有高亮文本</div>';
            return;
        }
        
        currentPageHighlights.forEach(highlight => {
            const item = document.createElement('div');
            item.className = 'highlight-item';
            item.innerHTML = `
                <div class="highlight-content">
                    ${highlight.title ? 
                        `<div class="highlight-title">${highlight.title}</div>` : 
                        `<div class="highlight-text">${highlight.text}</div>`
                    }
                    <div class="highlight-time">${new Date(highlight.timestamp).toLocaleString()}</div>
                </div>
                <div class="highlight-actions">
                    <button class="edit-button" title="编辑标题">✎</button>
                    <button class="delete-button" title="删除高亮">×</button>
                </div>
            `;
            
            // 点击时滚动到对应位置
            item.querySelector('.highlight-content').addEventListener('click', () => {
                chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                    chrome.tabs.sendMessage(tabs[0].id, {
                        type: 'SCROLL_TO_HIGHLIGHT',
                        highlightId: highlight.id
                    });
                });
            });
            
            // 编辑按钮点击事件
            item.querySelector('.edit-button').addEventListener('click', (e) => {
                e.stopPropagation();
                showEditModal(highlight);
            });
            
            // 删除按钮点击事件
            item.querySelector('.delete-button').addEventListener('click', (e) => {
                e.stopPropagation();
                if (confirm('确定要删除这个高亮吗？')) {
                    // 从列表中移除
                    highlights = highlights.filter(h => h.id !== highlight.id);
                    chrome.storage.local.set({ highlights: highlights });
                    updateHighlightsList();
                    
                    // 发送消息给content script删除高亮
                    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                        chrome.tabs.sendMessage(tabs[0].id, {
                            type: 'DELETE_HIGHLIGHT',
                            highlightId: highlight.id
                        });
                    });
                }
            });
            
            highlightsList.appendChild(item);
        });
    }
}); 