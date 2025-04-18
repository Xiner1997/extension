// 存储高亮文本的数组
let highlights = [];
let lastSelectedText = '';

// 检查高亮是否重叠
function checkHighlightOverlap(text, range) {
    const highlightElements = document.querySelectorAll('.highlight-text');
    for (const element of highlightElements) {
        const elementRange = document.createRange();
        elementRange.selectNodeContents(element);
        
        // 检查范围是否重叠
        if (range.compareBoundaryPoints(Range.START_TO_END, elementRange) > 0 &&
            range.compareBoundaryPoints(Range.END_TO_START, elementRange) < 0) {
            // 比较文本长度，返回更长的文本的ID
            const existingText = element.dataset.originalText || element.textContent;
            return existingText.length >= text.length ? element.id : null;
        }
    }
    return null;
}

// 从存储中加载高亮数据
function loadHighlights() {
    chrome.storage.local.get(['highlights'], function(result) {
        if (result.highlights) {
            highlights = result.highlights;
            // 只加载当前页面的高亮
            const currentUrl = window.location.href;
            const currentPageHighlights = highlights.filter(h => h.url === currentUrl);
            
            // 等待页面完全加载
            if (document.readyState === 'complete') {
                applyHighlights(currentPageHighlights);
            } else {
                window.addEventListener('load', () => {
                    applyHighlights(currentPageHighlights);
                });
            }
        }
    });
}

// 应用高亮到页面
function applyHighlights(highlightsToApply) {
    highlightsToApply.forEach(highlight => {
        // 在页面中查找并高亮文本
        const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );

        let node;
        while (node = walker.nextNode()) {
            if (node.textContent.includes(highlight.text)) {
                const range = document.createRange();
                const startIndex = node.textContent.indexOf(highlight.text);
                range.setStart(node, startIndex);
                range.setEnd(node, startIndex + highlight.text.length);
                
                try {
                    const span = document.createElement('span');
                    span.className = 'highlight-text';
                    span.id = highlight.id;
                    span.style.cssText = `
                        background-color: #ffff00;
                        cursor: pointer;
                        display: inline;
                        padding: 0;
                        margin: 0;
                        border-radius: 2px;
                    `;
                    span.dataset.originalText = highlight.text;
                    
                    range.surroundContents(span);
                } catch (e) {
                    console.error('高亮应用失败:', e);
                }
            }
        }
    });
}

// 高亮文本的函数
function highlightText(text, highlightId) {
    // 获取当前选中的文本范围
    const selection = window.getSelection();
    if (!selection.rangeCount) return;

    const range = selection.getRangeAt(0);
    
    // 检查是否与现有高亮重叠
    const existingHighlightId = checkHighlightOverlap(text, range);
    if (existingHighlightId) {
        // 如果重叠且现有高亮更长，则不创建新高亮
        return;
    }

    const span = document.createElement('span');
    span.className = 'highlight-text';
    span.id = highlightId;
    span.style.cssText = `
        background-color: #ffff00;
        cursor: pointer;
        display: inline;
        padding: 0;
        margin: 0;
        border-radius: 2px;
    `;
    span.dataset.originalText = text;

    try {
        // 使用 DocumentFragment 来安全地替换内容
        const fragment = range.extractContents();
        span.appendChild(fragment);
        range.insertNode(span);

        // 清除选择
        selection.removeAllRanges();
    } catch (e) {
        console.error('高亮创建失败:', e);
    }
}

// 保存高亮数据到存储
function saveHighlights() {
    chrome.storage.local.set({ highlights: highlights });
}

// 页面加载时加载高亮数据
if (document.readyState === 'complete') {
    loadHighlights();
} else {
    window.addEventListener('load', loadHighlights);
}

// 创建高亮
function createHighlight(text) {
    if (!text || text.trim() === '') return;
    
    const highlightId = 'highlight-' + Date.now();
    
    // 保存高亮信息
    const highlightInfo = {
        id: highlightId,
        text: text,
        timestamp: new Date().toISOString(),
        url: window.location.href
    };
    
    try {
        // 应用高亮
        highlightText(text, highlightId);
        
        // 添加到高亮列表
        highlights.push(highlightInfo);
        saveHighlights();
        
        // 发送消息给popup更新列表
        chrome.runtime.sendMessage({
            type: 'NEW_HIGHLIGHT',
            data: highlightInfo
        });
    } catch (error) {
        console.error('高亮失败:', error);
    }
}

// 监听文本选择事件
document.addEventListener('mouseup', function(event) {
    const selection = window.getSelection();
    const selectedText = selection.toString().trim();
    
    // 保存最后选中的文本
    if (selectedText !== '') {
        lastSelectedText = selectedText;
    }
});

// 监听点击事件
document.addEventListener('click', function(event) {
    // 如果点击的是高亮文本，不做处理
    if (event.target.classList.contains('highlight-text')) {
        return;
    }
    
    // 如果有选中的文本，创建高亮
    if (lastSelectedText) {
        createHighlight(lastSelectedText);
        lastSelectedText = ''; // 清空选中文本
    }
});

// 监听来自popup的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'SCROLL_TO_HIGHLIGHT') {
        const element = document.getElementById(message.highlightId);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth' });
            // 添加闪烁效果
            element.style.animation = 'flash 1s';
            setTimeout(() => {
                element.style.animation = '';
            }, 1000);
        }
    } else if (message.type === 'CLEAR_HIGHLIGHTS') {
        // 清除当前页面的所有高亮
        const currentUrl = window.location.href;
        const highlightElements = document.querySelectorAll('.highlight-text');
        highlightElements.forEach(element => {
            // 恢复原始文本
            const textNode = document.createTextNode(element.dataset.originalText || element.textContent);
            element.parentNode.replaceChild(textNode, element);
        });
        // 从列表中移除当前页面的高亮
        highlights = highlights.filter(h => h.url !== currentUrl);
        saveHighlights();
    } else if (message.type === 'DELETE_HIGHLIGHT') {
        // 删除单个高亮
        const element = document.getElementById(message.highlightId);
        if (element) {
            // 恢复原始文本
            const textNode = document.createTextNode(element.dataset.originalText || element.textContent);
            element.parentNode.replaceChild(textNode, element);
            
            // 从列表中移除
            highlights = highlights.filter(h => h.id !== message.highlightId);
            saveHighlights();
        }
    } else if (message.type === 'HIGHLIGHT_SELECTED_TEXT') {
        // 处理右键菜单的高亮请求
        createHighlight(message.text);
    }
}); 